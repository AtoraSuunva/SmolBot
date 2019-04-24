module.exports.config = {
  name: 'automod',
  invokers: ['automod'],
  help: 'automod',
  expandedHelp: 'An automoderation module, allows for chat filtering using a set of "rules"\n`everyone` => @everyone/here (or roles named everyone/here) mentions\n`forbidden` => List of forbidden characters to post\n`repeats` => Repeated messages\n`ad` => Discord invites (excluding the current server)\n`blacklist` => Blacklisted words\n`embeds` => Repeated embeds\n`regex` => Messages matching a regex\nRules have a max strikes, time before strikes expire, and (optionally) parameters',
  usage: ['View rules', 'automod view', 'Create a rule', 'automod add blacklist 3 15 butt nya', 'Remove a rule', 'automod remove 3']
}

const EveryoneRule = require('./Rules/EveryoneRule.js')
const ForbiddenChars = require('./Rules/ForbiddenCharsRule.js')
const RepeatsRule = require('./Rules/RepeatsRule.js')
const AdRule = require('./Rules/AdRule.js')
const BlacklistRule = require('./Rules/BlacklistRule.js')
const EmbedsRule = require('./Rules/EmbedsRule.js')
const RegexRule = require('./Rules/RegexRule.js')

const Rules = {
  'everyone': EveryoneRule,
  'forbidden': ForbiddenChars,
  'repeats': RepeatsRule,
  'ad': AdRule,
  'blacklist': BlacklistRule,
  'embeds': EmbedsRule,
  'regex': RegexRule,
}

const automodConfig = new Map()
const activeRules = new Map()

/**
 * Must absolutely be called before anything happens
 * (Well, kinda. This loads all the rules and config settings from the database but automod *will* work without calling this)
 * (You just won't have any persistence from the last session)
 *
 * @param {Database} db The database to use to make queries, should be `bot.sleet.db` usually
 */
async function setupAutomodFromDatabase(db) {
  const dbConfig = await db.many('SELECT * FROM automod')

  automodConfig.clear()
  for (let v of dbConfig) {
    const {guild_id, ...data} = v
    automodConfig.set(guild_id, data)
  }

  const dbRules = await db.many('SELECT * from automod_rules')

  activeRules.clear()
  for (let v of dbRules) {
    const {guild_id, ...data} = v

    if (!activeRules.has(guild_id)) {
      activeRules.set(guild_id, [])
    }

    const rule = (Rules[data.rule_name])
      ? new Rules[data.rule_name](data.id, data.punishment, data.trigger_limit, data.timeout, data.params)
      : null

    if (rule) {
      activeRules.get(guild_id).push(rule)
    }
  }
}

/**
 * Adds a rule to the database, returning the id created
 */
function addRuleToDatabase(db, guild_id, rule_name, punishment, trigger_limit, timeout, params) {
  return db.one('INSERT INTO automod_rules (guild_id, rule_name, punishment, trigger_limit, timeout, params) '
                 + 'VALUES ($<guild_id>, $<rule_name>, $<punishment>, $<trigger_limit>, $<timeout>, $<params>) '
                 + 'RETURNING id',
                { guild_id, rule_name, punishment, trigger_limit, timeout, params }, r => r.id)
}

/**
 * Deletes a rule from the database based on id
 */
function deleteRuleFromDatabase(db, id) {
  return db.none('DELETE FROM automod_rules WHERE id = $1', [id])
}

const { roleban } = require('../mod/roleban.js')

module.exports.init = sleet => {
  setupAutomodFromDatabase(sleet.db)
}

module.exports.events = {}
module.exports.events.message = (bot, message) => {
  if (!message.guild) return

  if (!message.member.permissions.has('MANAGE_MESSAGES'))
    return message.channel.send('You need "Manage Messages" perms to use automod')

  const [cmd, opt, ...params] = bot.sleet.shlex(message)

  switch ((opt || '').toLowerCase()) {
    case 'view':
      viewRules(bot, message, params)
      break

    case 'add':
    case 'create':
      addRule(bot, message, params)
      break

    case 'remove':
    case 'rm':
      removeRule(bot, message, params)
      break

    default:
      message.channel.send('What do you want to do?\n`view`, `add`, `remove`')
  }
}

function viewRules(bot, message) {
  const rules = activeRules.get(message.guild.id)

  if (!rules) {
    message.channel.send('No rules are active on this server.')
  } else {
    message.channel.send('Active rules are:\n```py\n' +
      rules.map(r =>
        `[${r.id}] ${r.name} {${r.timeout / 1000} s}${r.parameters && r.parameters.length > 0 ? ' [' + r.parameters.join(', ') + ']' : ''} -> # ${r.punishment}`
      ).join('\n') + '\n```'
    )
  }
}

async function addRule(bot, message, params) {
  const rules = activeRules.get(message.guild.id)

  if (!rules) return

  let [name, punishment, limit, timeout, ...ruleParams] = params

  if (!name || !punishment || !limit || !timeout) {
    return message.channel.send('Missing parameters...\n`<name> <punishment> <limit> <timeout> [param1 param2 ... paramN]`')
  }

  name = name.toLowerCase()

  if (!Rules[name]) {
    return message.channel.send(`Invalid rule.\n\`${Object.keys(Rules).join(', ')}\``)
  }

  return message.channel.send(`\`${punishment} ${limit} ${timeout} ['${ruleParams.join("', '")}']\``)

  try {
    const id = await addRuleToDatabase(bot.sleet.db, name, punishment, limit, timeout, ruleParams)
    const newRule = new Rules[name](id, punishment, limit, timeout, ruleParams)
    activeRules.get(message.guild.id).push(newRule)
    message.channel.send('**New rule created:**\n' + newRule.name)
  } catch (e) {
    message.channel.send('**An error occured:**\n' + e.message)
  }
}

async function removeRule(bot, message, params) {
  const rules = activeRules.get(message.guild.id)

  if (!rules)
    return message.channel.send('There are no rules for you to remove.')

  const id = parseInt(params[0])

  if (Number.isNaN(id))
    return message.channel.send('You need to supply a valid rule ID.')

  const index = rules.findIndex(r => r.id === id)

  if (index === -1)
    return message.channel.send('That rule doesn\'t exist.')

  const r = rules.splice(index, 1)[0]

  if (r) {
    await removeRuleFromDatabase(bot.sleet.db, id)
    message.channel.send('Removed: \n```py\n' + `[${r.id}] ${r.name} {${r.timeout} s} -> # ${r.punishment}` + '\n```')
  } else {
    message.channel.send('Did not remove anything.')
  }
}

module.exports.events.everyMessage = async (bot, message) => {
  if (!message.guild || message.author.bot || message.editedTimestamp) return

  const rules = activeRules.get(message.guild.id)
  let prefix = true

  if (!message.member)
    message.member = await message.guild.fetchMember(message.author.id)

  // Automod does not apply if:
  //  - There are no automod rules
  //  - You have 'Manage Messages' perms
  //  - The member is higher than (or equal to) the bot
  if (!rules
      || message.member.permissions.has('MANAGE_MESSAGES')
      || message.member.highestRole.position >= message.guild.me.highestRole.position
     )
    return

  for (let r of rules) {
    let punishment = await r.filter(message), deletes, msg

    if (!punishment) continue

    if (Array.isArray(punishment)) {
      deletes = punishment[1]
      punishment = punishment[0]
    }

    //(null, 'delete', roleban', 'kick', 'ban', 'whisper: some message')
    // Can also be array of [punishment, [ids to delet]]
    switch((punishment + '').split(':')[0].toLowerCase()) {
      case 'delete':
        message.delete()
        break

      case 'roleban':
        const rolebanRole = automodConfig.get(message.guild.id).roleban_role
        if (message.member.roles.has(rolebanRole)) {
          // fuck them tbh
          message.channel.overwritePermissions(message.author, {SEND_MESSAGES: false})
          msg = `${bot.sleet.formatUser(message.author)} was silenced: *${r.name}*`
          prefix = false
        } else {
          // lmao constructing my own message
          roleban(bot, {channel: message.channel, author: bot.user, member: message.guild.me, guild: message.guild}, [message.member], rolebanRole, {silent: true})

          msg = `${bot.sleet.formatUser(message.author)} was rolebanned: *${r.name}*`
        }
        break

      case 'kick':
        if (message.member.kickable) {
          message.member.kick(r.name)
          msg = `${bot.sleet.formatUser(message.author)} was kicked: *${r.name}*`
        }
        break

      case 'ban':
        if (message.member.bannable) {
          message.member.ban({days: 1, reason: r.name})
          msg = `${bot.sleet.formatUser(message.author.tag)} was banned: *${r.name}*`
        }
        break

      case 'softban':
        if (message.member.bannable) {
          message.member.ban({days: 1, reason: r.name}).then(u => message.guild.unban(message.member))
          msg = `${bot.sleet.formatUser(message.author.tag)} was softbanned: *${r.name}*`
        }

      case 'whisper':
        const m = punishment.split(':').slice(1).join(':').trim()
        const member = message.member

        message.channel.send(message.author + ', ' + m, {autoDelete: false})
          .then(msg => {
            const original = msg.channel.permissionOverwrites.get(member.id)

            const a = msg.delete()
            const b = Promise.resolve(original)
            const c = msg.channel.overwritePermissions(member, {VIEW_CHANNEL: false}, `Whisper: ${m}`)

            return Promise.all([a, b, c])
          }).then(args => {
            const [delMsg, original, channel] = args
            const perms = channel.permissionOverwrites.get(member.id)

            if (perms)
              perms.delete('Hide whisper')

            if (original)
              channel.overwritePermissions(member, original.serialize(), 'Hide whisper')
          })

        break
    }

    if (deletes) {
      if (deletes.length === 1 && deletes[0].delete) {
        deletes[0].delete().catch(_=>{})
      } else if (deletes.length > 1) {
        message.channel.bulkDelete(deletes).catch(_=>{})
      }
    }

    if (msg) {
      message.channel.send(((prefix ? prepend[message.guild.id] : '') || '') + msg, {autoDelete: false})
    }

  }
}

function tag(t) {
  return `**${t.substring(0, t.length - 5)}**${t.substring(t.length - 5)}`
}

module.exports.config = {
  name: 'automod',
  invokers: ['automod'],
  help: 'automod',
  expandedHelp:
    'An automoderation module, allows for chat filtering using a set of "rules"\n`everyone` => @everyone/here (or roles named everyone/here) mentions\n`forbidden` => List of forbidden characters to post\n`repeats` => Repeated messages\n`ad` => Discord invites (excluding the current server)\n`blacklist` => Blacklisted words\n`embeds` => Repeated embeds\n`regex` => Messages matching a regex\nRules have a max strikes, time before strikes expire, and (optionally) parameters',
  usage: [
    'View rules',
    'automod view',
    'Create a rule',
    'automod add blacklist roleban 3 15 "some words" nya',
    'Delete a rule',
    'automod delete 3',
  ],
}

function weakRequire(mod) {
  try {
    return require(mod)
  } catch {
    return null
  }
}

const modlog = weakRequire('../mod/modlog.js') || { createLog() {} }

const EveryoneRule = require('./Rules/EveryoneRule.js')
const ForbiddenChars = require('./Rules/ForbiddenCharsRule.js')
const RepeatsRule = require('./Rules/RepeatsRule.js')
const AdRule = require('./Rules/AdRule.js')
const BlacklistRule = require('./Rules/BlacklistRule.js')
const EmbedsRule = require('./Rules/EmbedsRule.js')
const RegexRule = require('./Rules/RegexRule.js')
const EmojiOnlyRule = require('./Rules/EmojiOnlyRule.js')
const PressureRule = require('./Rules/PressureRule.js')

const Rules = {
  everyone: EveryoneRule,
  forbidden: ForbiddenChars,
  repeats: RepeatsRule,
  ad: AdRule,
  blacklist: BlacklistRule,
  embeds: EmbedsRule,
  regex: RegexRule,
  emojionly: EmojiOnlyRule,
  pressure: PressureRule,
}

const RulesDocs = `
Parameters are shlexed, and should be specified as following:
\`automod add blacklist 3 15 ban foo 'with space' bar biz\`
> \`ad       \` => Counts server invites sent that are not to the current server
> \`blacklist\` => Blacklists certain phrases, each occurrence in a message counts as a strike (ie. \`'foo' 'some thing' 'bar'\`)
> \`embeds   \` => Stops users from posting the same embed over and over
> \`emojionly\` => Strikes on messages containing only emojis
> \`everyone \` => Strikes on attempted @ everyone attempts. You can specify roles (by ID) that count as "@ everyone" mentions
> \`regex    \` => Strikes when a regex matches the message, only 1 regex is supported a time. Can be either given as \`'r(e)gex.*' 'flags'\` or \`'/r(e)gex.*/flags'\`
> \`repeats  \` => Strikes on messages with repeated content (ie. copy/paste)
> \`pressure \` => Experimental, pressure-based automod
`.trim()

const RulesHelp =
  'Add a rule using `automod add <name> <punishment> <limit> <timeout> [param1 param2 ... paramN]`' +
  '\n> `<name>` must be one of: `' +
  Object.keys(Rules).join('`, `') +
  '`' +
  '\n> `<punishment>` must be one of `roleban`, `ban`, `softban`, `kick`, `delete`, `whisper:<message here>`' +
  '\n> `<limit>` (number) is how many times a rule must be triggered (ie. a "strike") before the punishment activates' +
  '\n> `<timeout>` (number) is the time in seconds for how long each "strike" lasts' +
  '\n> `[param...]` Some rules take extra parameters, use `automod rules` to see more details about the rules'

/** Map of guild_id => config */
const automodConfig = new Map()
/** Map of guild_id => automod_rules */
const activeRules = new Map()
const silentChannelsCounts = new Map()
/** Map of channel_id => silence_counter */
const silentChannels = {
  change(channelId, delta) {
    silentChannelsCounts.set(channelId, this.get(channelId) + delta)
  },
  increment(channelId) {
    this.change(channelId, 1)
  },
  decrement(channelId) {
    this.change(channelId, -1)
  },
  get(channelId) {
    return silentChannelsCounts.get(channelId) || 0
  },
  set(channelId, val) {
    return silentChannelsCounts.set(channelId, val)
  },
}

/**
 * Must absolutely be called before anything happens
 * (Well, kinda. This loads all the rules and config settings from the database but automod *will* work without calling this)
 * (You just won't have any persistence from the last session)
 *
 * @param {Database} db The database to use to make queries, should be `bot.sleet.db` usually
 */
async function setupAutomodFromDatabase(db) {
  const dbConfig = await db.any('SELECT * FROM automod')

  automodConfig.clear()
  for (let v of dbConfig) {
    const { guild_id, ...data } = v
    automodConfig.set(guild_id, data)
  }

  const dbRules = await db.any('SELECT * from automod_rules')

  activeRules.clear()
  for (let v of dbRules) {
    const { guild_id, ...data } = v

    if (!activeRules.has(guild_id)) {
      activeRules.set(guild_id, [])
    }

    try {
      const rule = Rules[data.rule_name]
        ? new Rules[data.rule_name](
            data.id,
            data.punishment,
            data.trigger_limit,
            data.timeout,
            data.params,
          )
        : null

      if (rule) {
        activeRules.get(guild_id).push(rule)
      }
    } catch (e) {
      console.error(
        'FAILED TO CREATE RULE',
        data.rule_name,
        data.id,
        data.punishment,
        data.trigger_limit,
        data.timeout,
        data.params,
        e,
      )
    }
  }
}

/**
 * Adds a rule to the database, returning the id created
 */
function addRuleToDatabase(
  db,
  guild_id,
  rule_name,
  punishment,
  trigger_limit,
  timeout,
  params,
) {
  return db.one(
    'INSERT INTO automod_rules (guild_id, rule_name, punishment, trigger_limit, timeout, params) ' +
      'VALUES ($<guild_id>, $<rule_name>, $<punishment>, $<trigger_limit>, $<timeout>, $<params>) ' +
      'RETURNING id',
    { guild_id, rule_name, punishment, trigger_limit, timeout, params },
    r => r.id,
  )
}

/**
 * Deletes a rule from the database based on id
 */
function deleteRuleFromDatabase(db, id) {
  return db.none('DELETE FROM automod_rules WHERE id = $1', [id])
}

const { roleban } = require('../mod/roleban.js')

module.exports.events = {}
module.exports.events.init = sleet => {
  setupAutomodFromDatabase(sleet.db)
}

module.exports.events.message = (bot, message) => {
  if (!message.guild) return

  if (!message.member.permissions.has('MANAGE_MESSAGES'))
    return message.channel.send(
      'You need "Manage Messages" permissions on the server level to manage automod.',
    )

  const [cmd, opt, ...params] = bot.sleet.shlex(message)

  switch ((opt || '').toLowerCase()) {
    case 'help':
      message.channel.send(RulesHelp)
      break

    case 'rules':
      message.channel.send(RulesDocs)
      break

    case 'view':
      viewRules(bot, message, ...params)
      break

    case 'add':
    case 'create':
      addRule(bot, message, params)
      break

    case 'remove':
    case 'rm':
    case 'delete':
    case 'del':
      deleteRule(bot, message, params)
      break

    case 'silent':
      message.channel.send(
        `Counts for ${params[0]}: ${silentChannels.get(params[0])}`,
      )
      break

    case 'clearsilent':
      silentChannels.set(params[0], 0)
      message.channel.send(`Counts for ${params[0]} cleared`)
      break

    default:
      message.channel.send(
        'What do you want to do?\n`help`, `rules`, `view`, `add`, `delete`',
      )
  }
}

function viewRules(bot, message, page = 1) {
  const rules = activeRules.get(message.guild.id)

  const perPage = 10
  const maxPage = Math.ceil(rules.length / perPage)

  if (page < 1 || page > maxPage) {
    return message.channel.send(`You need to specify a page from 1-${maxPage}`)
  }

  const pageIndicator = maxPage !== 1 ? ` [Page ${page}/${maxPage}]` : ''

  if (!rules || rules.length === 0) {
    message.channel.send('No rules are active on this server.')
  } else {
    message.channel.send(
      `Active rules (${rules.length})${pageIndicator}:` +
        '\n```py\n' +
        rules
          .slice(perPage * (page - 1), perPage * page)
          .map(
            r =>
              `[${r.id}] ${r.name} {${r.timeout / 1000} s}${
                r.parameters && r.parameters.length > 0
                  ? ' [' +
                    r.parameters.join(', ').replace(/nigger/, 'ni---r') +
                    ']'
                  : ''
              } -> # ${r.punishment}`,
          )
          .join('\n') +
        '\n```',
    )
  }
}

async function addRule(bot, message, params) {
  if (!activeRules.has(message.guild.id)) {
    activeRules.set(message.guild.id, [])
  }

  const rules = activeRules.get(message.guild.id)

  let [name, punishment, limit, timeout, ...ruleParams] = params

  if (!name || !punishment || !limit || !timeout) {
    return message.channel.send(`Missing parameters...\n${RulesHelp}`)
  }

  ruleParams = ruleParams.filter(v => !!v)
  name = name.toLowerCase()

  if (!Rules[name]) {
    return message.channel.send(
      `Invalid rule.\n\`${Object.keys(Rules).join(', ')}\``,
    )
  }

  // return message.channel.send(`\`${punishment} ${limit} ${timeout} ['${ruleParams.join("', '")}']\``)

  try {
    const id = await addRuleToDatabase(
      bot.sleet.db,
      message.guild.id,
      name,
      punishment,
      limit,
      timeout,
      ruleParams,
    )
    const newRule = new Rules[name](id, punishment, limit, timeout, ruleParams)
    activeRules.get(message.guild.id).push(newRule)
    message.channel.send(
      `**New rule created:**\n\`\`\`py\n[${id}] ${newRule.name} {${timeout} s}${
        ruleParams.length > 0 ? ' [' + ruleParams.join(', ') + ']' : ''
      } -> #${punishment}\n\`\`\``,
    )
  } catch (e) {
    message.channel.send('**An error occured:**\n' + e.message)
    bot.sleet.logger.error(
      'Failed to add automod rule:',
      { name, punishment, limit, timeout, ruleParams },
      e,
    )
  }
}

async function deleteRule(bot, message, params) {
  const rules = activeRules.get(message.guild.id)

  if (!rules)
    return message.channel.send('There are no rules for you to delete.')

  const id = parseInt(params[0])

  if (Number.isNaN(id))
    return message.channel.send('You need to supply a valid rule ID.')

  const index = rules.findIndex(r => r.id === id)

  if (index === -1) return message.channel.send("That rule doesn't exist.")

  const r = rules.splice(index, 1)[0]

  if (r) {
    await deleteRuleFromDatabase(bot.sleet.db, id)
    message.channel.send(
      'Deleted: \n```py\n' +
        `[${r.id}] ${r.name} {${r.timeout / 1000} s} -> # ${r.punishment}` +
        '\n```',
    )
  } else {
    message.channel.send('Did not delete anything.')
  }
}

module.exports.events.messageUpdate = (bot, oldMessage, newMessage) => {
  if (oldMessage.content !== newMessage.content) {
    handleMessage(bot, newMessage)
  }
}

module.exports.events.everyMessage = handleMessage

async function handleMessage(bot, message) {
  if (!message.guild || message.author.bot) return

  // const start = process.hrtime.bigint()
  const rules = activeRules.get(message.guild.id)
  let prefix = true

  if (!message.member) {
    try {
      message.member = await message.guild.members.fetch(message.author.id)
    } catch {
      // They likely aren't on the server anymore
      return
    }
  }

  // Automod does not apply if:
  //  - There are no automod rules
  //  - You have 'Manage Messages' perms (server or channel)
  //  - The member is higher than (or equal to) the bot
  if (
    !rules ||
    message.channel.permissionsFor(message.member).has('MANAGE_MESSAGES') ||
    message.member.roles.highest.position >=
      message.guild.me.roles.highest.position
  ) {
    return
  }

  const autoconfig = automodConfig.get(message.guild.id)

  if (!autoconfig) return

  const { prepend, silence_prepend } = autoconfig

  if (silence_prepend.some(v => message.content.includes(v))) {
    silentChannels.increment(message.channel.id)
    setTimeout(cid => silentChannels.decrement(cid), 5000, message.channel.id)
  }

  // console.log(`Running automod on ${message.id}`)
  await Promise.all(
    rules.map(rule =>
      runRule({
        bot,
        message,
        rule,
        prepend,
        prefix,
      }),
    ),
  )
  // to bench
  // const end = process.hrtime.bigint()
  // const durationMs = (end - start) / 1000000n
  // console.log(`End automod on ${message.id}, took ${durationMs}ms`)
}

async function runRule({ bot, message, rule: r, prepend, prefix }) {
  const { deletes, punishment, reason } = (await r.filter(message)) || {}

  if (!punishment) return

  const usertag = bot.sleet.formatUser(message.author)
  const realReason = reason || r.name || 'No reason!'
  const logDeletedMessage = message.guild.id === '301319624874655744'
  let silentAction = false
  let action = null
  let extra = null

  //(null, 'delete', roleban', 'kick', 'ban', 'whisper: some message', 'log')
  switch ((punishment + '').split(':')[0].toLowerCase()) {
    case 'delete':
      action = 'silenced (message deleted)'
      silentAction = true
      message.delete().catch(c => {})

      if (deletes) {
        if (deletes.length === 1 && deletes[0].delete) {
          deletes[0].delete().catch(_ => {})
        } else if (deletes.length > 1) {
          message.channel.bulkDelete(deletes).catch(_ => {})
        }
      }
      break

    case 'roleban':
      action = 'rolebanned'
      const rolebanRole = automodConfig.get(message.guild.id).roleban_role
      if (message.member.roles.cache.has(rolebanRole)) {
        message.channel.createOverwrite(message.author, {
          SEND_MESSAGES: false,
        })
        action = 'muted'
        prefix = false
      } else {
        roleban(
          bot,
          {
            channel: message.channel,
            author: bot.user,
            member: message.guild.me,
            guild: message.guild,
          },
          [message.member],
          rolebanRole,
          { silent: true, mention: true },
        )
      }
      break

    case 'kick':
      if (message.member.kickable) {
        action = 'kicked'
        message.member.kick(r.name)
      }
      break

    case 'ban':
      if (message.member.bannable) {
        action = 'banned'
        message.member.ban({ days: 1, reason: realReason })
      }
      break

    case 'softban':
      if (message.member.bannable) {
        action = 'softbanned'
        message.member
          .ban({ days: 1, reason: realReason })
          .then(_ => message.guild.members.unban(message.member))
      }
      break

    case 'whisper':
      const m = punishment.split(':').slice(1).join(':').trim()
      const member = message.member
      action = 'whispered to'
      extra = `Told them: ${m}`
      silentAction = true

      message.channel
        .send(`${message.author}, ${m}`, { autoDelete: false })
        .then(async msg => {
          const original = msg.channel.permissionOverwrites.get(member.id)

          await msg.channel.createOverwrite(
            member,
            { VIEW_CHANNEL: false },
            `Whisper: ${m}`,
          )
          await msg.delete().catch(_ => {})

          await sleep(500)

          const perms = msg.channel.permissionOverwrites.get(member.id)

          if (perms) {
            perms.delete('Return pre-whisper perms')
          }

          if (original) {
            msg.channel.createOverwrite(
              member,
              original.serialize ? original.serialize() : {},
              'Return pre-whisper perms',
            )
          }

          setTimeout(async () => {
            const perms = msg.channel.permissionOverwrites.get(member.id)
            if (original && perms) perms.delete('Return pre-whisper perms (timeout)')
          }, 5000)
        })

      break

    case 'log':
      action = 'nothing (log)'
      silentAction = true
      break
  }

  if (!action) return

  const msg = `${usertag} was **${action}** for *${realReason}* in *${message.channel}*`

  if (msg && !silentAction) {
    prefix = prefix && silentChannels.get(message.channel.id) < 1
    message.channel.send((prefix ? prepend : '') + msg, { autoDelete: false })
  }

  const modlogMsg =
    msg +
    (extra ? `\n> *${extra}*` : '') +
    (logDeletedMessage ? '```\n' + message.content + '\n```' : '') +
    `\n> ${message.url}`
  modlog.createLog(
    message.guild,
    'automod_action',
    '\u{1F432}',
    'Automod',
    modlogMsg,
  )
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

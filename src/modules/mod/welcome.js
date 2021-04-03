module.exports.config = {
  name: 'welcome',
  invokers: ['welcome'],
  help: 'Welcomes people',
  expandedHelp: 'See `welcome` and `welcome help` for info and config details.',
  dbScript: 'welcome.sql',
}

const Discord = require('discord.js')
const modlog = weakRequire('./modlog.js') || { createLog() {} }
const pgp = require('pg-promise')({ capSQL: true })

const welcomeColumnSet = new pgp.helpers.ColumnSet(
  [
    { name: 'guild_id', cast: 'int' },
    'message',
    { name: 'channel', cast: 'int' },
    { name: 'rejoins', def: false },
    { name: 'instant', def: false },
    { name: 'ignore_roles', cast: 'BigInt[]' },
    'react_with',
    'react_animated',
  ],
  { table: 'welcome' },
)

async function previouslyJoined(db, guild_id, user_id) {
  return (
    (
      await db.one(
        'SELECT COUNT(*) FROM welcome WHERE guild_id = $<guild_id>::BigInt AND $<user_id>::BigInt = ANY (joins)',
        { guild_id, user_id },
      )
    ).count === '1'
  )
}

function fetchJoinInfo(db, guild_id, user_id) {
  return db.oneOrNone(
    'SELECT message, channel, rejoins, instant, ignore_roles, react_with, $<user_id>::BigInt = ANY (joins) AS previously_joined FROM welcome WHERE guild_id = $<guild_id>::BigInt',
    { guild_id, user_id },
  )
}

async function getWelcome(db, guild_id) {
  return await db.oneOrNone(
    'SELECT message, channel, rejoins, instant, ignore_roles, react_with, react_animated FROM welcome WHERE guild_id = $<guild_id>',
    { guild_id },
  )
}

function createNewWelcome(db, guild_id, items) {
  joinSettings[guild_id] = items
  return db.none(
    'INSERT INTO welcome (guild_id, message, channel, rejoins, instant, ignore_roles, react_with, react_animated) ' +
      'VALUES ($<guild_id>, $<message>, $<channel>::BigInt, $<rejoins>, $<instant>, $<ignore_roles>::BigInt[], $<react_with>, $<react_animated>)',
    { guild_id, ...items },
  )
}

function deleteWelcome(db, guild_id) {
  delete joinSettings[guild_id]
  return db.none('DELETE FROM welcome WHERE guild_id = $<guild_id>', {
    guild_id,
  })
}

function addJoin(db, guild_id, user_id) {
  return db.none(
    'UPDATE welcome SET joins = array_append(joins, $<user_id>::BigInt) WHERE guild_id = $<guild_id>::BigInt',
    { guild_id, user_id },
  )
}

function editField(db, guild_id, field, newValue) {
  if (!validFields.includes(field) && field !== 'react_animated')
    throw new Error(`${field} is not a valid field to edit`)

  return db.none(
    `UPDATE welcome SET ${field} = $<newValue> WHERE guild_id = $<guild_id>::BigInt`,
    { guild_id, newValue },
  )
}

function createDefaultValueProxy(val, defaultVal) {
  return new Proxy(val, {
    get(target, name) {
      if (!(name in target))
        target[name] =
          typeof defaultVal === 'function' ? defaultVal(name) : defaultVal
      return target[name]
    },
  })
}

// guildId => Set of new user Ids
const newJoins = createDefaultValueProxy({}, () => new Set())
// guildId => Last guild join settings
const joinSettings = createDefaultValueProxy({}, {})

const helpData = {
  message: {
    prompt: 'What welcome message do you want? (`Hello {@user}!`)',
    detail:
      'The message shown to the user, use `s?welcome message` to see what you can use',
    help:
      'The welcome message posted, use `s?welcome message` to see what you can use',
  },
  channel: {
    prompt:
      'Mention the channel you want to send welcome messages to, or "none" to send messages to the same channel as the welcomed user\'s first message. (`#channel`/`none`)',
    help:
      "The channel where the welcome message is posted, otherwise it's posted to the same channel the user posts in",
  },
  rejoins: {
    prompt:
      'Do you want the bot to re-welcome people if they rejoin? (`yes/no`)',
    detail:
      'If no, the bot will store the IDs of users who joined to avoid sending 2+ welcome messages per person.',
    help: 'Will the bot re-welcome people if they rejoin?',
  },
  instant: {
    prompt:
      'Do you want welcome messages be instant? If no, they will be on first message only. (`yes/no`)',
    detail:
      'Instant welcomes are sent the moment someone joins the server, and require a welcome channel to be set.',
    help:
      'Will the bot instantly welcome people when they join? Or wait for first message?',
  },
  ignore_roles: {
    prompt:
      'Which roles do you want the bot to ignore when deciding to send welcome messages? (`@role`/`role id`/`none`)',
    detail:
      "You can mention multiple roles or send multiple roles IDs. Use `none` if you don't want to ignore any role. Users with these roles will not be welcomed.",
    help: 'If a user has one of these roles, they will not be welcomed.',
  },
  react_with: {
    prompt:
      'An emoji to react to the message that triggered the welcome, if any. (Add a reaction!/`none`)',
    detail:
      "Use `none` if you don't want the bot to react to the message. The bot does not react if the user's message is in the same channel as the welcome message.",
    help: "An emoji, if any, to react to the user's first message with.",
  },
}

const hData = Object.fromEntries(
  Object.entries(helpData).map(v => [v[0], v[1].help]),
)

const helpMessage =
  'There is (some) support for dynamic welcome message content:\n' +
  '  - `{@user}` mentions the welcomed user\n' +
  '  - `{#origin-channel}` mentions the channel where the user posted their first message'

module.exports.events = {}

module.exports.events.message = async (bot, message) => {
  if (!message.guild) {
    return message.channel.send('Try this command in a server.')
  }

  if (!message.member.hasPermission('MANAGE_GUILD')) {
    return message.channel.send(
      'You need to have "Manage Server" permissions to mess with welcome messages.',
    )
  }

  const [, cmd] = bot.sleet.shlex(message)
  const { db } = bot.sleet
  const lcmd = (cmd + '').toLowerCase()

  switch (lcmd) {
    case 'help':
      const embed = createWelcomeInfoEmbed(hData, {
        format: false,
        inline: false,
      })
      return message.channel.send({ embed })

    case 'message':
      return message.channel.send(helpMessage)

    case 'cancel':
      const gid = message.guild.id
      if (setupRunning.has(gid)) {
        setupRunning.delete(gid)
        return message.channel.send('Setup cancelled, nothing was saved.')
      }
      return message.channel.send('No setup is currently running.')

    case 'config':
    case 'setup':
      const setupData = await getWelcome(db, message.guild.id)

      if (setupData) {
        const embed = createWelcomeInfoEmbed(setupData)
        message.channel.send('You have welcome setup!', { embed })
      } else {
        setupWelcomeInteractive(bot, message)
      }
      return

    case 'delete':
      const deleteData = await getWelcome(db, message.guild.id)
      if (deleteData) {
        const embed = createWelcomeInfoEmbed(deleteData)
        await deleteWelcome(db, message.guild.id)
        message.channel.send(
          'Welcome message deleted, for reference, these were the previous settings:',
          { embed },
        )
      } else {
        message.channel.send(
          'You do not have welcome setup! Set it up first by using `s?welcome setup`',
        )
      }
      return

    case 'edit':
      return editWelcome(bot, message)
  }

  message.channel.send(
    'What do you want to do? Use a subcommand: `s?welcome [command]`\n> `help` => Get help about the fields\n> `message` => Get detail about welcome messages\n> `config` => View the config for this server\n> `setup` => Setup welcome for the server\n> `delete` => Delete the welcome config for this server\n> `edit` => Edit the welcome config for this server',
  )
}

const validFields = Object.keys(helpData)

async function editWelcome(bot, message) {
  const [, cmd, inField, ...rest] = bot.sleet.shlex(message)
  const field = inField ? inField.toLowerCase() : undefined
  const value = rest.join(' ')
  const { db } = bot.sleet

  if (!field || !validFields.includes(field))
    return message.channel.send(
      `You need to specify a valid field: \`${validFields.join('`, `')}\``,
    )

  const welcomeInfo = await getWelcome(db, message.guild.id)

  if (!value)
    return message.channel.send(
      `\`${field}\` is currently:\n> ${('' + welcomeInfo[field]).replace(
        /\n/g,
        '\n> ',
      )}\nYou can edit this using \`welcome edit ${field} [new value here]\`.`,
    )

  if (!(await keyValidators[field](message, value)))
    return message.channel.send(`That's not a valid value for ${field}`)

  const parsed = await resultParsers[field](message, value)

  if (parsed === null || parsed === OPTIONAL_NO_VALUE)
    return message.channel.send(
      'That did not parse into a valid value for ${field}',
    )

  try {
    await editField(db, message.guild.id, field, parsed)

    if (field === 'react_with') {
      const isAnimated = animatedRegex.test(value)
      await editField(db, message.guild.id, 'react_animated', isAnimated)
    }

    message.channel.send(
      `\`${field}\` is now:\n> ${('' + value).replace(/\n/g, '\n> ')}`,
    )
  } catch (e) {
    console.error(e)
    message.channel.send(`Failed to update, try later?`)
  }
}

const displayFormatters = {
  channel: c => (c ? `<#${c}>` : c),
  ignore_roles: r => (r ? r.map(i => `<@&${i}>`).join(', ') || 'None' : 'None'),
  react_with: (r, data) => {
    if (!r) return 'None'
    if (/\d+/.test(r)) return `<${data.react_animated ? 'a' : ''}:_:${r}>`
    return r
  },
}

const hidden_fields = ['react_animated']
function createWelcomeInfoEmbed(data, { format = true, inline = true } = {}) {
  const embed = new Discord.MessageEmbed()

  for (const [k, v] of Object.entries(data)) {
    // console.log('f', k, v, data)
    if (hidden_fields.includes(k)) continue
    const val =
      format && displayFormatters[k] ? displayFormatters[k](v, data) : v
    embed.addField(k, val, inline)
  }

  return embed
}

const setupRunning = new Set()

async function setupWelcomeInteractive(bot, message) {
  const gid = message.guild.id
  if (setupRunning.has(gid))
    return message.channel.send(
      'Setup is already being run in this server, finish the other setup first or cancel the last one: `s?welcome cancel`.',
    )

  const data = {}
  setupRunning.add(gid)

  try {
    const doSetup = await promptFor(
      'yesno',
      message,
      "You don't have welcome setup! Do you want to set it up?",
    )

    if (!doSetup) {
      throw new Error('cancelled')
    }

    for (const k of Object.keys(helpData)) {
      let res

      if (k === 'react_with') {
        res = await promptForReact(k, message)
        if (res) {
          data['react_animated'] = res[1]
          res = res[0]
        }
      } else {
        res = await promptFor(k, message)
      }

      if (!setupRunning.has(gid)) {
        // cancelled
        setupRunning.delete(gid)
        return
      }

      data[k] = res
    }
  } catch (e) {
    if (!setupRunning.has(gid)) return
    console.log('err', e)
    setupRunning.delete(gid)
    return message.channel.send('Setup cancelled. Nothing was saved.')
  }

  setupRunning.delete(gid)

  const embed = createWelcomeInfoEmbed(data)
  await createNewWelcome(bot.sleet.db, gid, data)
  message.channel.send('Setup finished.', { embed })
}

const OPTIONAL_NO_VALUE = '---SKIPPY---'

function getChannelFrom(m) {
  if (m.content.toLowerCase() === 'none') return OPTIONAL_NO_VALUE
  const c = /<#(\d+)>/.exec(m.content)
  return !c || !m.guild.channels.cache.get(c[1]) ? false : c[1]
}

function getRolesFrom(m) {
  if (m.content.toLowerCase() === 'none') return OPTIONAL_NO_VALUE
  const roles = [...m.content.matchAll(/(?:<@&)?(\d+)(?:>)?/g)].map(r => r[1])

  if (roles.length < 1 || !roles.every(r => m.guild.roles.cache.get(r)))
    return false
  return roles
}

async function getEmoji(m, v) {
  try {
    const emoji = v || m.content
    const emojiMatch = emoji.match(/\d+/)
    const emojiID = emojiMatch ? emojiMatch[0] : null

    await m.react(emojiID || emoji)
    return emojiID || emoji
  } catch (e) {
    return false
  }
}

const TRUTHY = ['true', 'y', 'yes', 'ya', 'yea', 'yeah', 't']
const FALSY = ['false', 'n', 'no', 'nope', 'nah']
const BOOLY = [...TRUTHY, ...FALSY]

function booleanValidator(m) {
  return BOOLY.includes((m.content + '').toLowerCase())
}

function optionalValidator(v) {
  return m => {
    if (m.content.toLowerCase() === 'skip') return OPTIONAL_NO_VALUE
    return v(m)
  }
}

const keyValidators = {
  message: m => m.content,
  channel: getChannelFrom,
  rejoins: booleanValidator,
  instant: booleanValidator,
  ignore_roles: getRolesFrom,
  react_with: getEmoji,
  yesno: booleanValidator,
}

function booleanParser(c) {
  const l = (c + '').toLowerCase()

  return TRUTHY.includes(l)
}

function optionalParser(c) {
  return c === OPTIONAL_NO_VALUE ? null : c
}

function getRegexResult(val, regex) {
  const res = val.match(regex)
  return res ? res[1] || res[0] : null
}

const reactionRegex = /\d+/
const animatedRegex = /<a:\w+:\d+>/

const resultParsers = {
  message: (m, v) => v || m.content,
  channel: m => optionalParser(getChannelFrom(m)),
  rejoins: (m, v) => booleanParser(v || m.content),
  instant: (m, v) => booleanParser(v || m.content),
  ignore_roles: m => optionalParser(getRolesFrom(m)) || [],
  react_with: (m, v) =>
    getRegexResult(v || m.content, reactionRegex) || v || m.content,
  yesno: (m, v) => booleanParser(v || m.content),
}

function promptFor(key, message, promptMsg) {
  return new Promise((resolve, reject) => {
    const msg =
      promptMsg ||
      helpData[key].prompt +
        (!helpData[key].detail ? '' : `\n> ${helpData[key].detail}`)
    message.channel.send(msg).then(msg => {
      message.channel
        .awaitMessages(
          m => m.author.id === message.author.id && keyValidators[key](m),
          { max: 1, time: 30000, errors: ['time'] },
        )
        .then(col => {
          const m = col.first()
          resolve(resultParsers[key] ? resultParsers[key](m) : m)
        })
        .catch(() => {
          msg.edit(`${msg.content}\nTimed out.`)
          reject(new Error('time'))
        })
    })
  })
}

function promptForReact(key, message, promptMsg) {
  return new Promise((resolve, reject) => {
    let resolved = false
    const msg =
      promptMsg ||
      helpData[key].prompt +
        (!helpData[key].detail ? '' : `\n> ${helpData[key].detail}`)
    message.channel
      .send(msg)
      .then(msg => {
        message.channel
          .awaitMessages(
            m =>
              m.author.id === message.author.id &&
              m.content.toLowerCase().trim() === 'none',
            { max: 1, time: 30000, errors: ['time'] },
          )
          .then(col => {
            if (!resolved) resolve(null)
            resolved = true
          })
          .catch(() => {})

        msg
          .awaitReactions(
            (r, u) =>
              u.id === message.author.id &&
              (!r.emoji.id || message.client.emojis.get(r.emoji.id)),
            { max: 1, time: 30000, errors: ['time'] },
          )
          .then(col => {
            const r = col.first().emoji
            if (!resolved) resolve([r.id || r.name, r.animated])
            resolved = true
          })
      })
      .catch(() => {
        if (resolved) return
        msg.edit(`${msg.content}\nTimed out.`)
        reject('time')
      })
  })
}

module.exports.events.guildMemberAdd = async (bot, member) => {
  const guild = member.guild
  const joinInfo = await fetchJoinInfo(bot.sleet.db, guild.id, member.id)

  if (joinInfo === null || member.bot) {
    // No join settings for this guild or they're a bot
    return
  }

  if (joinInfo.rejoins === false && joinInfo.previously_joined) {
    // Don't rewelcome
    return
  }

  if (joinInfo.instant) {
    sendWelcome(
      bot,
      bot.channels.cache.get(joinInfo.channels || guild.channels.first().id),
      { user: member, channel: null },
      joinInfo.message,
    )
  } else {
    newJoins[guild.id].add(member.id)
    joinSettings[guild.id] = joinInfo
  }
}

module.exports.events.everyMessage = async (bot, message) => {
  const guild = message.guild

  if (
    !guild ||
    !newJoins[guild.id].has(message.author.id) ||
    !message.member ||
    message.system ||
    message.author.bot
  ) {
    return
  }

  const joinSet = joinSettings[message.guild.id]
  let channel = message.channel

  if (
    joinSet.ignore_roles &&
    joinSet.ignore_roles.some(r => message.member.roles.cache.has(r))
  ) {
    // Ignore some "special" users ie. rolebanned ones
    return
  }

  newJoins[message.guild.id].delete(message.author.id)

  if (joinSet.channel !== null) {
    if (message.channel.id !== joinSet.channel && joinSet.react_with) {
      message.react(joinSet.react_with)
    }
    channel = bot.channels.cache.get(joinSet.channel)
  }

  sendWelcome(
    bot,
    channel,
    { user: message.author, channel: message.channel, message },
    joinSet.message,
  )
}

function sendWelcome(
  bot,
  channel,
  data = { user: null, channel: null, message: null },
  msg,
) {
  if (channel === null) return

  addJoin(bot.sleet.db, channel.guild.id, data.user.id)

  modlog.createLog(
    channel.guild,
    'member_welcome',
    '\u{1F44B}',
    'Member Welcome',
    `${bot.sleet.formatUser(data.user)} in ${data.channel}` +
      (data.message ? `\n> ${data.message.url}` : ''),
  )

  return channel.send(textReplace(msg, data))
}

function textReplace(msg, data = { user: null, channel: null }) {
  return msg
    .replace(/{@user}/g, data.user.toString())
    .replace(/{#origin-channel}/g, data.channel ? data.channel.toString() : '')
}

/**
 * A wrapper around require that either returns the required module or null,
 * depending if it could be required successfully or not
 *
 * @param module {String} The module to require
 */
function weakRequire(module) {
  try {
    return require(module)
  } catch (e) {
    return null
  }
}

module.exports.config = {
  name: 'modlog',
  invokers: ['modlog'],
  help: 'Log stuff that happens',
  expandedHelp: 'Config via channel topics, see `modlog` and `modlog help`',
}

const Discord = require('discord.js')
const Time = require('./time.js')
const MessageLog = require('./_MessageLog.js')
const archiveViewer = 'https://giraffeduck.com/api/log/'
const escapeMarkdown = Discord.Util.escapeMarkdown

const HOUR_MS = 3600000
const colors = {
  memberAdd: 0x77b255, memberRemove: 0xdd2e44,
  userBan: 0xff0000, userUnban: 0x55acee
}

const prefix = '>'
const settingsTemplate = [
  {name: 'member_add', type: 'boolean', init: true, help: 'Log members who join'},
  {name: 'member_add_new', type: 'number', init: 48, help: 'The time in hours for an account to be marked as "new". 0 to disable.'},
  {name: 'member_add_invite', type: 'boolean', init: false, help: 'Log which invite they used to join'},
  {name: 'member_add_mention', type: 'boolean', init: false, help: 'If to mention the user in the message rather than the embed.'},
  {name: 'member_welcome', type: 'boolean', init: true, help: 'Log welcome messages posted by the bot'},
  {name: 'member_remove', type: 'boolean', init: true, help: 'Log members who leave (or are kicked)'},
  {name: 'member_remove_roles', type: 'boolean', init: true, help: 'Log a member\'s roles when they leave'},
  {name: 'user_ban', type: 'boolean', init: true, help: 'Log when users are banned.'},
  {name: 'user_unban', type: 'boolean', init: true, help: 'Log when users are unbanned.'},
  {name: 'user_update', type: 'string', init: 'username', help: 'Log a user\'s updates: =[username | avatar | both]'},
  {name: 'delete_bulk', type: 'boolean', init: true, help: 'Log bulk deletes (purges)'},
  {name: 'message_delete', type: 'boolean', init: true, help: 'Log deleted messages'},
  {name: 'channel_create', type: 'boolean', init: true, help: 'Log created channels'},
  {name: 'channel_delete', type: 'boolean', init: true, help: 'Log deleted channels'},
  {name: 'reaction_actions', type: 'boolean', init: true, help: 'Allow to act on modlog entries by reacting (ie. ban with hammer)'},
  {name: 'automod_action', type: 'boolean', init: true, help: 'Log automod actions in the modlog'},
]

settingsTemplate.forEach((v, i) => settingsTemplate[i].reg = new RegExp('^' + prefix + v.name + '=(.*)', 'mi'))

// Server: [invites]
const invites = new Map()
// Server: {config}
const configs = new Map()

function fetchConfig(guild, channel = null) {
  if (!channel && guild.channels) {
    channel = guild.channels.find(c => c.topic && c.topic.split('\n').includes(prefix + 'modlog'))
  }

  if (!channel || !channel.topic) {
    // we tried
    return
  }

  if (!channel.topic.split('\n').includes(prefix + 'modlog')) {
    return
  }

  // Parse & store
  const settings = {}

  for (let setting of settingsTemplate) {
    let m
    if (m = channel.topic.match(setting.reg)) {
      const val = toPrim(m[1])

      if (typeof val !== setting.type) continue

      settings[setting.name] = val
    } else {
      settings[setting.name] = setting.init
    }
  }

  const c = {channel, settings}

  configs.set(guild.id, c)
  return c
}

function getConfig(guild) {
  return ((typeof guild === 'string') ? configs.get(guild) : configs.get(guild.id) || fetchConfig(guild))
}

/** Pads the expressions in tagged template literals */
function padExpressions(str, ...args) {
  return str.map((v, i) => v + (args[i] !== undefined ? (args[i] + '').padStart(2, 0) : '')).join('')
}

function sendLog(channel, emoji, type, message, { embed = null, timestamp = new Date(), ...rest } = {}) {
  const d = timestamp instanceof Date ? timestamp : new Date(timestamp)
  const time = padExpressions`${d.getUTCHours()}:${d.getUTCMinutes()}:${d.getUTCSeconds()}`
  const msg = `${emoji} \`[${time}]\` \`[${type}]\`: ${message}`

  if (embed && channel.permissionsFor(channel.client.user).has('EMBED_LINKS')) {
    return channel.send(msg, { embed, ...rest })
  } else {
    return channel.send(msg, rest)
  }
}

/**
 * A public function for other modules to create logs
 * Will automatically resolve the config (and not log if there's none)
 * and check if the setting is set to true
 *
 * @param guild {Discord.Guild|String} The Guild (or guild ID) to log to
 * @param setting {String} The setting to check if it's enabled
 * @param emoji {String} The emoji to put in to format
 * @param type {String} The type of log this is
 * @param message {String} The message content
 * @param embed {Dicord.RichEmbed|Object?} The embed to attach, if any
 */
function createLog(guild, setting, emoji, type, message, {embed = null} = {}) {
  const config = getConfig(guild)
  if (!config) return
  if (!config.settings[setting]) return

  sendLog(config.channel, emoji, type, message, {embed})
}
module.exports.createLog = createLog

module.exports.events = {}
module.exports.events.ready = async (bot) => {
  for (let [id, guild] of bot.guilds) {
    let config = getConfig(guild)
    if (!config) continue

    if (config.settings.member_add_invite && guild.me.permissions.has('MANAGE_GUILD')) {
      invites.set(guild.id, await guild.fetchInvites())
    }
  }
}

module.exports.events.init = (sleet, bot) => {
  // If we're reloading bot is not undefined
  if (bot && bot.readyAt) {
    module.exports.events.ready(bot)
  }
}

module.exports.events.raw = async (bot, packet) => {
  // Switch/case doesn't count as another scope :(
  let guild, member, message

  // Log things even if the member/message isn't cached :)
  switch (packet.t) {
    case 'GUILD_MEMBER_REMOVE':
      guild = bot.guilds.get(packet.d.guild_id)

      if (guild.members.get(packet.d.user.id)) return

      member = packet.d.user
      member.guild = guild
      module.exports.events.guildMemberRemove(bot, member)
      break

    case 'MESSAGE_DELETE':
      // ignore for now
      return;
      if (!packet.d.guild_id) return
      channel = bot.channels.get(packet.d.channel_id)

      // Cached, don't bother
      if (channel.messages.get(packet.d.id)) return

      await sleep(500)
      message = { id: packet.d.id }
      message.guild = channel.guild
      message.channel = channel
      message.uncached = true
      module.exports.events.messageDelete(bot, message)
      break
  }
}

module.exports.events.message = (bot, message) => {
  if (!message.guild) return

  const [cmd, arg] = bot.sleet.shlex(message)

  if (arg && arg.toLowerCase() === 'help') {
    return message.channel.send(`Add \`${prefix}modlog\` to the topic of the channel you want to use, then add an option:\n` + '```asciidoc\n'
      + settingsTemplate.map(s => `= ${s.help}\n${s.name} :: ${s.type} \/\/ [Default: ${s.init}]`).join('\n')
      + '\n```\nAdd `' + prefix + '[setting_name]=[value]` to the channel to set an option.')
  }

  const conf = getConfig(message.guild)

  if (conf) {
    message.channel.send('Here is the current config:\n```js\n' + JSON.stringify({channel: conf.channel.id, settings: conf.settings}, null, 2) + '\n```\nUse `modlog help` for help.')
  } else {
    message.channel.send(`You have no modlog setup, add '${prefix}modlog' to the topic of the channel you want to use.\n`
                        + 'Use `modlog settings` to view available settings.')
  }
}

module.exports.events.channelUpdate = (bot, oldC, newC) => {
  const config = fetchConfig(newC.guild, newC)
  if (!config) return

  if (config.settings.member_add_invite && newC.guild.me.permissions.has('MANAGE_GUILD')
      && !invites.get(newC.guild)) {
    newC.guild.fetchInvites(i => invites.set(newC.guild, i))
  }
}

module.exports.events.channelCreate = async (bot, channel) => {
  if (!(channel instanceof Discord.GuildChannel)) return
  const config = getConfig(channel.guild)
  if (!config || !config.settings.channel_create) return

  let createdBy

  if (channel.guild.me.permissions.has('VIEW_AUDIT_LOG')) {
    await sleep(500)
    const auditLogs = await channel.guild.fetchAuditLogs({type: 'CHANNEL_CREATE'})
    const log = auditLogs.entries.find(v => v.target && v.target.id === channel.id)
    if (log) createdBy = log.executor
  }

  const msg = `**${channel.name}** (${channel.id}) [\`${channel.type}\`]`
            + (channel.parent ? ` in **${channel.parent.name}** (${channel.parent.id})` : '')
            + (createdBy ? ` created by ${bot.sleet.formatUser(createdBy)}` : '')

  sendLog(config.channel, ':house:', 'Channel Created', msg)
}

module.exports.events.channelDelete = async (bot, channel) => {
  if (!(channel instanceof Discord.GuildChannel)) return
  const config = getConfig(channel.guild)
  if (!config || !config.settings.channel_delete) return

  let deletedBy

  if (channel.guild.me.permissions.has('VIEW_AUDIT_LOG')) {
    await sleep(500)
    const auditLogs = await channel.guild.fetchAuditLogs({type: 'CHANNEL_DELETE'})
    const log = auditLogs.entries.find(val => val.changes.find(w => w.key === 'name' && w.old === channel.name))
    if (log) deletedBy = log.executor
  }

  const msg = `**${channel.name}** (${channel.id}) [\`${channel.type}\`]`
            + (channel.parent ? ` in **${channel.parent.name}** (${channel.parent.id})` : '')
            + (deletedBy ? ` deleted by ${bot.sleet.formatUser(deletedBy)}`: '')

  sendLog(config.channel, ':house_abandoned:', 'Channel Deleted', msg)
}

module.exports.events.guildMemberAdd = async (bot, member) => {
  const config = getConfig(member.guild)
  if (!config || !config.settings.member_add) return

  const msg = `${bot.sleet.formatUser(member.user)}`
            + (config.settings.member_add_mention ? ` ${member}` : '')

  const embed = new Discord.RichEmbed()

  const newAcc = (config.settings.member_add_new * HOUR_MS > Date.now() - member.user.createdTimestamp ? '| :warning: New account!' : '')


  const inviter = (config.settings.member_add_invite ? (await getInviter(bot, member.guild)) : null)
  const invMem = (inviter ? '| :mailbox_with_mail: ' + inviter : '')

  embed.setDescription(`${config.settings.member_add_mention ? '' : member + ' | '}
**${member.guild.memberCount}** Members ${invMem} ${newAcc}`)
    .setColor(colors.memberAdd)
    .setFooter(`${Time.trim(Time.since(member.user.createdAt).format({short: true}), 3)} old`, member.user.avatarURL)
    .setTimestamp(new Date())

  sendLog(config.channel, ':inbox_tray:', 'Member Join', msg, {embed})
}

async function getInviter(bot, guild) {
  const oldInvites = invites.get(guild.id)

  if (!oldInvites) {
    invites.set(guild.id, await guild.fetchInvites())
    return 'No Cache'
  }

  const newInvites = await guild.fetchInvites()

  const possibleInviters = newInvites.filter(i => i.uses > 0 && (!oldInvites.get(i.code) || i.uses !== oldInvites.get(i.code).uses))

  invites.set(guild.id, newInvites)

  if (!possibleInviters || possibleInviters.size === 0) {
    return null
  } else {
    return possibleInviters.map(i => `${bot.sleet.formatUser(i.inviter)} {\`${i.code}\`} <\`${i.uses}\`>`).join(', ')
  }
}

const lastKicks = new Map()
module.exports.events.guildMemberRemove = async (bot, member) => {
  const config = getConfig(member.guild)
  if (!config || !config.settings.member_remove) return

  const after = lastKicks.get(member.guild.id)
  let latestKick

  if (member.guild.me.permissions.has('VIEW_AUDIT_LOG')) {
    await sleep(500) // thanks audit logs
    latestKick = (after ?
      (await member.guild.fetchAuditLogs({type: 'MEMBER_KICK', limit: 1})) :
      (await member.guild.fetchAuditLogs({type: 'MEMBER_KICK', limit: 1, after}))).entries.first()

    if (latestKick && (latestKick.target.id !== member.id || latestKick.id === after)) {
      latestKick = null
    }

    lastKicks.set(member.guild.id, latestKick ? latestKick.id : undefined)
  }

  if (member.user === undefined) member.user = await bot.fetchUser(member.id)

  const msg = `${bot.sleet.formatUser(member.user)} ${member}`
            + (latestKick ? ` kicked by ${bot.sleet.formatUser(latestKick.executor)} ${latestKick.reason ? 'for "' + latestKick.reason + '"': ''}` : '')

  const roles = (config.settings.member_remove_roles && member.roles ? member.roles.map(r => r.name).filter(r => r !== '@everyone').join(', ') : '')
  const embed = new Discord.RichEmbed()

  embed.setDescription(`**${member.guild.memberCount}** Members\n${roles ? '**Roles:** ' + roles : ''}`)
    .setColor(colors.memberRemove)
    .setFooter(`Joined ${member.joinedAt ? Time.trim(Time.since(member.joinedAt).format({short: true}), 3) : 'some unknown time'} ago`)
    .setTimestamp(new Date())

  sendLog(config.channel, latestKick ? ':boot:' : ':outbox_tray:', 'Member Remove', msg, {embed})
}

const lastBans = new Map()
const numBans = new Map()
module.exports.events.guildBanAdd = async (bot, guild, user) => {
  const config = getConfig(guild)
  if (!config || !config.settings.user_ban) return

  await sleep(500) // thanks audit logs

  const after = lastBans.get(guild.id)
  let latestBan

  if (guild.me.permissions.has('VIEW_AUDIT_LOG')) {
    latestBan =
      (await guild.fetchAuditLogs({type: 'MEMBER_BAN_ADD', limit: 1, after})).entries.first()

    if (latestBan && (latestBan.target.id !== user.id || latestBan.id === after)) {
      latestBan = null
    }

    lastBans.set(guild.id, latestBan ? latestBan.id : undefined)
  }

  const msg = `${bot.sleet.formatUser(user)} ${user}`
            + (latestBan ? ` banned by ${bot.sleet.formatUser(latestBan.executor)} ${latestBan.reason ? 'for "' + latestBan.reason + '"': ''}` : '')

  const embed = new Discord.RichEmbed()
  const nBans = (numBans.get(guild.id) + 1) || (await guild.fetchBans()).size
  numBans.set(guild.id, nBans)

  embed.setDescription(`**${nBans}** Bans`)
    .setColor(colors.userBan)

  sendLog(config.channel, ':hammer:', 'User Ban', msg, {embed})
}

const lastUnbans = new Map()
module.exports.events.guildBanRemove = async (bot, guild, user) => {
  const config = getConfig(guild)
  if (!config || !config.settings.user_unban) return

  await sleep(500) // thanks audit logs

  const after = lastUnbans.get(guild.id)
  let latestUnban

  if (guild.me.permissions.has('VIEW_AUDIT_LOG')) {
    latestUnban =
      (await guild.fetchAuditLogs({type: 'MEMBER_BAN_REMOVE', limit: 1, after})).entries.first()

    if (latestUnban && (latestUnban.target.id !== user.id || latestUnban.id === after)) {
      latestUnban = null
    }

    lastUnbans.set(guild.id, latestUnban ? latestUnban.id : undefined)
  }

  const msg = `${bot.sleet.formatUser(user)} ${user}`
            + (latestUnban ? ` unbanned by ${bot.sleet.formatUser(latestUnban.executor)} ${latestUnban.reason ? 'for "' + latestUnban.reason + '"': ''}` : '')

  const embed = new Discord.RichEmbed()
  const nBans = (numBans.get(guild.id) - 1) || (await guild.fetchBans()).size
  numBans.set(guild.id, nBans)

  embed.setDescription(`**${nBans}** Bans`)
    .setColor(colors.userUnban)
    .setTimestamp(new Date())

  sendLog(config.channel, ':shield:', 'User Unban', msg, {embed})
}

// Since this isn't called for a specific guild, we need to check each one we're in :(
module.exports.events.userUpdate = async (bot, oldUser, newUser) => {
  let msgUser, msgAvy, msgBoth

  if (oldUser.tag !== newUser.tag) {
    msgUser = msgBoth = `${bot.sleet.formatUser(oldUser)} => ${bot.sleet.formatUser(newUser, {id: false})}`
  }

  if (oldUser.avatarURL !== newUser.avatarURL) {
    msgAvy = `${bot.sleet.formatUser(newUser)} => <${newUser.avatarURL}>`
    msgBoth = msgBoth ? msgBoth + ` <${newUser.avatarURL}>` : msgAvy
  }

  for (let guild of bot.guilds.array()) {
    const config = getConfig(guild)
    if (!config || !config.settings.user_update) return
    if (!(await userInGuild(guild, newUser))) return

    let msg

    if (config.settings.user_update === 'username' && msgUser) {
      msg = msgUser
    } else if (config.settings.user_update === 'avatar' && msgAvy) {
      msg = msgAvy
    } else if (config.settings.user_update === 'both' && msgBoth) {
      msg = msgBoth
    }

    if (msg)
      sendLog(config.channel, ':busts_in_silhouette:', 'User Update', msg)
  }
}

const FILENAME = 'archive.dlog.txt'
const generateArchiveUrl = (channelId, attachmentId) => `${archiveViewer}${channelId}-${attachmentId}`

module.exports.events.messageDeleteBulk = async (bot, messages) => {
  const firstMsg = messages.first()
  const guild = firstMsg.guild

  const config = getConfig(guild)
  if (!config || !config.settings.delete_bulk) return

  const msgsSorted = messages.array().sort((a, b) => a.createdTimestamp - b.createdTimestamp)
  const users = new Set(messages.array().map(m => m.author))
  const messagesPerUser = new Map()

  const txt = MessageLog(messages)

  for (const msg of msgsSorted) {
    const newCount = (messagesPerUser.get(msg.author.id) || 0) + 1
    messagesPerUser.set(msg.author.id, newCount)
  }

  const userList = Array.from(users).map(u => bot.sleet.formatUser(u, false) + ` \`[${messagesPerUser.get(u.id)}]\``).join(', ').substring(0, 1500)
  const msg = `${firstMsg.channel}, **${messages.size}** messages\n${userList}`
  const files = [{ name: FILENAME, attachment: Buffer.from(txt, 'utf8') }]
  const sent = await sendLog(config.channel, ':fire:', 'Channel Purged', msg, { files })
  const attach = sent.attachments.first().id
  sent.edit(`${sent.content}\n<${generateArchiveUrl(sent.channel.id, attach)}>`)
}

class RollingStore {
  constructor(max) {
    this.max = max
    this.array = []
  }

  add(e) {
    this.array.push(e)
    return this.array = this.array.slice(0, this.max)
  }

  has(e) {
    return this.array.includes(e)
  }
}

const lastDeleteEntry = new Map()
const deletedStore = new RollingStore(50)
module.exports.events.messageDelete = async (bot, message) => {
  if (!message.guild) return
  const config = getConfig(message.guild)
  if (!config || !config.settings.message_delete) return

  // Check the raw event handler above
  if (message.uncached) {
    if (deletedStore.has(message.id)) return;
    const msg = `Uncached message (${message.id}) in ${message.channel}`
    sendLog(config.channel, ':wastebasket:', 'Message Deleted', msg)
    return
  }

  deletedStore.add(message.id)
  const after = lastDeleteEntry.get(message.guild.id)
  let executor, reason

  if (message.guild.me.hasPermission('VIEW_AUDIT_LOG')) {
    const lastDel = (after ?
      (await message.guild.fetchAuditLogs({type: 'MESSAGE_DELETE', limit: 1})) :
      (await message.guild.fetchAuditLogs({type: 'MESSAGE_DELETE', limit: 1, after}))).entries.first()

    if (lastDel && lastDel.target.id === message.author.id && lastDel.id !== after) {
      ({executor, reason} = lastDel)
    }

    if (lastDel)
      lastDeleteEntry.set(message.guild.id, lastDel.id)
  }

  const delLog = message.edits.reverse().map((m, i) => messageToLog(m, {username: false, id: false, includeAttach: i === 0})).join('\n')
  const attachProxy = message.attachments.array().map(a => a.url.replace('https://cdn.discordapp.com', '<https://media.discordapp.net') + '>')
  const msg = `(${message.id}) from ${bot.sleet.formatUser(message.author)} in ${message.channel}`
          + (executor ? ` by ${bot.sleet.formatUser(executor)}` : '')
          + (reason ? ` for "${reason}"` : '')
          + (message.edits.length > 1 ? `, **${message.edits.length}** revisions` : '')
          + '\n'
          + (attachProxy.length > 0 ? `Attachment Proxies: ${attachProxy.join(', ')}\n` : '')
          + '```\n' + delLog.replace(/(`{3})/g, '`\u{200B}'.repeat(3)).substring(0, 1500) + '\n```'

  sendLog(config.channel, ':wastebasket:', 'Message Deleted', msg)
}

const HAMMER = '\ud83d\udd28' // 🔨
const BOOT = '\ud83d\udc62' // 👢
const INFO = '\u2139\ufe0f' // ℹ️
const MENTION = '\ud83d\udcdd' // 📝
const userIdRegex = /(?:.*(?:from).*?|.*)\((\d+)\).*$/m

module.exports.events.messageReactionAdd = (bot, react, user) => {
  if (!react.message.guild) return
  const config = getConfig(react.message.guild)
  if (!config || !config.settings.reaction_actions) return
  if (react.message.author.id !== bot.user.id || react.message.channel.id !== config.channel.id) return

  const [,id] = (userIdRegex.exec(react.message.content) || [,null])

  if (id === null) return

  const message = react.message

  switch (react.emoji.name) {
    case HAMMER:
      message.guild.ban(id)
        .then(m => message.channel.send(`Banned user <@${id}>`))
        .catch(e => message.channel.send(`Failed to ban user ${id}:\n*${e}*`))
      break

    case BOOT:
      message.guild.fetchMember(id).then(m => {
        if (m.kickable) {
          m.kick().then(e => message.channel.send(`Kicked user <@${id}>`)).catch(() => {})
        } else {
          message.channel.send('Failed to kick user, insufficient permissions')
        }
      })
      .catch(e => message.channel.send('Failed to fetch user to kick them'))
      break

    case INFO:
      message.channel.send(id)
      break

    case MENTION:
      message.channel.send(`<@${id}>`)
      break
  }
}

function messageToLog(message, {username = true, id = true, includeAttach = true} = {}) {
  return `[${curTime(message.editedAt || message.createdAt)}]` +
           (id ? '(' + message.id + ') ' : '') +
           `${username ? message.author.tag + ' :' : ''} ${message.content}` +
           `${(includeAttach && message.attachments.first() !== undefined) ? ' | Attach: ' + message.attachments.array().map(a => a.url).join(', ') : ''}`
}

function curTime(date) {
  const d = date || new Date()
  return padExpressions`${d.getUTCHours()}:${d.getUTCMinutes()}:${d.getUTCSeconds()}`
}

function padLeft(msg, pad, padChar = '0') {
  padChar = '' + padChar
  msg = '' + msg
  let padded = padChar.repeat(pad)
  return padded.substring(0, padded.length - msg.length) + msg
}

function sleep(time) {
  return new Promise(r => setTimeout(r, time))
}

function toPrim(val) {
  val += ''
  return +val || (val.toLowerCase() === 'true' ? true : null) || (val.toLowerCase() === 'false' ? false : (val.toLowerCase() === 'null' ? null : val))
}

async function userInGuild(guild, user) {
  try {
    return await guild.fetchMember(user)
  } catch (e) {
    return false
  }
}

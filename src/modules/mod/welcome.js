module.exports.config = {
  name: 'welcome',
  help: 'welcomes people',
  expandedHelp:'doesnt rewelcome',
  invisible: true,
  dbScript: 'welcome.sql',
}

const Discord = require('discord.js')
const modlog = weakRequire('./modlog.js') || {createLog() {}}
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
  ],
  { table: 'welcome' },
)

async function previouslyJoined(db, guild_id, user_id) {
  return (await db.one('SELECT COUNT(*) FROM welcome WHERE guild_id = $<guild_id>::BigInt AND $<user_id>::BigInt = ANY (joins)', { guild_id, user_id })).count === '1'
}

async function fetchJoinInfo(db, guild_id, user_id) {
  return (
    await db.oneOrNone('SELECT message, channel, rejoins, instant, ignore_roles, react_with, $<user_id>::BigInt = ANY (joins) AS previously_joined FROM welcome WHERE guild_id = $<guild_id>::BigInt',
      { guild_id, user_id })
  )
}

async function addJoin(db, guild_id, user_id) {
  return (
    await db.none('UPDATE welcome SET joins = array_append(joins, $<user_id>::BigInt) WHERE guild_id = $<guild_id>::BigInt', { guild_id, user_id })
  )
}

function createDefaultValueProxy(val, defaultVal) {
  return new Proxy(val, {
    get(target, name) {
      if ( !(name in target) ) target[name] = (typeof defaultVal === 'function') ? defaultVal(name) : defaultVal
      return target[name]
    }
  })
}

// guildId => Set of new user Ids
const newJoins = createDefaultValueProxy({}, () => new Set())
// guildId => Last guild join settings
const joinSettings = createDefaultValueProxy({}, {})

module.exports.events = {}
module.exports.events.guildMemberAdd = async (bot, member) => {
  const guild = member.guild
  const joinInfo = await fetchJoinInfo(bot.sleet.db, guild.id, member.id)

  if (joinInfo === null) {
    // No join settings for this guild...
    return
  }

  if (joinInfo.rejoins === false && joinInfo.previously_joined) {
    // Don't rewelcome
    return
  }

  if (joinInfo.instant) {
    sendWelcome(bot, bot.channels.get(joinInfo.channels || guild.channels.first().id), {user: member, channel: null}, joinInfo.message)
  } else {
    newJoins[guild.id].add(member.id)
    joinSettings[guild.id] = joinInfo
  }
}

module.exports.events.everyMessage = async (bot, message) => {
  const guild = message.guild

  if (!guild || !newJoins[guild.id].has(message.author.id) || !message.member || message.system) {
    return
  }

  const joinSet = joinSettings[message.guild.id]
  let channel = message.channel

  if (joinSet.ignore_roles && joinSet.ignore_roles.some(r => message.member.roles.has(r))) {
    // Ignore some "special" users ie. rolebanned ones
    return
  }

  newJoins[message.guild.id].delete(message.author.id)

  if (joinSet.channel !== null) {
    if (message.channel.id !== joinSet.channel && joinSet.react_with) {
      message.react(joinSet.react_with)
    }
    channel = bot.channels.get(joinSet.channel)
  }

  sendWelcome(bot, channel, {user: message.author, channel: message.channel}, joinSet.message)
}

function sendWelcome(bot, channel, data = {user: null, channel: null}, msg) {
  if (channel === null) return

  addJoin(bot.sleet.db, channel.guild.id, data.user.id)

  modlog.createLog(channel.guild, 'member_welcome', '\u{1F44B}', 'Member Welcome', `${bot.sleet.formatUser(data.user)} in ${data.channel}`)

  return channel.send(textReplace(msg, data))
}

function textReplace(msg, data = {user: null, channel: null}) {
  return msg.replace(/{@user}/g, data.user.toString())
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

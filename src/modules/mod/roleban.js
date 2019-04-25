const rolebanCmds   = ['roleban', 'forebode', 'toss', 'defenestrate', 'shup', 'suplex', '!']
const unRolebanCmds = ['unroleban', 'unforebode', 'untoss', 'refenestrate']

module.exports.config = {
  name: 'roleban',
  invokers: [...rolebanCmds, ...unRolebanCmds],
  help: 'Gives roles',
  expandedHelp: 'Replaces all of a user\'s roles with a roleban role\nRequires "Manage Roles", supports multiple users at once.',
  usage: ['Roleban a dude', 'roleban [@user|userID]', 'Roleban many dudes', 'roleban [@user userID @user...]', 'Unroleban', 'unroleban @user']
}

const roleNames = ['roleban', 'rolebanned', 'tossed', 'muted', 'foreboden', 'silenced']
const roleIds   = ['122150407806910464', '303723450747322388', '367873664118685697', '382658296504385537']
// r/ut, atlas yt, perfect, ut rp
const mentionRegex = /<@!?[0-9]+>/
const rolebanned = new Map()

async function fetchLogChannel(db, guild_id) {
  const res = await db.oneOrNone('SELECT settings->\'logChannel\' AS log_channel FROM settings WHERE guild_id = $1', [guild_id])
  return res ? res.log_channel : null
}

const Discord = require('discord.js')
const { Collection } = Discord
const botUnrolebanned = []

module.exports.events = {}
module.exports.events.message = async (bot, message) => {
  if (!message.guild)
    return
  if (!message.member.permissions.has('MANAGE_ROLES'))
    return message.channel.send('You need at least `Manage Roles`.')

  const [cmd, ...users] = bot.sleet.shlex(message)
  const rbRole = getRolebanRole(message.guild)

  if (rbRole === null)
    return message.channel.send('I could not find a role to use, name a role one of: `' + roleNames.join('`, `') + '`.')

  if (message.member.highestRole.position <= rbRole.position)
    return message.channel.send('Your highest role needs to higher than the `' + rbRole.name + '` role to (un)roleban.')

  const members = await bot.sleet.extractMembers(message.content, message)

  if (members.every(m => m === null))
    return message.channel.send('I got nobody to (un)roleban.')


  if (rolebanCmds.includes(cmd))
    roleban(bot, message, members, rbRole)
  else if (unRolebanCmds.includes(cmd))
    unroleban(bot, message, members, rbRole)

  // this should never be reached
}

async function roleban(bot, message, members, rbRole, options = {}) {
  for (let m of members) {
    if (m === null) continue

    if (m.id === message.author.id) {
      message.channel.send(`You're trying to roleban yourself. I appreciate your dedication though.`)
      continue
    }

    if (m.id === bot.user.id) {
      message.channel.send('I am not rolebanning myself.')
      continue
    }

    if (message.member.highestRole && message.member.highestRole.position <= m.highestRole.position) {
      message.channel.send(`${bot.sleet.formatUser(m.user, {id: false})} is either higher or equal to you.`)
      continue
    }

    if (m.roles.has(rbRole.id)) {
      message.channel.send(`${bot.sleet.formatUser(m.user)} is already rolebanned!`)
      continue
    }

    let prevRoles = m.roles.filter(r => r.id !== m.guild.id)

    m.setRoles([rbRole], `[ Roleban by ${message.author.tag} (${message.author.id}) ]`)
      .then(async _ => {
        let msg = `${bot.sleet.formatUser(m.user)} has been rolebanned ` +
                  `by ${bot.sleet.formatUser(message ? message.author : bot.user)}` +
                  '\n**Previous roles:** ' + (prevRoles.size === 0 ? 'None.' :
                    '`' + prevRoles.array().map(r=>r.name).join('\`, \`') + '`')

        if (!options.silent) message.channel.send(msg)

        const logChannelId = await fetchLogChannel(bot.sleet.db, m.guild.id)
        if (logChannelId && message.channel.id !== logChannelId) {
          message.guild.channels.get(logChannelId).send(`In ${message.channel} ` + msg)
        }

        rolebanned.set(m.id, prevRoles)
      }).catch(_ => {
        message.channel.send(`Failed to roleban ${m.user.tag}. Check my perms?\n${_}`)
      })
  }
}
module.exports.roleban = roleban

async function unroleban(bot, message, members, rbRole, executor = null) {
  for (let m of members) {
    if (m === null) continue
    if (!m.roles.has(rbRole.id)) {
      message.channel.send(`${bot.sleet.formatUser(m.user)} is not rolebanned.`)
      continue
    }

    const prevRoles = (rolebanned.get(m.id) || m.roles).filter(r => r.id !== rbRole.id && r.id !== m.guild.id)
    const by = getBy(bot, message, executor)
    botUnrolebanned.push(m.id)

    m.setRoles(prevRoles, `[ Unroleban by ${by} ]`)
      .then(async _ => {
        const msg = `${bot.sleet.formatUser(m.user)} has been unrolebanned ` +
                  `by ${by}\n` +
                  (rolebanned.delete(m.id) ?
                    '**Roles restored:** ' + (prevRoles.size === 0 ? 'None.' :
                      '`' + prevRoles.array().map(r=>r.name).join('\`, \`') + '`')
                  : 'No roles restored.')

        if (message) message.channel.send(msg)

        const logChannelId = await fetchLogChannel(bot.sleet.db, m.guild.id)
        if (logChannelId && (message ? message.channel.id !== logChannelId : true)) {
          m.guild.channels.get(logChannelId).send((message ? `In ${message.channel} ` : 'By manual role removal ') + msg)
        }
      }).catch(_ =>
        message.channel.send(`Failed to unroleban ${bot.sleet.formatUser(m.user)}. Check my perms?\n${_}`)
      )
  }
}
module.exports.unroleban = unroleban

function getBy(bot, message, executor) {
  return (executor === null ? null : (executor instanceof Discord.User ? bot.sleet.formatUser(executor) : executor)) || (message ? bot.sleet.formatUser(message.author) : 'Me')
}

module.exports.events.guildMemberUpdate = async (bot, oldM, newM) => {
  if (botUnrolebanned.includes(oldM.id)) {
    botUnrolebanned.splice(botUnrolebanned.indexOf(oldM.id), 1)
    return
  }

  const rbRole = getRolebanRole(oldM.guild)

  // Wasn't rolebanned before
  if (!rbRole || !oldM.roles.has(rbRole.id) || !rolebanned.get(oldM.id)) {
    return
  }

  const auditLogs = (await oldM.guild.fetchAuditLogs({limit: 1, type: 'MEMBER_ROLE_UPDATE'})).entries
  let executor = 'someone unknown!'

  if (auditLogs.first()) {
    const e = auditLogs.first()
    if (e.target.id === oldM.id && e.changes[0] && e.changes[0].key === '$remove' && e.changes[0]['new'].length === 1 && e.changes[0]['new'][0].id === rbRole.id) {
      executor = e.executor
    }
  }

  if (executor && executor.id === bot.user.id) {
    // lol it's me
    return
  }

  unroleban(bot, null, [oldM], rbRole, executor)
}

function fetchMember(guild, user) {
  return new Promise(r => guild.fetchMember(user)
           .then(m => r(m))
           .catch(e => r(null))
         )
}

function getRolebanRole(guild) {
  return guild.roles.find(r => roleNames.includes(r.name.toLowerCase()) || roleIds.includes(r.id))
}

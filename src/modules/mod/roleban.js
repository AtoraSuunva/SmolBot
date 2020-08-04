const rolebanCmds   = ['roleban', 'forebode', 'toss', 'defenestrate', 'shup', 'suplex', '!', 'fuck up', 'australia']
const unRolebanCmds = ['unroleban', 'unforebode', 'untoss', 'refenestrate']

module.exports.config = {
  name: 'roleban',
  invokers: [...rolebanCmds, ...unRolebanCmds],
  help: 'Gives roles',
  expandedHelp: 'Replaces all of a user\'s roles with a roleban role\nRequires "Manage Roles", supports multiple users at once.',
  usage: ['Roleban a dude', 'roleban [@user|userID]', 'Roleban many dudes', 'roleban [@user userID @user...]', 'Unroleban', 'unroleban @user']
}

const invokers = module.exports.config.invokers
const roleNames = ['roleban', 'rolebanned', 'tossed', 'muted', 'foreboden', 'silenced']
const roleIds   = ['122150407806910464', '303723450747322388', '367873664118685697', '382658296504385537']
// r/ut, atlas yt, perfect, ut rp
const mentionRegex = /<@!?[0-9]+>/

async function fetchLogChannel(db, guild_id) {
  const res = await db.oneOrNone('SELECT settings->\'logChannel\' AS log_channel FROM settings WHERE guild_id = $<guild_id>', { guild_id })
  return res ? res.log_channel : null
}

async function fetchPreviousRoles(db, user_id) {
  const res = await db.oneOrNone('SELECT * FROM rolebanned WHERE user_id = $<user_id>', { user_id })
  return res ? res.roles : null
}

async function storePreviousRoles(db, user_id, roles) {
  const prev = await fetchPreviousRoles(db, user_id)

  if (prev === null) {
    await db.none('INSERT INTO rolebanned (user_id, roles) VALUES ($<user_id>, $<roles>)', { user_id, roles })
  } else {
    await db.none('UPDATE rolebanned SET roles = $<roles> WHERE user_id = $<user_id>', { user_id, roles })
  }
}

async function deletePreviousRoles(db, user_id) {
  await db.none('DELETE FROM rolebanned WHERE user_id = $<user_id>', { user_id })
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

  const members = await bot.sleet.extractMembers(message.content, message, { invokers })

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

    // Disconnect them from voice as well
    if (m.voiceChannel) {
      m.setVoiceChannel(null).catch(() => {})
    }

    // We can't touch managed roles, so we need to keep them
    // Good to handle cases like nitro boosters who you need to roleban
    const prevRoles = m.roles.filter(r => r.id !== m.guild.id && !r.managed)
    const keepRoles = m.roles.filter(r => r.managed).array()

    m.setRoles([rbRole, ...keepRoles], `[ Roleban by ${message.author.tag} (${message.author.id}) ]`)
      .then(async _ => {
        const logChannelId = await fetchLogChannel(bot.sleet.db, m.guild.id)
        const logToChannel = logChannelId && (message ? message.channel.id !== logChannelId : true)
        const by = bot.sleet.formatUser(message ? message.author : bot.user)
        const baseMsg = `${bot.sleet.formatUser(m.user)} has been rolebanned by ${by}`
        const chanMsg = message ? ` in ${message.channel}` : ' by manual role removal'
        const rolesMsg = (prevRoles.size === 0
                          ? 'No previous roles'
                          : `**Previous roles:** ${displayRoles(m.guild, prevRoles)}`)

        if (!options.silent) {
          message.channel.send(baseMsg + '\n' + rolesMsg)
        }

        if (logToChannel) {
          m.guild.channels.get(logChannelId).send(baseMsg + chanMsg + '\n' + rolesMsg)
        }

        storePreviousRoles(bot.sleet.db, m.id, prevRoles.array().map(r => r.id))
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

    const prevRoles = (await fetchPreviousRoles(bot.sleet.db, m.id) || m.roles.map(r => r.id)).filter(r => r !== rbRole.id && r !== m.guild.id)
    const by = getBy(bot, message, executor)
    botUnrolebanned.push(m.id)

    m.setRoles(prevRoles, `[ Unroleban by ${by} ]`)
      .then(async _ => {
        const logChannelId = await fetchLogChannel(bot.sleet.db, m.guild.id)
        const logToChannel = logChannelId && (message ? message.channel.id !== logChannelId : true)
        const baseMsg = `${bot.sleet.formatUser(m.user)} has been unrolebanned by ${by}`
        const chanMsg = message ? ` in ${message.channel}` : ' by manual role removal'
        const rolesMsg = (prevRoles.length === 0
                          ? 'No roles restored'
                          : `**Roles restored:** ${displayRoles(m.guild, prevRoles)}`)

        if (message) {
          message.channel.send(baseMsg + '\n' + rolesMsg)
        }

        if (logToChannel) {
          m.guild.channels.get(logChannelId).send(baseMsg + chanMsg + '\n' + rolesMsg)
        }

        deletePreviousRoles(bot.sleet.db, m.id)
      }).catch(_ =>
        message.channel.send(`Failed to unroleban ${bot.sleet.formatUser(m.user)}. Check my perms?\n${_}`)
      )
  }
}
module.exports.unroleban = unroleban

function displayRoles(guild, prevRoles) {
  return '`' + prevRoles.map(r => roleName(guild, r)).join('`, `') + '`'
}

function roleName(guild, role) {
  return role.name || guild.roles.get(role).name
}

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
  if (!rbRole || !oldM.roles.has(rbRole.id) || !await fetchPreviousRoles(bot.sleet.db, oldM.id)) {
    return
  }

  const auditLogs = (await oldM.guild.fetchAuditLogs({limit: 1, type: 'MEMBER_ROLE_UPDATE'})).entries
  let executor = 'someone unknown!'

  if (auditLogs.first()) {
    const e = auditLogs.first()
    if (e.target.id === oldM.id && e.changes[0] && e.changes[0].key === '$remove' && e.changes[0]['new'].length === 1 && e.changes[0]['new'][0].id === rbRole.id) {
      executor = e.executor
    } else {
      // just give up apparantly there's a bug with this
      return
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

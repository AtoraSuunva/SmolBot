const rolebanCmds = [
  'roleban',
  'forebode',
  'toss',
  'defenestrate',
  'shup',
  'suplex',
  '!',
  'fuck up',
  'australia',
  'brazil',
]
const unRolebanCmds = ['unroleban', 'unforebode', 'untoss', 'refenestrate']
const invokers = [...rolebanCmds, ...unRolebanCmds]

module.exports.config = {
  name: 'roleban',
  invokers,
  help: 'Gives roles',
  expandedHelp:
    'Replaces all of a user\'s roles with a roleban role\nRequires "Manage Roles", supports multiple users at once.',
  usage: [
    'Roleban a dude',
    'roleban [@user|userID]',
    'Roleban many dudes',
    'roleban [@user userID @user...]',
    'Unroleban',
    'unroleban @user',
  ],
}

const roleNames = [
  'roleban',
  'rolebanned',
  'tossed',
  'muted',
  'foreboden',
  'silenced',
]
const roleIds = [
  '122150407806910464',
  '303723450747322388',
  '367873664118685697',
  '382658296504385537',
]
// r/ut, atlas yt, perfect, ut rp
const mentionRegex = /<@!?[0-9]+>/

async function fetchLogChannel(db, guild_id) {
  const res = await db.oneOrNone(
    "SELECT settings->'logChannel' AS log_channel FROM settings WHERE guild_id = $<guild_id>",
    { guild_id },
  )
  return res ? res.log_channel : null
}

async function fetchPreviousRoles(db, user_id) {
  const res = await db.oneOrNone(
    'SELECT * FROM rolebanned WHERE user_id = $<user_id>',
    { user_id },
  )
  return res ? res.roles : null
}

async function storePreviousRoles(db, user_id, roles) {
  const prev = await fetchPreviousRoles(db, user_id)

  if (prev === null) {
    await db.none(
      'INSERT INTO rolebanned (user_id, roles) VALUES ($<user_id>, $<roles>)',
      { user_id, roles },
    )
  } else {
    await db.none(
      'UPDATE rolebanned SET roles = $<roles> WHERE user_id = $<user_id>',
      { user_id, roles },
    )
  }
}

async function deletePreviousRoles(db, user_id) {
  await db.none('DELETE FROM rolebanned WHERE user_id = $<user_id>', {
    user_id,
  })
}

const Discord = require('discord.js')
const { Collection } = Discord
const botUnrolebanned = []

module.exports.events = {}
module.exports.events.message = async (bot, message) => {
  if (!message.guild) return
  if (!message.member.permissions.has('MANAGE_ROLES'))
    return message.channel.send('You need at least `Manage Roles`.')

  const [cmd, ...users] = bot.sleet.shlex(message)
  const rbRole = getRolebanRole(message.guild)

  if (rbRole === null)
    return message.channel.send(
      'I could not find a role to use, name a role one of: `' +
        roleNames.join('`, `') +
        '`.',
    )

  if (message.member.roles.highest.position <= rbRole.position)
    return message.channel.send(
      'Your highest role needs to higher than the `' +
        rbRole.name +
        '` role to (un)roleban.',
    )

  const members = await bot.sleet.extractMembers(message, { invokers })

  if (members.every(m => m === null))
    return message.channel.send('I got nobody to (un)roleban.')

  if (rolebanCmds.includes(cmd)) roleban(bot, message, members, rbRole)
  else if (unRolebanCmds.includes(cmd)) unroleban(bot, message, members, rbRole)

  // this should never be reached
}

async function roleban(bot, message, members, rbRole, options = {}) {
  for (let m of members) {
    if (m === null) continue

    if (m.id === message.author.id) {
      message.channel.send(
        `You're trying to roleban yourself. I appreciate your dedication though.`,
      )
      continue
    }

    if (m.id === bot.user.id) {
      message.channel.send('I am not rolebanning myself.')
      continue
    }

    if (
      message.member.roles.highest &&
      message.member.roles.highest.position <= m.roles.highest.position
    ) {
      message.channel.send(
        `${bot.sleet.formatUser(m.user, {
          id: false,
        })} is either higher or equal to you.`,
      )
      continue
    }

    if (m.roles.cache.has(rbRole.id)) {
      message.channel.send(
        `${bot.sleet.formatUser(m.user)} is already rolebanned!`,
      )
      continue
    }

    // Disconnect them from voice as well
    if (m.voice.channel) {
      m.voice.kick().catch(() => {})
    }

    // We can't touch managed roles, so we need to keep them
    // Good to handle cases like nitro boosters who you need to roleban
    const prevRoles = m.roles.cache.filter(r => r.id !== m.guild.id && !r.managed)
    const keepRoles = m.roles.cache.filter(r => r.managed).array()

    m.roles
      .set(
        [rbRole, ...keepRoles],
        `[ Roleban by ${message.author.tag} (${message.author.id}) ]`,
      )
      .then(async () => {
        const logChannelId = await fetchLogChannel(bot.sleet.db, m.guild.id)
        const logToChannel =
          logChannelId && (message ? message.channel.id !== logChannelId : true)
        const by = bot.sleet.formatUser(message ? message.author : bot.user)
        const baseMsg = `${bot.sleet.formatUser(m.user)}${
          options.mention ? ` ${m.user}` : ''
        } has been rolebanned by ${by}`
        const chanMsg = message
          ? ` in ${message.channel}`
          : ' by manual role removal'
        const rolesMsg =
          prevRoles.size === 0
            ? 'No previous roles'
            : `**Previous roles:** ${displayRoles(m.guild, prevRoles)}`

        if (!options.silent) {
          message.channel.send(baseMsg + '\n' + rolesMsg)
        }

        if (logToChannel) {
          m.guild.channels
            .get(logChannelId)
            .send(baseMsg + chanMsg + '\n' + rolesMsg)
        }

        storePreviousRoles(
          bot.sleet.db,
          m.id,
          prevRoles.array().map(r => r.id),
        )
      })
      .catch(e => {
        if (e instanceof Discord.DiscordAPIError && e.code === 50013) {
          return message.channel.send(
            `I don't have the permissions to roleban ${bot.sleet.formatUser(
              m.user,
            )}`,
          )
        }

        bot.sleet.logger.error(e, {
          message: message.channel.id,
          guild: message.guild.id,
          content: message.content,
        })
        message.channel.send(
          `Failed to roleban ${m.user.tag}. Check my perms?\n${e}`,
        )
      })
  }
}
module.exports.roleban = roleban

async function unroleban(bot, message, members, rbRole, executor = null) {
  for (let m of members) {
    if (m === null) continue
    if (!m.roles.cache.has(rbRole.id)) {
      message.channel.send(`${bot.sleet.formatUser(m.user)} is not rolebanned.`)
      continue
    }

    const prevRoles = (
      (await fetchPreviousRoles(bot.sleet.db, m.id)) || m.roles.cache.map(r => r.id)
    ).filter(r => r !== rbRole.id && r !== m.guild.id)
    const keepRoles = m.roles.cache.filter(r => r.managed).array()
    const by = getBy(bot, message, executor)
    botUnrolebanned.push(m.id)

    m.roles
      .set([...prevRoles, ...keepRoles], `[ Unroleban by ${by} ]`)
      .then(async () => {
        const logChannelId = await fetchLogChannel(bot.sleet.db, m.guild.id)
        const logToChannel =
          logChannelId && (message ? message.channel.id !== logChannelId : true)
        const baseMsg = `${bot.sleet.formatUser(
          m.user,
        )} has been unrolebanned by ${by}`
        const chanMsg = message
          ? ` in ${message.channel}`
          : ' by manual role removal'
        const rolesMsg =
          prevRoles.length === 0
            ? 'No roles restored'
            : `**Roles restored:** ${displayRoles(m.guild, prevRoles)}`

        if (message) {
          message.channel.send(baseMsg + '\n' + rolesMsg)
        }

        if (logToChannel) {
          m.guild.channels
            .get(logChannelId)
            .send(baseMsg + chanMsg + '\n' + rolesMsg)
        }

        deletePreviousRoles(bot.sleet.db, m.id)
      })
      .catch(async e => {
        if (e instanceof Discord.DiscordAPIError && e.code === 50013) {
          bot.sleet.logger.error(e)
          return message.channel.send(
            `I don't have the permissions to unroleban ${bot.sleet.formatUser(
              m.user,
            )}`,
          )
        }

        const logChannelId = await fetchLogChannel(bot.sleet.db, m.guild.id)
        const destination = !logChannelId
          ? message
            ? message.channel
            : null
          : m.guild.channels.cache.get(logChannelId)

        if (!destination || !message) {
          return bot.sleet.logger.error(e)
        }

        bot.sleet.logger.error(
          e,
          message
            ? {
                message: message.channel.id,
                guild: message.guild.id,
                content: message.content,
              }
            : { from: 'no message' },
        )
        destination.send(
          `Failed to unroleban ${bot.sleet.formatUser(
            m.user,
          )}. Check my perms?\n${e}`,
        )
      })
  }
}
module.exports.unroleban = unroleban

function displayRoles(guild, prevRoles) {
  return '`' + prevRoles.map(r => roleName(guild, r)).join('`, `') + '`'
}

function roleName(guild, role) {
  return role.name || guild.roles.cache.get(role).name
}

function getBy(bot, message, executor) {
  return (
    (executor === null
      ? null
      : executor instanceof Discord.User
      ? bot.sleet.formatUser(executor)
      : executor) || (message ? bot.sleet.formatUser(message.author) : 'Me')
  )
}

module.exports.events.guildMemberUpdate = async (bot, oldM, newM) => {
  if (botUnrolebanned.includes(oldM.id)) {
    botUnrolebanned.splice(botUnrolebanned.indexOf(oldM.id), 1)
    return
  }

  const rbRole = getRolebanRole(oldM.guild)

  // Wasn't rolebanned before
  if (
    !rbRole ||
    !oldM.roles.cache.has(rbRole.id) ||
    !(await fetchPreviousRoles(bot.sleet.db, oldM.id))
  ) {
    return
  }

  let executor = 'someone unknown'

  if (oldM.guild.me.hasPermission('VIEW_AUDIT_LOG')) {
    const auditLogs = (
      await oldM.guild.fetchAuditLogs({ limit: 1, type: 'MEMBER_ROLE_UPDATE' })
    ).entries

    if (auditLogs.first()) {
      const e = auditLogs.first()
      if (
        e.target.id === oldM.id &&
        e.changes[0] &&
        e.changes[0].key === '$remove' &&
        e.changes[0]['new'].length === 1 &&
        e.changes[0]['new'][0].id === rbRole.id
      ) {
        executor = e.executor
      } else {
        // just give up apparantly there's a bug with this
        return
      }
    }
  }

  if (executor && executor.id === bot.user.id) {
    // lol it's me
    return
  }

  unroleban(bot, null, [oldM], rbRole, executor)
}

function fetchMember(guild, user) {
  return new Promise(r =>
    guild.members
      .fetch(user)
      .then(m => r(m))
      .catch(e => r(null)),
  )
}

function getRolebanRole(guild) {
  return guild.roles.cache.find(
    r => roleNames.includes(r.name.toLowerCase()) || roleIds.includes(r.id),
  )
}

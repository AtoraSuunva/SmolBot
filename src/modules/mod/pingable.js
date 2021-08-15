module.exports.config = {
  name: 'pingable',
  invokers: ['pingable', 'mentionable'],
  help: 'Allows a role to be mentionnable until you send a mention.',
  expandedHelp: '`pingable [role]`',
  invisible: true,
}

const pingableRoles = new Map()

module.exports.events = {}
module.exports.events.message = async (bot, message) => {
  if (!message.guild) return

  const [cmd, role] = bot.sleet.shlex(message)
  const pingRole = message.guild.roles.cache.find(
    r => r.name !== '@everyone' && r.name.toLowerCase() === role,
  )

  if (pingRole === null) {
    return message.channel.send(
      'That is not a valid role! The name needs to match exactly!',
    )
  }

  if (
    message.member.permissions.has('MANAGE_ROLES') &&
    message.member.roles.highest.position <= pingRole.position
  ) {
    return message.channel.send(
      "You either don't have manage roles permissions, or you're trying to manage a role above you!",
    )
  }

  if (!pingRole.editable)
    return message.channel.send('I cannot edit that role.')

  if (pingRole.mentionnable)
    return message.channel.send('That role is already mentionable.')

  await pingRole.setMentionable(true)
  const msg = await message.channel.send(`${pingRole.name} is now mentionable.`)

  pingableRoles.set(pingRole.id, {
    role: pingRole,
    msg,
    timer: setTimeout(() => {
      pingRole.setMentionable(false)
      msg.edit(`${info.role.name} is no longer mentionable.`)
    }, 60000 * 5),
  })
}

module.exports.events.everyMessage = async (bot, message) => {
  for (let [roleId, info] of pingableRoles) {
    if (!message.mentions.roles.cache.has(roleId)) continue

    clearTimeout(info.timer)
    info.role.setMentionable(false)
    info.msg.edit(`${info.role.name} is no longer mentionable.`)
  }
}

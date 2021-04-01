module.exports.config = {
  name: 'send',
  invokers: ['send', 'say', 'send-disable'],
  help: 'sends things',
  expandedHelp: 'send [#channel|channel.id] thigns here',
  invisible: true,
}

module.exports.events = {}
module.exports.events.message = (bot, message) => {
  if (!message.guild) return

  let args = bot.sleet.shlex(message.content)
  const config = bot.sleet.config

  if (args[1] === undefined)
    return message.channel.send('So what do you want me to send?')

  if (args[1].toLowerCase() === 'nudes')
    return message.author
      .send('Fuck you.')
      .then(m => message.channel.send('Check your DMs~'))

  if (
    args[0] === 'send-disable' &&
    message.member &&
    message.member.roles.has('244328249801310219')
  )
    return message.channel.send(bot.sleet.unloadModule('send'))

  if (args.length < 2) return message.channel.send('a')

  let channel =
    args[1].match(/<?#?\d+>?/) === null
      ? message.channel.id
      : args[1].match(/<?#?(\d+)>?/)[1]

  if (args[1].match(/<?#?\d+>?/) === null) args.unshift('bepis')

  if (message.author.id === config.owner.id) channel = bot.channels.get(channel)
  else channel = message.guild.channels.get(channel)

  if (channel === undefined)
    return message.channel.send("Couldn't find that channel...")

  if (!channel.permissionsFor(message.author).has('SEND_MESSAGES'))
    return message.channel.send(
      "I'm not letting you use me to send messages in places where you can't.",
    )

  if (!channel.permissionsFor(bot.user).has('SEND_MESSAGES'))
    return message.channel.send("I can't send messages there myself...")

  bot.sleet.logger.info(
    `b!say: ${message.author.username}#${message.author.discriminator} (${
      message.author.id
    }) -> ${channel.name}: ${args.slice(2).join(' ')}`,
  )

  channel
    .send(args.slice(2).join(' ') || 'aaa', { disableEveryone: true })
    .then(c =>
      message.channel.send(
        `${message.author.username}: Sent "${args
          .slice(2)
          .join(' ')}" to ${channel.toString()}`,
      ),
    )
}

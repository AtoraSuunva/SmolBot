const eg = '\u{1f95a}'

module.exports.config = {
  name: 'eg',
  invokers: ['eg', 'egg', eg, 'knot', 'eegg'],
  help: 'eg',
  expandedHelp: 'e\ng',
  invisible: true,
}

const specialEggs = {
  knot: '415315629571178506',
  eegg: '458457477420154880',
}

module.exports.events = {}
module.exports.events.message = (bot, message) => {
  const [cmd, user] = bot.sleet.shlex(message)
  const spegg = cmd.toLowerCase()

  let member
  let emote = eg

  if (specialEggs[spegg]) emote = bot.emojis.get(specialEggs[spegg])
  if (message.guild && message.guild.members.get(user))
    member = message.guild.members.get(user)
  if (message.guild && message.mentions.members.first())
    member = message.mentions.members.first()

  if (member) {
    const egMsg = message.channel.messages
      .filter(m => m.author.id === member.id)
      .last()
    if (egMsg) return egMsg.react(emote)
  }

  if (user && user.toLowerCase() === 'me') return message.react(emote)

  message.channel.send(emote.toString())
}

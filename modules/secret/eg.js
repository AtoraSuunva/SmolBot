//Here's another, minimal example
const eg = '\u{1f95a}'

module.exports.config = {
  name: 'eg',
  invokers: ['eg', 'egg', eg, 'knot'],
  help: 'eg',
  expandedHelp: 'e\ng',
  invisible: true
}

module.exports.events = {}
module.exports.events.message = (bot, message) => {
  const [cmd, user] = bot.sleet.shlex(message),
        emote = (cmd.toLowerCase() === 'knot') ? bot.emojis.get('415315629571178506') : eg
  let member

  if (message.guild && message.guild.members.get(user) ) member = message.guild.members.get(user)
  if (message.guild && message.mentions.members.first()) member = message.mentions.members.first()

  let egMsg = (member) ? message.channel.messages.filter(m => m.author.id === member.id).last() : undefined

  if (egMsg) return egMsg.react(emote)
  if (user && user.toLowerCase() === 'me') return message.react(emote)

  message.channel.send((emote || eg).toString())
}

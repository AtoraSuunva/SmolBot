module.exports.config = {
  name: 'emote',
  invokers: ['emote', 'post'],
  help: 'Gets and posts emotes',
  expandedHelp: 'emote emoteName',
  invisible: true,
}

module.exports.events = {}
module.exports.events.message = (bot, message) => {
  const [cmd, fetch] = bot.sleet.shlex(message)
  let emote

  if (fetch) {
    emote =
      bot.emojis.cache.find(e => e.name === fetch) ||
      bot.emojis.cache.get(fetch)
  }

  if (emote) {
    message.channel.send(emote.toString())
  } else if (fetch) {
    message.channel.send(
      `No emote found. Have a random one: ${bot.emojis.cache.random()}`,
    )
  } else {
    message.channel.send(bot.emojis.cache.random().toString())
  }
}

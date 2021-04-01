module.exports.config = {
  name: 'baka',
  invokers: ['baka', 'aka', 'bulge', 'ulge'],
  help: 'b',
  expandedHelp: 'vaca',
  invisible: true,
}

module.exports.events = {}
module.exports.events.message = (bot, message) => {
  const [cmd] = bot.sleet.shlex(message)

  if (['baka', 'aka'].includes(cmd)) message.channel.send('I-idiot!')
  else message.channel.send(`OwO What's this?`)
}

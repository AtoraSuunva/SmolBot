//Counts words
module.exports.config = {
  name: 'count',
  invokers: ['count'],
  help: 'Counts words',
  expandedHelp: 'b!count some text to count'
}

module.exports.events = {}
module.exports.events.message = (bot, message) => {
  const [cmd, ...w] = bot.sleet.shlex(message)
  message.channel.send(w.join(' ').trim().replace(/\s+/gi, ' ').split(' ').filter(w=>w!=='').length)
}

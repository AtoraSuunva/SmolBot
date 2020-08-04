module.exports.config = {
  name: 'timesince',
  invokers: ['timesince', 'time since',],
  help: 'Time since a date',
  expandedHelp: 'Get the time since a specified date. Use yyyy-mm-dd for best results.',
  usage: ['timesince 2020-02-02', 'Time since "2020-02-02": ...'],
}

const Time = require('./time.js')

module.exports.events = {}
module.exports.events.message = (bot, message) => {
  const [cmd, ...timeArg] = bot.sleet.shlex(message)
  const inTime = timeArg.join(' ')
  const ms = Date.parse(inTime)

  if (Number.isNaN(ms)) {
    return message.channel.send('Could not parse date, try `yyyy-mm-dd`.')
  }

  const date = new Date(ms)
  const duration = Time.since(date).format()

  message.channel.send(`Time since "${inTime}":\n> ${duration}`)
}

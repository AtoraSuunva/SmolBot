module.exports.config = {
  name: 'ip',
  invokers: ['ip', 'hack the mainframe'],
  help: 'Post internal IP',
  expandedHelp: 'Posts the internal IP of the bot.',
  invisible: true,
}

const childProcess = require('child_process')

module.exports.events = {}
module.exports.events.message = async (bot, message) => {
  if (message.author.id === bot.sleet.config.owner.id)
    return message.channel.send(await getIP())

  message.channel.send(randIPv4())
}

const ipReg = /(?:inet|ether)\s+((?!127)\d{1,3}\.+\d{1,3}\.+\d{1,3}\.+\d{1,3})/

function getIP() {
  return new Promise((res, rej) => {
    childProcess.exec('ifconfig', (err, d) => {
      if (err) rej(err)

      const m = d.match(ipReg)
      res(m ? m[1] : '?.?.?.?')
    })
  })
}

function randIPv4() {
  return [1, 2, 3, 4].map(v => randInt(0, 255)).join('.')
}

function randInt(min, max) {
  min = Math.ceil(min)
  max = Math.floor(max)
  return Math.floor(Math.random() * (max - min + 1)) + min
}

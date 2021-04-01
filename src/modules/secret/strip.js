//wew
module.exports.config = {
  name: 'strip',
  invokers: ['strip'],
  help: 'l-lewd!',
  expandedHelp: '`*glah-ahn~!*`',
  invisible: true,
}

module.exports.events = {}
module.exports.events.message = (bot, message) => {
  //just for you cody
  if (message.author.id === '155900016354000896')
    message.channel.send('Cody I thought you hated stripping?')

  message.channel.send(`O-oh~!`)
}

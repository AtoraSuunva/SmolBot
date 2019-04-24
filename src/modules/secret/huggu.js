//wew
module.exports.config = {
  name: 'huggu',
  invokers: ['hug', 'huggu', '*hug*', '*huggu*'],
  help: '*hug*',
  expandedHelp: '*huggu*',
  invisible: true
}

module.exports.events = {}
module.exports.events.message = (bot, message) => {
  message.channel.send(`*huggu*`)
}


module.exports.config = {
  name: 'invite',
  invokers: ['invite'],
  help: 'Invite the bot',
  expandedHelp: 'you cant',
  usage: [],
  invisible: true,
}

module.exports.events = {}

module.exports.events.message = (bot, message) => {
  message.channel.send('This bot is private, and can only be invited by the owner.')
}

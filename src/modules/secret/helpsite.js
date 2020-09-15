module.exports.config = {
  name: 'helpsite',
  help: 'help site',
  expandedHelp: 'site help',
  invisible: true
}

module.exports.events = {}
module.exports.events.everyMessage = (bot, message) => {
  if (message.author.bot || message.author.id === bot.user.id) return
  if (message.content.startsWith(`<@${bot.user.id}>`) || message.content.startsWith(`<@!${bot.user.id}>`)) {
    message.reply('https://giraffeduck.com/bots/smol/help/')
  }
}


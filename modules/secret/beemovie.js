//wew
module.exports.config = {
  name: 'movie',
  invokers: ['movie'],
  help: 'according to all known laws...',
  expandedHelp: 'Posts a random snippet of the bee movie',
  invisible: true
}

const fs = require('fs')

module.exports.events = {}
module.exports.events.message = (bot, message) => {
  fs.readFile(__dirname + '/beemovie.txt', 'utf8', (err, data) => {
    if (err) bot.sleet.log.error(err)

    const bee = data.split('\n')
    const movie = Math.floor(Math.random() * bee.length)

    message.channel.send(((bee[movie-1] || '') + '\n') + bee[movie] + ('\n' + (bee[movie+1] || '')))
  })
}


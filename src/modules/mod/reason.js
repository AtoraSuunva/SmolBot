module.exports.config = {
  name: 'reason',
  invokers: ['reason'],
  help: 'Reasons ban logs',
  expandedHelp: 'Uses the message id of the ban',
  usage: ['Reason something', 'reason [message id] he was a bad boi'],
  invisible: true,
}

const Discord = require('discord.js')
const logs = require('./ban.js').logs

module.exports.events = {}
module.exports.events.message = (bot, message) => {
  let [cmd, msg, ...reason] = bot.sleet.shlex(message)
  reason = reason.join(' ')

  if (!msg) return message.channel.send('I need a message ID to work with.')

  bot.channels
    .get(logs[message.guild.id])
    .fetchMessage(msg)
    .then(m => {
      let embed = m.embeds[0]

      embed.message = embed.footer.embed = embed.author.embed = undefined

      if (!embed || m.author.id !== bot.user.id || embed.title !== 'Ban')
        return message.channel.send('That does not look like a log.')

      let origM = embed.footer.text.match(/\((\d+)\)$/)

      if (!origM)
        return message.channel.send('That does not look like a valid log...')

      let orig = origM[1]

      embed.description =
        '**Reason:**\n' +
        reason +
        (orig !== message.author.id
          ? `\nReason by: ${message.author.tag} (${message.author.id})`
          : '')

      console.log(embed)

      m.edit({ embed })
        .then(() => message.channel.send('I have edited that reason.'))
        .catch(e =>
          message.channel.send(`I got an error while trying to edit:\n${e}`),
        )
    })
    .catch(e =>
      message.channel.send('Could not find that message in the log channel.'),
    )
}

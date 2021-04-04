module.exports.config = {
  name: 'names',
  invokers: ['names', 'n', 'namesStart', 'ns'],
  help: 'Counts users with a username/nickname',
  expandedHelp: 'names [word]\nnamesStart [word]',
  invisible: true,
}

const pendingEmote = '\u{1f504}'
const promiseTimeout = (time, result = null) =>
  new Promise(r => setTimeout(r, time, result))
const { escapeMarkdown } = require('discord.js').Util

module.exports.events = {}
module.exports.events.message = (bot, message) => {
  if (message.guild === null) return message.channel.send("You're in DMs")

  let [cmd, ...word] = bot.sleet.shlex(message.content)
  word = word.join(' ')

  message.react(pendingEmote)

  const nameCheck = Promise.race([promiseTimeout(10 * 1000), message.guild.members.fetch()])
    .then(members => {
      if (members === null)
        return message.channel.send(
          'I did not get the members in less than 10 seconds. Blame Discord and try again later.',
        )

      const starts = !['names', 'n'].includes(cmd)
      const term = word.toLowerCase()

      count = starts
        ? namesStart(term, members)
        : names(term, members)

      message.channel.send(`${count} member${count === 1 ? '' : 's'} have **"${escapeMarkdown(word)}"**${starts ? ' at the start of' : ' in'} their name!`)
    })
    .catch(e => message.channel.send(`I ran into an error: ${e}`))
}

function names(word, members) {
  return members.filter(m =>
    m.user.username.toLowerCase().includes(word) ||
    m.nickname?.toLowerCase().includes(word)
  ).size
}

function namesStart(word, members) {
  return members.filter(m =>
    m.user.username.toLowerCase().startsWith(word) ||
    m.nickname?.toLowerCase().startsWith(word)
  ).size
}

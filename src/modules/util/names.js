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

module.exports.events = {}
module.exports.events.message = (bot, message) => {
  if (message.guild === null) return message.channel.send("You're in DMs")
  //if (message.guild.id === '120330239996854274' && !message.member.roles.has('244328249801310219')) return message.channel.send('You all abused this command too much.')

  let [cmd, ...word] = bot.sleet.shlex(message.content)
  let count = 0

  word = word.join(' ')

  message.react(pendingEmote)

  Promise.race([promiseTimeout(10 * 1000), message.guild.members.fetch()])
    .then(members => {
      if (members === null)
        return message.channel.send(
          'I did not get the members in less than 10 seconds. Blame Discord and try again later.',
        )

      if (['names', 'n'].includes(cmd))
        count = names(word.toLowerCase(), message.guild.members)
      else count = namesStart(word.toLowerCase(), message.guild.members)

      message.channel.send(`${count} user${count === 1 ? '' : 's'}!`)
    })
    .catch(e => message.channel.send(`I ran into an error: ${e}`))
}

function names(word, members) {
  let count = 0

  members.array().forEach(m => {
    if (
      m.user.username.toLowerCase().includes(word) ||
      (m.nickname ? m.nickname.toLowerCase().includes(word) : false)
    )
      count++
  })

  return count
}

function namesStart(word, members) {
  let count = 0

  members.array().forEach(m => {
    if (
      m.user.username.toLowerCase().startsWith(word) ||
      (m.nickname ? m.nickname.toLowerCase().startsWith(word) : false)
    )
      count++
  })

  return count
}

module.exports.config = {
  name: 'untrend',
  invokers: ['untrend'],
  help: 'Resets nicks of users',
  expandedHelp:
    '`untrend [words]`\nResets the nicks of everyone with [words] in their nick.\nLocked to staff.',
  invisible: true,
}

const sleep = s => new Promise(a => setTimeout(a, s))
const duration = 30 * 1000 // 30s
const oldTrends = []

module.exports.events = {}
module.exports.events.message = async (bot, message) => {
  if (!message.guild) return
  if (
    message.author.id !== bot.sleet.config.owner.id &&
    !message.member.roles.has('244328249801310219')
  )
    return

  let [cmd, ...words] = bot.sleet.shlex(message)
  words = words.join(' ')

  const resets = []

  await message.guild.fetchMembers()

  message.guild.members.forEach(async m => {
    if (m.nickname && m.nickname.toLowerCase().includes(words)) {
      resets.push(`${m.user.tag}: \`${m.nickname}\``)
      m.setNickname(m.user.username)
      await sleep(1000)
    }
  })

  if (resets[0]) oldTrends.push({ words, message, time: Date.now() })

  message.channel.send('Reset:\n' + (resets.join(', ') || 'Nothing reset.'))
}

module.exports.events.guildMemberUpdate = async (bot, oldM, newM) => {
  if (oldM.nickname && oldM.nickname === newM.nickname) return

  oldTrends.forEach((v, i) => {
    if (v.time + duration > Date.now()) {
      oldTrends.splice(i, 1)
    } else if (newM.nickname && newM.nickname.toLowerCase().includes(v.words)) {
      v.message.channel.send(
        `${newM.user.tag} tried to change nick to recently untrended word: ${newM.nickname}`,
      )
      newM.setNickname(newM.user.username)
    }
  })
}

module.exports.config = {
  name: 'idof',
  invokers: ['idof', 'idoof', 'idof?'],
  help: 'Fetches the id of a mentionned user/by username/tag. Useful for mobile.',
  expanddedHelp:'`idof` will search for the *full* username, `idof? at` will also match `at` in `Atlas`\nAll searches are case insensitive.',
  usage: ['Get id', 'idof [@user/username/user#discrim]']
}

module.exports.events = {}
module.exports.events.message = async (bot, message) => {
  if (message.mentions.users.first()) return message.channel.send(message.mentions.users.first().id)
  if (!message.guild) return

  let [cmd, ...user] = bot.sleet.shlex(message),
      r = [],
      exactResults = []

  cmd = cmd.toLowerCase()
  user = user.join(' ').toLowerCase()

  message.guild.members.forEach(m => {
    if (m.user.username.toLowerCase().includes(user) || m.displayName.toLowerCase().includes(user))
      r.push([m.user.tag,  m.user.id, m.nickname])

   if (m.user.username.toLowerCase() === user || m.displayName.toLowerCase() === user)
      exactResults.push([m.user.tag, m.user.id, m.nickname])
  })

  if (r.length === 0) return message.channel.send('No users found.')
  if (exactResults.length === 1) return message.channel.send(exactResults[0][1])

  let prompt = `${r.length} results found, pick a user:`

  if (cmd !== 'idof?' && exactResults.length === 0) prompt = `No exact matches found, is one of these close?: `

  message.channel.send(prompt + '\n```py\n' + r.map((v,i) =>`[${i}] ${v[0]}: ${v[1]} ${v[2]?'-- AKA '+v[2]:''}`).join('\n').substring(0, 1900) + '```')
    .then(msg =>
      msg.channel.awaitMessages(m => m.author.id === message.author.id && !Number.isNaN(parseInt(m.content)), {max: 1, time: 30000, errors: ['time']})
        .then(col => {
          const n = parseInt(col.first().content)
          if (r[n] === undefined) return msg.edit(msg.content + '\nNot a valid number. Aborting.')
          msg.edit(r[n][1])
        }).catch(e => msg.edit(msg.content + '\nTimed out.'))
    )
}

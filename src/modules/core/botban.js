//Bans a user from using the bot

module.exports.config = {
  name: 'botban',
  invokers: ['botban', 'botbans', 'don\'t talk to me or my bot ever again', 'unbotban'],
  help: 'botbans people',
  expandedHelp: 'Botbans people. also why are you searching help for this only the owner can use this`',
  usage: ['Botban', 'botban [@mention|id] [reason]', 'Unbotban', 'unbotban [@mention|id]'],
  invisible: true
}

module.exports.events = {}
module.exports.events.message = (bot, message) => {
  const config = bot.sleet.config
  let [cmd, userToBotban, ...reason] = bot.sleet.shlex(message.content.replace('don\'t talk to me or my bot ever again', 'botban'))
  reason = reason.join(' ')

  if (message.author.id !== config.owner.id) return message.channel.send('no.')

  if (userToBotban === undefined) {
    message.react('📩')
    return message.author.send(config.botbans.map(b=>`**${b.name}**#${b.discriminator} (${b.id}): ${b.reason}`).join('\n')||'No botbans.')
  }

  let user = (message.mentions.users.first()) ? message.mentions.users.first().id : userToBotban

  if (user === config.owner.id) return message.channel.send(`That's a bad idea...`)
  if (user === bot.user.id) return message.channel.send(`What would that even accomplish`)

  if (config.botbans.some(b => b.id === user)) {
    if (cmd !== 'unbotban') {
      return message.channel.send('That user is already botbanned.')
    }
  } else {
    if (cmd === 'unbotban') {
      return message.channel.send('That user is not currently botbanned.')
    }
  }

  //unbotban id/name/discriminator thething

  bot.fetchUser(user).then(user => {
    let msg = ''
    if (cmd !== 'unbotban') {
      config.botbans.push({name: user.username, discriminator: user.discriminator, id: user.id, reason})
      msg = `Botbanned ${user.username}.`
    } else {
      config.botbans = config.botbans.filter(b => b.id !== user.id)
      msg = `Unbotbanned ${user.username}.`
    }

    bot.sleet.reloadConfig(config)
    bot.sleet.saveConfig()
      .then(message.channel.send(msg))
  }).catch(e => {
    bot.sleet.logger.log(e)
    message.channel.send('Something went wrong...')
  })
}

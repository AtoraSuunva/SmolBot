module.exports.config = {
  name: 'unedit',
  invokers: ['unedit'],
  help: 'Posts all the versions of a message',
  expandedHelp: 'Fetches all cached revisions of a message.\nLocked to staff.',
  usage: ['In current channel', 'unedit [message id]', 'In another channel', 'unedit [message id] [channel id]']
}

module.exports.events = {}
module.exports.events.message = async (bot, message) => {
  if (!message.guild) return
  if (message.author.id !== bot.sleet.config.owner.id && !message.member.roles.has('244328249801310219')) return

  let [cmd, msg, channel] = bot.sleet.shlex(message)
  channel = (channel) ? message.guild.channels.get(channel.replace(/[<>#]/g, '')) : message.channel

  if (!channel) return message.channel.send('Could not find that channel.')

  try {
    msg = await channel.fetchMessage(msg)
  } catch (e) {
    return message.channel.send('Failed to fetch that message.\nTry `b!unedit ' + msg + ' [#channel]`')
  }

  if (!msg) return message.channel.send('Could not find that message')

  message.channel.send('"' + msg.edits.reverse().map(m => m.content).join('",\n"') + '"', {code: 'js'})
}

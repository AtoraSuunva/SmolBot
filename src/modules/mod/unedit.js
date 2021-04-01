module.exports.config = {
  name: 'unedit',
  invokers: ['unedit'],
  help: 'Posts all the versions of a message',
  expandedHelp: 'Fetches all cached revisions of a message.\nLocked to staff.',
  usage: [
    'In current channel',
    'unedit [message id]',
    'In another channel',
    'unedit [message id] [channel id]',
  ],
}

const msgReg = /(.*?)https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/channels\/\d+\/(\d+)\/(\d+)(.*)/

module.exports.events = {}
module.exports.events.message = async (bot, message) => {
  if (!message.guild) return
  if (
    message.author.id !== bot.sleet.config.owner.id &&
    !message.member.hasPermission('MANAGE_MESSAGES')
  )
    return message.channel.send(
      'You need manage message perms to get the previous versions of a message.',
    )

  // match?: [msg, before, channel, message, after]
  const match = msgReg.exec(message.content)
  let [cmd, msg, channel] = match
    ? ['unedit', match[3], match[2]]
    : bot.sleet.shlex(message)
  channel = channel
    ? message.guild.channels.get(channel.replace(/[<>#]/g, ''))
    : message.channel

  if (!channel) return message.channel.send('Could not find that channel.')

  try {
    msg = await channel.fetchMessage(msg)
  } catch (e) {
    return message.channel.send(
      'Failed to fetch that message.\nYou need a message link or use `messageid #channel`',
    )
  }

  if (!msg) return message.channel.send('Could not find that message')

  message.channel.send(
    '"' +
      msg.edits
        .reverse()
        .map(m => m.content)
        .join('",\n"') +
      '"',
    { code: 'js' },
  )
}

const unsuppressEmoji = '\u{1f526}' // :flashlight:

module.exports.config = {
  name: 'unsuppress',
  invokers: ['unsuppress', 'unhide'],
  help: 'Unsuppresses messages',
  expandedHelp: `\`unsuppress <message link>\`\n\`unsuppress <channel id> <message id>\`\nReact to a message with ${unsuppressEmoji}`,
}

const Discord = require('discord.js')
const msgReg = /(.*)https:\/\/(?:canary\.)?discordapp\.com\/channels\/\d+\/(\d+)\/(\d+)(.*)/

module.exports.events = {}
module.exports.events.message = async (bot, message) => {
  if (!message.guild) {
    return
  }

  // No url -> null
  // w/ url -> ['msg', 'before url', 'channel', 'message', 'after url']
  const match = msgReg.exec(message.content)
  let [cmd, channelId, messageId] = bot.sleet.shlex(message)

  if (match) {
    channelId = match[2]
    messageId = match[3]
  }

  if (!channelId || !messageId) {
    return message.channel.send(
      `You need to provide a message link, channel id + message id, or react to a message with ${unsuppressEmoji}.`,
    )
  }

  const channel = bot.channels.get(channelId)

  if (!channel) {
    return message.channel.send(
      'I did not find the channel you wanted me to unsuppress in.',
    )
  }

  if (!channel.permissionsFor(message.author).has('MANAGE_MESSAGES')) {
    return message.channel.send(
      'You need to be able to manage messages to unsuppress.',
    )
  }

  try {
    const msg = await channel.messages.fetch(messageId)
    await msg.suppressEmbeds(false)
    message.channel.send('Unsuppressed that message.')
  } catch (e) {
    message.channel.send(`Failed to unsuppress the message.\n${e}`)
  }
}

module.exports.events.messageReactionAdd = async (bot, react, user) => {
  if (react.emoji.name !== unsuppressEmoji) {
    return
  }

  const guild = react.message.guild

  if (!guild) {
    return
  }

  if (!react.message.channel.permissionsFor(user).has('MANAGE_MESSAGES')) {
    return
  }

  react.message.suppressEmbeds(false)
}

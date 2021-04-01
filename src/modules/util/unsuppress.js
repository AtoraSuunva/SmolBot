const unsuppressEmoji = '\u{1f526}' // :flashlight:

module.exports.config = {
  name: 'unsuppress',
  invokers: ['unsuppress', 'unhide'],
  help: 'Unsuppresses messages',
  expandedHelp: `\`unsuppress <message link>\`\n\`unsuppress <channel id> <message id>\`\nReact to a message with ${unsuppressEmoji}`,
}

const Discord = require('discord.js')
const msgReg = /(.*)https:\/\/(?:canary\.)?discordapp\.com\/channels\/\d+\/(\d+)\/(\d+)(.*)/
const fetch = require('node-fetch')

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
    await suppressMessage(bot, channelId, messageId, false)
    message.channel.send('Unsuppressed that message.')
  } catch (e) {
    message.channel.send('Failed to unsuppress the message.')
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

  suppressMessage(bot, react.message.channel.id, react.message.id, false)
}

async function suppressMessage(client, channelId, messageId, suppress) {
  const endpoint = suppressEndpoint(client, channelId, messageId)
  // This endpoint doesn't actually return anything lol
  return await fetch(endpoint, {
    method: 'POST',
    body: JSON.stringify({ suppress }),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${client.token}`,
    },
  })
}

function suppressEndpoint(client, channelId, messageId) {
  return `${client.options.http.api}/api/v${client.options.http.version}/channels/${channelId}/messages/${messageId}/suppress-embeds`
}

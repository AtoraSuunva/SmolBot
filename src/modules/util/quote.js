module.exports.config = {
  name: 'quote',
  invokers: [],
  help: 'Quotes messages',
  expandedHelp: 'Creates a quote (automatically) by using message URLs',
  invisible: true
}

const Discord = require('discord.js')
const msgReg = /(.*?)(<?)https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/channels\/\d+\/(\d+)\/(\d+)(>?)(.*)/

module.exports.events = {}
module.exports.events.everyMessage = async (bot, message) => {
  if (message.author.bot)
    return

  if (message.edits.length > 1)
    return

  // No url -> null
  // w/ url -> ['msg', 'before url', '<', 'channel', 'message', '>', 'after url']
  const match = msgReg.exec(message.content)

  if (match === null)
    return

  // escaped
  if (match[2] === '<' && match[5] === '>')
    return

  if (!message.guild)
    return message.channel.send('I only send quotes in guilds.')

  // const channel = (message.author.id === bot.sleet.config.owner.id) ? bot.channels.get(match[2]) : message.guild.channels.get(match[2])
  const channel = bot.channels.get(match[3])

  if (!channel)
    return

  // if (!channel)
    // return message.channel.send('I only quote messages from the same guild.')

  if (!channel.permissionsFor(message.author).has('VIEW_CHANNEL'))
    return message.channel.send('I only quotes messages from channels you can see')

  let quoted

  try {
    quoted = await fetchMessage(bot, channel, match[4])
  } catch (e) {
    return
  }

  const embed = createEmbed(quoted, message)
  message.channel.send({embed})
}

async function fetchMessage(client, channel, messageId) {
  const data = await client.rest.methods.getChannelMessage(channel, messageId)

  if (data instanceof Discord.Message) {
    return data
  } else {
    return new Discord.Message(channel, data, client)
  }
}

function createEmbed(message, origMessage) {
  const embed = new Discord.RichEmbed()
    .setAuthor(`${message.client.sleet.formatUser(message.author, { id: false, plain: true })} - #${message.channel.name}`, message.author.displayAvatarURL, message.url)
    .setDescription(message.content)
    .setFooter(`Quoted by ${message.client.sleet.formatUser(origMessage.author, { id: false, plain: true })}`)
    .setTimestamp(message.createdAt)

  if (message.member)
    embed.setColor(message.member.displayColor)

  const imgEmbed = message.attachments.find(e => e.height && e.width) || message.embeds.find(e => e.type === 'image')

  if (imgEmbed)
    embed.setImage(imgEmbed.url)

  return embed
}

module.exports.createEmbed = createEmbed

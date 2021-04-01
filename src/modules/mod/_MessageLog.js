const Discord = require('discord.js')

module.exports = messages => {
  const message = messages.first()
  const users = new Set(messages.array().map(m => m.author))
  const channels = extractMentions(messages, 'channels')
  const roles = extractMentions(messages, 'roles')
  const userMentions = extractMentions(messages, 'users')

  let txt =
    `[${message.guild ? message.guild.name : 'DM'} (${
      message.guild ? message.guild.id : message.channel.id
    }); ` +
    (message.channel.name
      ? `#${message.channel.name} (${message.channel.id})`
      : `@{message.recipient.tag} (${message.recipient.id})`) +
    ']\n' +
    mentionArray(users, 'tag') +
    mentionArray(userMentions, 'tag') +
    mentionArray(channels, 'name') +
    mentionArray(roles, 'name') +
    '\n'

  for (let m of messages.array()) txt += messageToLog(m)

  return txt
}

function messageToLog(message) {
  const embed = message.embeds.find(e => e.type === 'rich')
  const richEmbed = !embed
    ? null
    : JSON.stringify(new Discord.RichEmbed(embed).toJSON())

  return (
    `[${curTime(message.createdAt)}] (${message.id}) ` +
    `${message.author.tag} : ${message.content}` +
    ' | Attach: ' +
    message.attachments
      .array()
      .map(a => a.url)
      .join(' ; ') +
    ' | RichEmbed: ' +
    richEmbed +
    '\n'
  )
}

function curTime(date) {
  date = date || new Date(0)
  return `${date.getUTCFullYear()}-${timePad(date.getUTCMonth() + 1)}-${timePad(
    date.getUTCDate(),
  )} ${timePad(date.getUTCHours())}:${timePad(date.getUTCMinutes())}:${timePad(
    date.getUTCSeconds(),
  )}`
}

function timePad(msg) {
  return padLeft(msg, 2, 0)
}

function padLeft(msg, pad, padChar = '0') {
  padChar = '' + padChar
  msg = '' + msg
  let padded = padChar.repeat(pad)
  return padded.substring(0, padded.length - msg.length) + msg
}

function extractMentions(messages, type) {
  const set = new Set()
  messages
    .array()
    .forEach(m => m.mentions[type].array().forEach(c => set.add(c)))
  return set
}

function mentionArray(set, name) {
  return `[${Array.from(set)
    .map(s => s[name] + ' (' + s.id + ')')
    .join('; ')}]\n`
}

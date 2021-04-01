module.exports.config = {
  name: 'archive',
  invokers: ['archive'],
  help: 'Archives stuff',
  expandedHelp:
    'Archives messages and then uploads as a gist.\nArchives 100 messages by default.',
  usage: [
    'Archive 100 messages',
    'archive',
    'Archive 50 messages',
    'archive 50',
  ],
  invisible: true,
}

const Discord = require('discord.js')
const messageLog = require('./_MessageLog.js')
const archiveViewer = 'https://giraffeduck.com/api/log/'

module.exports.events = {}
module.exports.events.message = async (bot, message) => {
  const [cmd, limit = 100] = bot.sleet.shlex(message)

  if (limit < 1)
    return message.channel.send('I cannot archive less than 1 message')

  if (Number.isNaN(+limit))
    return message.channel.send('`limit` should be a number')

  const messages = await getMessages(message.channel, limit)

  const txt = messageLog(messages)

  const filename = `${message.channel.name || message.author.tag}.dlog.txt`
  const gist = await bot.sleet.createGist(txt, { filename })

  message.channel.send(
    `Archived: **${messages.size}** messages\n${archiveViewer}${gist.body.id}`,
  )
}

async function getMessages(channel, limit) {
  let messages = new Discord.Collection()

  while (messages.size < limit) {
    const fetchLimit = limit - messages.size < 100 ? limit - messages.size : 100

    const newMessages = await channel.messages.fetch({
      limit: fetchLimit,
      before: messages.first() ? messages.first().id : undefined,
    })

    messages = messages
      .concat(newMessages)
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp)

    if (newMessages.size < 100) break

    await sleep(500) // Avoid spamming discord completely
  }

  return messages
}

function sleep(time) {
  return new Promise(r => setTimeout(r, time))
}

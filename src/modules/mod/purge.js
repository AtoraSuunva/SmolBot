module.exports.config = {
  name: 'purge',
  invokers: ['purge'],
  help: 'purges stuff',
  expandedHelp: 'Searches last 100 messages and purges as much as possible by default.\n`purge [num] [type] [extra...]`\n`num` is max number to purge (Optional, default 100)\n`type` is the type of purge to do (outlined below) (Optional, default \'All\')\n`Extra` are extra parameters to the purge type\nRequires you to have "Manage Messages"',
  usage: ['Purge up to 100 messages', 'purge', 'Purge 10 messages', 'purge 10', 'Purge messages with emojis/emotes', 'purge emoji', 'Purge embeds', 'purge 40 embeds', 'Purge bot messages', 'purge bots', 'Purge bot messages and messages with invokers', 'purge bots b! + =', 'Purge messages with content', 'purge with banana']
}

const Discord = require('discord.js')
const BIN = '\u{d83d}\u{ddd1}\u{fe0f}'

module.exports.events = {}
module.exports.events.message = async (bot, message) => {
  if (!message.guild || !message.channel.permissionsFor(message.member).has('MANAGE_MESSAGES')) return

  if (!message.channel.permissionsFor(message.guild.me).has('MANAGE_MESSAGES')) return message.channel.send("I can't manage messages.")

  let [cmd, limit, type, ...extra] = bot.sleet.shlex(message)
  let beforeId = decrementId(message.id)
  let totalDeleted = 0
  let purgedFirst = false

  if (isNaN(parseInt(limit))) {
    extra = [type]
    type = limit
    limit = 100
  }

  type = type || 'all'

  while (limit > 0) {
    let toPurge = await message.channel.fetchMessages({ limit: 100, before: beforeId })

    console.log('Purging', { limit, type, extra })

    toPurge = await filterMessages(bot, type, toPurge)
    toPurge = Array.from(toPurge.values())

    if (!purgedFirst) {
      toPurge.unshift(message)
      purgedFirst = true
    }

    toPurge = toPurge.slice(0, limit).slice(0, 100)

    if (toPurge.length === 0) {
      limit = 0
    } else if (toPurge.length === 1) {
      beforeId = decrementId(toPurge[0].id)
      toPurge[0].delete().catch(() => {})
      totalDeleted++
      limit--
    } else {
      beforeId = decrementId(toPurge.map(m => BigInt(m.id)).sort((a, b) => a > b)[0])
      try {
        await message.channel.bulkDelete(toPurge, true)
      } catch (e) {
        bot.sleet.logger.error('Failed to purge', { channel: message.channel.id, content: message.content }, e)
        return message.channel.send(`Failed to purge, this is likely a permissions issue:\n\`\`\`js\n${e}\n\`\`\``)
      }
      totalDeleted += toPurge.length
      limit -= toPurge.length
    }

    if (limit > 0) await sleep(500)
  }

  if (totalDeleted === 0) {
    return message.channel.send('I found no messages to delete.')
  }

  const purgeMessage = await message.channel.send(`${BIN} ${totalDeleted}`)
  await sleep(3000)
  purgeMessage.delete()
}

function decrementId(id) {
  return (BigInt(id) - 1n).toString()
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(() => resolve(), ms))
}

async function filterMessages(bot, type, messages) {
  // can't purge messages older than 2 weeks
  messages = messages.filter(m => Date.now() - m.createdAt < 1209600000)

  switch(type.toLowerCase()) {
    case 'all':
      return messages

    case 'emoji':
    case 'emojis':
    case 'emote':
    case 'emotes':
      return messages.filter(m => m.content.match(/<a?:\w+:\d+>/) || hasEmoji(m.content))

    case 'embed':
    case 'embeds':
      return messages.filter(m => m.embeds.length > 0 || m.attachments.size > 0)

    case 'bot':
    case 'bots':
      return messages.filter(m => m.author.bot || startsWithOneOf(m.content, extra))

    case 'with':
      const content = extra.join(' ').toLowerCase()
      return messages.filter(m => m.content.toLowerCase().includes(content))

    case 'from':
    case 'by':
      const members = await bot.sleet.extractMembers({ from: extra.join(' '), source: message }, { id: true })
      return messages.filter(m => members.includes(m.author.id))

    case 'regex':
      const reg = new RegExp(extra.join(' '))
      return messages.filter(m => reg.test(m.content))

    default:
      return false
  }
}

function hasEmoji(str) {
  return !!str.match(/(?:[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3|\u3299|\u3297|\u303d|\u3030|\u24c2|\ud83c[\udd70-\udd71]|\ud83c[\udd7e-\udd7f]|\ud83c\udd8e|\ud83c[\udd91-\udd9a]|\ud83c[\udde6-\uddff]|[\ud83c[\ude01\uddff]|\ud83c[\ude01-\ude02]|\ud83c\ude1a|\ud83c\ude2f|[\ud83c[\ude32\ude02]|\ud83c\ude1a|\ud83c\ude2f|\ud83c[\ude32-\ude3a]|[\ud83c[\ude50\ude3a]|\ud83c[\ude50-\ude51]|\u203c|\u2049|[\u25aa-\u25ab]|\u25b6|\u25c0|[\u25fb-\u25fe]|\u00a9|\u00ae|\u2122|\u2139|\ud83c\udc04|[\u2600-\u26FF]|\u2b05|\u2b06|\u2b07|\u2b1b|\u2b1c|\u2b50|\u2b55|\u231a|\u231b|\u2328|\u23cf|[\u23e9-\u23f3]|[\u23f8-\u23fa]|\ud83c\udccf|\u2934|\u2935|[\u2190-\u21ff])/)
}

function startsWithOneOf(str, arr) {
  for (let a of arr) {
    if (str.toLowerCase().startsWith((a + '').toLowerCase())) return true
  }
  return false
}


//Extracts stuff from a url
module.exports.config = {
  name: 'extract',
  invokers: ['extract'],
  help: 'Extracts stuff',
  expandedHelp: 'b!extract https:\/\/whoa.some/url.txt\nLocked to GMs'
}

const Discord = require('discord.js')
const Snekfetch = require('snekfetch')

module.exports.events = {}
module.exports.events.message = async (bot, message) => {
  let [cmd, url] = bot.sleet.shlex(message.content)

  if (!message.guild)
    return message.channel.send('Just read it yourself smh')

  if (!message.member.roles.has('363821920854081539') && message.author.id !== bot.sleet.config.owner.id)
    return message.channel.send('You are not a GM')

  // Fetch url arg, then message attachment, then last attachment in the last 100 messages
  url = await (url || (message.attachments.first() ? message.attachments.first().url : getLatestFile(message)))

  if (!url)
    return message.channel.send('I couldn\'t find anything to extract')

  if (!url.startsWith('https:\/\/') && !url.startsWith('http:\/\/'))
    return message.channel.send('That does not look like a url')

  Snekfetch.get(rawify(url))
    .then(r => {
      d = r.text
      if (typeof d !== 'string')
        return message.channel.send('That does not look like text...')

      if (d.length > 6000)
        return message.channel.send(`I am not dumping more than 6k characters (${d.length} chars)`)

      let stuff = d.replace(/<@(\d+)>/g,
          (m, p1) => {
            let mem = message.guild.members.get(p1)
            if (mem) return mem.user.tag
            return p1
        }).replace(/<@&(\d+)>/g,
          (m, p1) => {
            let r = message.guild.roles.get(p1)
            if (r) return r.name
            return p1
        })

      splitSend(message, stuff, {code: true})

    }).catch(e => {bot.logger.error(e); message.channel.send('Something went wrong, maybe your url isn\'t valid/it wasn\'t text?')})
}


//ahn
function rawify(url) {
  if (/https?:\/\/gist\.github\.com\/.+\/.+/.test(url) && (url).split('/').filter(a => !!a).pop() !== 'raw')
    return (url.endsWith('/')) ? url + 'raw' : url + '/raw'

  if (/https?:\/\/pastebin.com\/(?!raw)/.test(url))
    return 'https:\/\/pastebin.com/raw/' + url.split('/').filter(a => !!a).pop()

  if (/https?:\/\/hastebin.com\/(?!raw)/.test(url))
      return 'https:\/\/hastebin.com/raw/' + url.split('/').filter(a => !!a).pop()

  return url
}

function splitSend(message, content, {code = false} = {}) {
  let splits = []

  content.match(/[\S\s]{1,1800}\S{0,50}/g).forEach(v => splits.push(v))

  if (splits[0] === undefined) message.channel.send('`[Empty Message]`')

  for (let split of splits) {

    if (code)
      message.channel.send(Discord.Util.escapeMarkdown(split, true), {code})
    else
      message.channel.send(split)
  }
}

function getLatestFile(message) {
  return new Promise(resolve => {
    message.channel.fetchMessages({limit: 100})
     .then(msgs => {
       const sMsgs = msgs.array().sort((a,b) => b.createdAt - a.createdAt)
        for (let m of sMsgs) {
          if (m.attachments.first()) resolve(m.attachments.first().url)
        }
        resolve(null)
     })
  })
}

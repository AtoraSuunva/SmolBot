module.exports.config = {
  name: 'autoreply',
  help: 'replies to stuff',
  expandedHelp: 'i dunno atlas should know',
  invisible: true
}

const whitelist = ['199017685445640193']

//.set(trigger, {type: <String>, reply: <String>})
//trigger => The thing that triggers a reply
//type    => the way it should activate [is, starts, ends, regex]
//chance  => num between 0-1 (0 is never, 1 is always. Nothing is treated as "always")

const affirmative = ['Yes', 'Yeah', 'Yep', 'no', 'Yup', 'Sure', 'Mhm', 'Ye', 'Yeah whatever', 'Sadly, yes', 'Piss off', 'What do you think?', '.']

const pick = arr => arr[Math.floor(Math.random() * arr.length)]

const responses = new Map()
  .set('aaa',     {type: 'is'   , reply: () => 'a'.repeat(Math.floor(Math.random() * 20) + 1)})
  .set(/^gla+$/,  {type: 'regex', reply: 'ceon', chance: 0.25})
  .set('nya~',    {type: 'is'   , reply: 'nya~', chance: 0.5})
  .set('fuck me', {type: 'is'   , reply: 'When and where?', chance: 0.25})
  .set('haha yes',{type: 'is'   , reply: 'haha yes'})
  .set("y'all alive", {type: 'is', reply: () => pick(affirmative)})

const thanksReg = /thanks?\s*(u|you)?\s*(,\s*)?smol(bot)?/i

module.exports.events = {}
module.exports.events.everyMessage = (bot, message) => {

  if (thanksReg.test(message.content)) {
    return message.channel.send('np')
  }

  if (['146545496192843776','74768773940256768'].includes(message.author.id)) {
    let m
    if ( (m = /^(`?)gla(-|~)`?$/i.exec(message.content)) )
      return message.channel.send(`${m[1] + m[2]}ahn~!${m[1]}`)
  }

  if (['199017685445640193','74768773940256768'].includes(message.author.id)) {
    let m
    if ( (m = /^(`?)xzap(-|~)`?$/i.exec(message.content)) )
      return message.channel.send(`${m[1] + m[2]}ahn~!${m[1]}`)
  }

  if (message.author.id !== bot.sleet.config.owner.id && !whitelist.includes(message.author.id)) return

  for (const [key, val] of responses) {
    switch(val.type) {
      case 'is':
         if (message.content === key)
           return sendReply(val, message)
      break

      case 'starts':
         if (message.content.startsWith(key))
           return sendReply(val, message)
      break

      case 'ends':
         if (message.content.endsWith(key))
            return sendReply(val, message)
      break

      case 'regex':
         if (key.test(message.content))
            return sendReply(val, message)
      break

      default:
    }
  }
}

function sendReply(val, message) {
  if (val.chance && Math.random() > val.chance) return

  return message.channel.send((typeof val.reply === 'function') ? val.reply(message) : val.reply)
}


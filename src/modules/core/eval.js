//Core module, used to eval stuff for testing

module.exports.config = {
  name: 'eval',
  invokers: ['eval', 'eval!', 'eval?'],
  help: 'Evals stuff',
  expandedHelp: 'Evals stuff for testing reasons.\nIf you try to use my eval I\'ll kinkshame you.',
  invisible: true
}

const tokenReg = /(?:bot|client)\.token/gi
const v = {}

module.exports.events = {}
module.exports.events.message = async (bot, message) => {
  const config = bot.sleet.config

  if (message.author.id !== config.owner.id) return

  const shlex = bot.sleet.shlex
  const sleet = bot.sleet
  const Discord = require('discord.js')
  const fetch = require('snekfetch')

  let args = shlex(message.content)
  let evalMsg = message.content.substring(message.content.indexOf(args[0]) + args[0].length)
  let output = 'aaa'
  let msg

  console.log(message.content)
  console.log(args)

  bot.sleet.logger.log(evalMsg)

  try {
    evalMsg = evalMsg.replace(tokenReg, '"[ https://suplex.me/PoorUnimportantReuniclus ]"')

    output = eval(evalMsg)

    if (output instanceof Promise) {
      msg = await message.channel.send('Waiting for Promise...')
      output = await output
    }

    if (args[0] === 'eval?') bot.sleet.logger.dir(output, { depth: 5 })
    let inspect = require('util').inspect(output, { depth: 2 })

    if (inspect.length > 2000 && args[0] !== 'eval!' && args[0] !== 'eval...')
      return condEdit(message, msg, `Message is ${inspect.length} chars long, use \`eval!\` to dump anyways.`)
    else
      output = '```js\n' + inspect.replace(new RegExp(bot.token, 'gi'), '[ https://suplex.me/PoorUnimportantReuniclus ]') + '\n```'

    if (args[0] !== 'eval...')
      condEdit(message, msg, output)

  } catch (e) {
    bot.sleet.logger.warn(e)
    e.message = e.message.replace(new RegExp(bot.token, 'gi'), '[no token for you]')

    let length = e.message.length
    if (length > 2000 && args[0] !== 'eval!')
      return condEdit(message, msg, `Error over 2k characters (congrats on ${length} chars), use \`eval!\` to dump everything.`)
    else
      output = '```js\n' + e + '\n```'

    condEdit(message, msg, output)
  }
}

function condEdit(message, msg, content) {
  if (msg)
    msg.edit(content)
  else
    return message.channel.send(content, {split: {prepend: '```', append: '```'}})
}

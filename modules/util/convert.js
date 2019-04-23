module.exports.config = {
  name: 'convert',
  invokers: ['convert', 'conv'],
  help: 'Converts stuff to other stuff',
  expandedHelp: 'conv <num><unit> [to] <unit> #Convert from one unit to another\nconv <num><unit> #Convert from one unit to best\nconv <unit> #What you can convert to',
  usage: ['Convert F to C', 'convert 4f to c', 'Convert, but less verbose', 'conv 4f c', 'Alternatively', 'conv 3 ml oz', 'Check valid units', 'conv ft']
}

const Discord  = require('discord.js')
const convert = require('convert-units')


const sub = [
    ['years', 'year'], ['months', 'month'], ['weeks', 'week'], ['days?', 'd'], ['mins', 'min'],
    ['c', 'C'], ['f', 'F'], ['k', 'K'], ['freedom units?', 'F']
  ]

const rep = new Map(sub.map(v => [new RegExp(`^${v[0]}$`), v[1]] ))

module.exports.events = {}
module.exports.events.message = (bot, message) => new Promise(send => {
	let args = bot.sleet.shlex(message).slice(1)

	/*
	> 20f to c
	['20f', 'to', 'c']

	> 20f c
	['20f', 'c']
	*/

  if (args[0] === undefined)
    return message.channel.send('Format: `conv [value] [from] [to]`\n`conv 4 f c`\nUse `help convert` for more info.')

	let val = parseFloat(args[0])
	let ini = args[0].replace(/\d|\.|-/g, '') || args[1]
	let end = (args[1] === 'to' || args[2] === 'to' || ini === args[1]) ? ((args[2] === 'to') ? args[3] : args[2]) : args[1]

  ini = ini ? ini.toLowerCase() : ''
  end = end ? end.toLowerCase() : ''

  for (let [key, val] of rep) {
    ini = ini.replace(key, val)
    end = end.replace(key, val)
  }

  ini = ini.trim()
  end = end.trim()

  if (ini === '')
    return message.channel.send('There\'s no initial unit to convert from.')

  let msg = ''

	try {
		if (Number.isNaN(val) && ini !== undefined) {
			msg = `**${ini}** can be converted to:\n`
			    + convert().from(ini).possibilities().join(', ')
		} else if (end === '') {
			const conv = convert(val).from(ini).toBest()
			msg = `└> \`${conv.val} ${conv.unit}\` (Best guess)`
		} else {
			msg = '└> `' + convert(val).from(ini).to(end) + ((['f', 'c'].includes(end.toLowerCase())) ? '°' : '') + end + '`'
		}
	} catch(e) {
    message.channel.send(e.name)
		return message.channel.send(`Something went wrong while converting, check your units?:\n ${e}`)
	}

	message.channel.send(msg || 'Something went wrong!')
})

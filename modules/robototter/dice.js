// rolls dice
module.exports.config = {
  name: 'dice',
  invokers: ['dice', 'roll'],
  help: 'Rolls some dice',
  expandedHelp: 'Uses the `AdX` notation! (A = dice, X = sides)\nSupports modifers (`AdX+C` or `-C`/`*C`/`/C`)\nSupports dropping lowest/highest result (2d4-L)',
  usage: ['Roll 2 6-sided dice', 'roll 2d6', 'Roll a 3-sided die', 'roll d3', 'Roll with modifier', 'roll 2d6+5', 'Drop lowest roll', 'roll 2d6-L']
}

const diceReg = /(\d+)?d(\d+)([-+*\/])?(\d+|L|H)?d?(\d+)?/
const maxDice  = 50
const maxSides = 200
const maxMod = 1000

module.exports.events = {}
module.exports.events.message = (bot, message) => {
  const [cmd, die] = bot.sleet.shlex(message)

  const parse = diceReg.exec(die)

  if (parse === null)
    return message.channel.send('Something seems wrong with your formatting')

  let [match, dice, sides, op, mod, mod2] = parse

  if (!sides)
    return message.channel.send('Try learning dice notation first')

  dice = dice !== undefined ? parseInt(dice) : 1
  sides = parseInt(sides)
  op = op || '+'
  mod = (mod !== undefined && !['H', 'L'].includes(mod)) ? parseInt(mod) : mod
  mod2 = (mod2 !== undefined) ? parseInt(mod2) : mod2

  //yay arg checking
  if (Number.isNaN(dice) || Number.isNaN(sides))
    return message.channel.send(`I need numbers to work with`)
  if ((mod !== undefined && Number.isNaN(mod)) || (mod2 !== undefined && Number.isNaN(mod2)))
    return message.channel.send(`Your modifiers aren't numbers`)

  if (dice === 0)
    return message.channel.send(`I've already rolled your 0 dice for you.\nThe result is nothing.`)
  if (dice < 0)
    return message.channel.send(`Sure, let me just pull out my negative dice`)

  if (sides === 0)
    return message.channel.send(`I'd roll the dice if they existed`)
  if (sides < 0)
    return message.channel.send(`Now you're just being silly`)

  if (dice > maxDice)
    return message.channel.send(`I've only got ${maxDice} dice`)
  if (sides > maxSides || mod2 > maxSides)
    return message.channel.send(`You're asking me to roll spheres now, try ${maxSides} sides`)

  if (op === '/' && (mod === 0 || mod === undefined))
    return message.channel.send('Nice try to divide by zero')
  if (mod > maxMod)
    return message.channel.send('Calm down with your modifier')

  if (['L', 'H'].includes(mod) && op !== '-')
      return message.channel.send('You can only remove the lowest/highest (use `-`)')
  if (['L', 'H'].includes(mod) && dice === 1)
      return message.channel.send(`You'll get no results left then`)

  const modifier = new Array(dice).fill(0).map(v => {
    if (mod === undefined) return 0
    if (['L', 'H'].includes(mod)) return 0
    if (mod2 === undefined) return mod
    return rollDice(mod, mod2).reduce(sum)
  })

  const rolls = rollDice(dice, sides).map((v, i) => safeMath(v, op, modifier[i]))
  let finalRolls = rolls, dropped

  if (['L', 'H'].includes(mod))
    [finalRolls, dropped] = (mod === 'L') ? removeSmallest(rolls) : removeLargest(rolls)

  const total = finalRolls.reduce(sum)
  const occurences = JSON.stringify(countOccurences(finalRolls)).replace(/"/g, '').replace(/([:,])/g, '$1 ')

  const msg = finalRolls.join(', ') +
              `\nFor a total of: ${total}\nAnd here's the count: ${occurences}` +
              (dropped ? `\nAnd dropped: ${dropped}` : '')

  if (msg.length < 2000)
    message.channel.send(msg)
  else
    message.channel.send('The result was too long for me to send')
}

function sum(a, b) {
  return a + b
}

function rollDice(dice, sides) {
  return new Array(dice).fill(0).map(v => randInt(1, sides))
}

//thanks mdn
function randInt(min, max) {
  min = Math.ceil(min)
  max = Math.floor(max)
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function safeMath(num1, op, num2) {
  switch(op) {
    case '+': return num1 + num2
    break
    case '-': return num1 - num2
    break
    case '*': return num1 * num2
    break
    case '/': return num1 / num2
    break
    default: return num1 + num2
  }
}

function countOccurences(arr) {
  const o = {}
  for (let i of arr)
    o[i] = o[i] ? o[i] + 1 : 1
  return o
}

function removeSmallest(arr) {
  const min = Math.min(...arr)
  const dropped = arr.splice(arr.indexOf(min), 1)
  return [arr, dropped[0]]
}

function removeLargest(arr) {
  const max = Math.max(...arr)
  const dropped = arr.splice(arr.indexOf(max), 1)
  return [arr, dropped[0]]
}

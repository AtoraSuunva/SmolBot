// rolls dice
module.exports.config = {
  name: 'dice',
  invokers: ['dice', 'roll'],
  help: 'Rolls some dice',
  expandedHelp:
    'Uses the `AdX` notation! (A = dice, X = sides)\nSupports modifers (`AdX+C` or `-C`/`*C`/`/C`)\nSupports dropping lowest/highest result (2d4-L)\nYou can roll multiple dice in 1 command.',
  usage: [
    'Roll 2 6-sided dice',
    'roll 2d6',
    'Roll a 3-sided die',
    'roll d3',
    'Roll with modifier',
    'roll 2d6+5',
    'Drop lowest roll',
    'roll 2d6-L',
    'Roll multiple dice',
    'roll 1d6+1 1d7+2 1d8-L 1d9',
  ],
}

const diceReg = /(\d+)?d(\d+)([-+*\/])?(\d+|L|H)?d?(\d+)?/
const maxDice = 50
const maxSides = 10000
const maxMod = 10000

module.exports.events = {}
module.exports.events.message = (bot, message) => {
  const [cmd, ...diceRolls] = bot.sleet.shlex(message)
  const results =
    diceRolls.length > 1
      ? diceRolls.map(d => `${d}: ${getDieResult(d)}`).join('\n')
      : getDieResult(diceRolls[0])
  return message.channel.send(results)
}

function getDieResult(die) {
  const parse = diceReg.exec(die)

  if (parse === null)
    return 'Something seems wrong with your formatting: `AdX` -> A = # of dice, X = # of sides'

  let [match, dice, sides, op, mod, mod2] = parse

  if (!sides)
    return 'Try learning dice notation first: `AdX` -> A = # of dice, X = # of sides.'

  dice = dice !== undefined ? parseInt(dice) : 1
  sides = parseInt(sides)
  op = op || '+'
  mod = mod !== undefined && !['H', 'L'].includes(mod) ? parseInt(mod) : mod
  mod2 = mod2 !== undefined ? parseInt(mod2) : mod2

  //yay arg checking
  if (Number.isNaN(dice) || Number.isNaN(sides))
    return `I need numbers to work with.`
  if (
    (mod !== undefined && Number.isNaN(mod)) ||
    (mod2 !== undefined && Number.isNaN(mod2))
  )
    return `Your modifiers aren't numbers.`

  if (dice === 0)
    return `I've already rolled your 0 dice for you.\nThe result is nothing.`
  if (dice < 0) return 'Sure, let me just pull out my negative dice.'

  if (sides === 0) return `I'd roll the dice if they existed.`
  if (sides < 0) return `Now you're just being silly.`

  if (dice > maxDice) return `I've only got ${maxDice} dice.`
  if (sides > maxSides || mod2 > maxSides)
    return `You're asking me to roll spheres now, try ${maxSides} sides.`

  if (op === '/' && (mod === 0 || mod === undefined))
    return 'Nice try to divide by zero'
  if (mod > maxMod) return `Try a modifier lower than ${maxMod}.`

  if (['L', 'H'].includes(mod) && op !== '-')
    return 'You can only remove the lowest/highest (use `-`)'
  if (['L', 'H'].includes(mod) && dice === 1)
    return 'You will get no results left in this case.'

  const modifier = new Array(dice).fill(0).map(v => {
    if (mod === undefined) return 0
    if (['L', 'H'].includes(mod)) return 0
    if (mod2 === undefined) return mod
    return rollDice(mod, mod2).reduce(sum)
  })

  const rolls = rollDice(dice, sides).map((v, i) =>
    safeMath(v, op, modifier[i]),
  )
  let finalRolls = rolls,
    dropped

  if (['L', 'H'].includes(mod))
    [finalRolls, dropped] =
      mod === 'L' ? removeSmallest(rolls) : removeLargest(rolls)

  const total = finalRolls.reduce(sum)

  const msg =
    '`' +
    finalRolls.join('` + `') +
    '`' +
    (dice !== 1 ? ` = \`${total}\`` : '') +
    (dropped ? ` (dropped \`${dropped}\`)` : '')

  return msg.length < 500 ? msg : 'The result was too long, try less dice.'
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
  switch (op) {
    case '+':
      return num1 + num2
    case '-':
      return num1 - num2
    case '*':
      return num1 * num2
    case '/':
      return num1 / num2
    default:
      return num1 + num2
  }
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

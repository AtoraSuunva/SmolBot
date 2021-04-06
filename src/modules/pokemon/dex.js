// I need better things to do
module.exports.config = {
  name: 'pokedex',
  invokers: ['pokedex', 'dex', 'pokemon'],
  help: 'Searches up pokemon',
  expandedHelp:
    'Ever wanted to know the height of a diglet? Now you can!\nPulls information from both pokeapi and bulbapedia.',
  usage: [
    'Get a pokemon by name',
    'pokedex glaceon',
    'Get a pokemon by (National) dex #',
    'pokedex 471',
  ],
}

const Discord = require('discord.js')
const pgp = require('pg-promise')()
const db = pgp({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_POKEMON_DATABASE,
  user: process.env.DB_POKEMON_USER,
  password: process.env.DB_POKEMON_PASSWORD,
})

const fetchPokemon = require('./_fetchPokemon.js')

function capitalize(str) {
  if (!str) return ''
  return str[0].toUpperCase() + str.substring(1).toLowerCase()
}

function type(bot, type) {
  if (type === null || type === undefined || typeof type !== 'string') return ''

  if (type === '???') type = 'unknown'

  type = type.toLowerCase().replace('-', '')

  return (
    ' ' +
    (bot.emojis.cache.find(e => e.name === `type_${type}`) || `[${capitalize(type)}]`).toString()
  )
}

function shape(bot, shape) {
  if (shape === null || shape === undefined || typeof shape !== 'string')
    return ''

  shape = shape.toLowerCase().replace('-', '')

  return (
    ' ' +
    (bot.emojis.cache.find(e => e.name === `shape_${shape}`) ||
      `(${capitalize(shape)})`).toString()
  )
}

const colors = {
  red: '#ec8484',
  blue: '#94dbee',
  yellow: '#ffff99',
  green: '#64d364',
  black: '#bbbbbb',
  brown: '#cc9966',
  purple: '#c183c1',
  gray: '#d1d1e0',
  grey: '#d1d1e0',
  white: '#ffffff',
  pink: '#f4bdc9',
}
function color(color) {
  return colors[color] || '#000000'
}

function evolvesFrom(ev) {
  return ev
    ? `\n**Evolves from:** [${capitalize(ev)}](${fetchPokemon.api.bulba}${ev})`
    : ''
}

function gender(rate) {
  if (rate === -1) {
    return 'Genderless'
  }

  const female = (rate / 8) * 100
  const male = 100 - female

  const str = `${male}% Male, ${female}% Female`

  const ratio = Math.floor(str.length * (male / 100))

  return '__' + str.substring(0, ratio) + '__' + str.substring(ratio)
}

module.exports.events = {}
module.exports.events.message = async (bot, message) => {
  const [cmd, pokemon, field] = bot.sleet.shlex(message)

  if (!pokemon) {
    return message.channel.send('So which pokemon do you want?')
  }

  if (pokemon.startsWith('?')) {
    return message.channel.send('Search for a pokemon by ID or name!')
  }

  let data

  try {
    data = await fetchPokemon(db, pokemon)
  } catch (e) {
    return message.channel.send(e.message)
  }

  if (fields[field]) {
    return message.channel.send(fields[field](data))
  }

  const embed = new Discord.MessageEmbed()

  embed
    .setTitle(
      capitalize(data.name) +
        ' #' +
        data.id +
        ' -' +
        type(bot, data.type) +
        type(bot, data.type_alt) +
        ' ' +
        shape(bot, data.shape),
    )
    .setDescription(
      data.description.split('\n\n')[0].trim() +
        `\n[Read more](${fetchPokemon.api.bulba}${data.name})`,
    )
    .setColor(color(data.color))
    .setThumbnail(data.sprite_front)
    .setAuthor(data.genus)
    .setFooter('Info: pokeapi.co & Bulbapedia')
    .addField(
      'Info',
      '**Capture Rate:** ' + data.capture_rate + evolvesFrom(data.evolves_from),
      true,
    )
    .addField(
      '\u200b',
      gender(data.gender_rate) +
        '\n:straight_ruler: ' +
        data.height / 10 +
        'm - :scales: ' +
        data.weight / 10 +
        'kg',
      true,
    )
    .addField(
      `Dex (${capitalize(data.dex[0].version)})`,
      data.dex[0].text.replace(/\n/g, ' '),
    )
    .addField(
      'Stats',
      '```asciidoc\nHP  :: ' +
        data.stats.hp +
        '\nAtk :: ' +
        data.stats.attack +
        '\nDef :: ' +
        data.stats.defense +
        '\n```',
      true,
    )
    .addField(
      '\u200b',
      '```asciidoc\nSpeed  :: ' +
        data.stats.speed +
        '\nSp.Atk :: ' +
        data.stats['special-attack'] +
        '\nSp.Def :: ' +
        data.stats['special-defense'] +
        '\n```',
      true,
    )

  message.channel
    .send({ embed })
    .then(m => (data.id === 149 ? m.react('\u{1f499}') : ''))
}

const fields = {
  name: d => capitalize(d.name),
  id: d => d.id,
  type: d =>
    capitalize(d.type) + (d.type_alt ? ` - ${capitalize(d.type_alt)}` : ''),
  shape: d => capitalize(d.shape),
  color: d => capitalize(d.color),
  sprite: d => d.sprite_front,
  genus: d => capitalize(d.genus),
  capture: d => d.capture_rate,
  evolves: d =>
    capitalize(d.evolves_from) ||
    `${capitalize(d.name)} does not evolve from any pokemon.`,
  gender: d => gender(d.gender_rate),
  height: d => `${d.height / 10}m`,
  weight: d => `${d.weight / 10}kg`,
  dex: d =>
    `From ${capitalize(d.dex[0].version)}:\n>>> ${d.dex[0].text.replace(
      /\n/g,
      ' ',
    )}`,
  stats: d =>
    '```asciidoc\nHP  :: ' +
    d.stats.hp +
    '\nAtk :: ' +
    d.stats.attack +
    '\nDef :: ' +
    d.stats.defense +
    '\nSpeed  :: ' +
    d.stats.speed +
    '\nSp.Atk :: ' +
    d.stats['special-attack'] +
    '\nSp.Def :: ' +
    d.stats['special-defense'] +
    '\n```',
}

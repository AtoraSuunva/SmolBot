const cheerio = require('cheerio')
const fetch = require('node-fetch')
const api = {
  bulba: 'https://bulbapedia.bulbagarden.net/wiki/', // """api"""
  pokemon: 'https://pokeapi.co/api/v2/pokemon/',
  species: 'https://pokeapi.co/api/v2/pokemon-species/'
}

const bulbaMap = {
  'nidoran-f': 'Nidoran%E2%99%80_(Pok%C3%A9mon)',
  'nidoran-m': 'Nidoran%E2%99%82_(Pok%C3%A9mon)',
  'mr-mime': 'Mr._Mime',
  'mime-jr': 'Mime_jr.',
  'type-null': 'Type:_Null',
  'jangmo-o': 'jangmo-o',
  'hakamo-o': 'hakamo-o',
  'kommo-o': 'kommo-o',

  'tapu-koko': 'tapu_Koko',
  'tapu-lele': 'tapu_Lele',
  'tapu-bulu': 'tapu_Bulu',
  'tapu-fini': 'tapu_Fini',
}

async function getBio(poke) {
  try {
    // ech
    poke = bulbaMap[poke] || poke.split('-')[0]

    const res = await fetch(api.bulba + poke).then(r => r.text())
    const bio = cheerio.load(res)('#Biology').parent().nextUntil('h2').not('.thumb').text().trim().replace(/\n/g, '\n\n')

    if (bio === '') {
      throw new Error('Not a pokemon')
    }

    return bio
  } catch (e) {
    if (e.status === 404) {
      throw new Error('No page found')
    } else {
      throw e
    }
  }
}

const getType = (types, i) => types.find(e => e.slot === i) || {type: {name: (i === 1 ? '???' : null)}}

async function getPoke(poke) {
  try {
    const [info, species, bio] = await Promise.all([
        fetch(api.pokemon + poke).then(r => r.json()),
        fetch(api.species + poke).then(r => r.json()),
        getBio(info.name)
      ])

    const stats = {}
    info.stats.forEach(e => stats[e.stat.name] = e.base_stat)

    const dex = []
    species.flavor_text_entries
      .filter(e => e.language.name === 'en')
      .forEach(e => dex.push({version: e.version.name, text: e.flavor_text}))

    return {
      id: info.id,
      name: info.name,
      type: getType(info.types, 1).type.name,
      type_alt: getType(info.types, 2).type.name,
      shape: species.shape.name,
      color: species.color.name,
      gender_rate: species.gender_rate,
      capture_rate: species.capture_rate,
      genus: species.genera.find(e => e.language.name === 'en').genus,
      evolves_from: species.evolves_from_species ? species.evolves_from_species.name : null,
      stats: stats,
      height: info.height,
      weight: info.weight,
      sprite_front: info.sprites.front_default,
      description: bio,
      dex: dex
    }

  } catch (e) {
    if (e.status === 404) {
      throw new Error('Pokemon not found')
    } else {
      throw e
    }
  }
}

async function fetchPokemon(db, poke) {
  const params = [+poke || 0, (poke + '').toLowerCase()]
  const query = await db.oneOrNone('SELECT * FROM pokemon WHERE id = $1 OR name = $2', params)


  if (query === null) {
    const data = await getPoke(poke)

    await db.none(
      'INSERT INTO pokemon' +
      ' (id, name, type, type_alt, shape, color, gender_rate, capture_rate, genus, evolves_from, stats, height, weight, sprite_front, description, dex)' +
      ' VALUES (${id}, ${name}, ${type}, ${type_alt}, ${shape}, ${color}, ${gender_rate}, ${capture_rate}, ${genus}, ${evolves_from}, ${stats}, ${height}, ${weight}, ${sprite_front}, ${description}, ${dex}::json[])',
      data
    )

    return data
  } else {
    return query
  }
}
module.exports = fetchPokemon
module.exports.api = api

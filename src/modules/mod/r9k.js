module.exports.config = {
  name: 'r9k',
  invokers: ['r9k'],
  help: 'XKCD r9k',
  expandedHelp: 'Deletes duplicate messages, text and files included',
  invisible: true,
}

module.exports.events = {}
module.exports.events.message = async (bot, message) => {
  const [, url] = bot.sleet.shlex(message)

  if (!url) {
    return message.channel.send('I need a url')
  }

  try {
    const hash = await hashFileFromURL(url)
    bot.sleet.logger.info(hash)
    return message.channel.send(`Result hash: ${hash}`)
  } catch (e) {
    bot.sleet.logger.error(e)
    return `Failed to hash that: ${e}`
  }
}

const crypto = require('crypto')
const fs = require('fs')
const fetch = require('node-fetch')

function hashText(text, { algorithm = 'md5' } = {}) {
  return new Promise(resolve => {
    const hash = crypto.createHash(algorithm)
    hash.update(text)
    resolve(hash.digest('hex'))
  })
}

function hashFile(file, { algorithm = 'md5' } = {}) {
  return new Promise(resolve => {
    const hash = crypto.createHash(algorithm)
    fs.createReadStream(file)
      .on('data', data => hash.update(data))
      .on('end', () => resolve(hash.digest('hex')))
  })
}

function hashFileFromURL(url, { algorithm = 'md5' } = {}) {
  return new Promise(resolve => {
    const hash = crypto.createHash(algorithm)
    fetch(url).then(res =>
      res.body
        .on('data', data => hash.update(data))
        .on('end', () => resolve(hash.digest('hex'))),
    )
  })
}

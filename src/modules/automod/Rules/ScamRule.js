const Rule = require('./Rule')

const URL_REGEX = /https?:\/\/(?<host>[^\s]+\.[^\s]+?)(?:\/|\b)/gi

const INVALID_CHARS_REGEX = /[\u200b-\u200f\x00]/g

/**
 * Get all hosts from some string, without repetition
 * @example
 * https://example.com/hello/world.html
 *         ^^^^^^^^^^^
 *            Host
 */
function getHostsFrom(text) {
  const matches = [...text.matchAll(URL_REGEX)].map(m =>
    m.groups.host.toLowerCase(),
  )
  // Don't have the same host twice
  return [...new Set(matches)]
}

/**
 * Removes invalid/"blank" non-space characters sometimes used to bypass filters
 */
function cleanText(text) {
  return text.replaceAll(INVALID_CHARS_REGEX, '')
}

/**
 * Checks a database to know if a host is a known scam or not
 * @returns {bool|null} True if a scam domain, False if not, null if unknown
 */
async function checkDBForScam(db, host) {
  const result = await db.oneOrNone(
    'SELECT host, is_scam FROM domains WHERE host = $1 AND is_scam = true',
    [host],
  )

  if (result === null) {
    return null
  }

  return { host: result.host, is_scam: result.is_scam }
}

/**
 * Adds a host to the database, noting if it's a scam or not
 */
function addHostToDB(db, host, { isScam }) {
  return db.none('INSERT INTO domains (host, is_scam) VALUES ($1, $2)', [
    host,
    isScam,
  ])
}

/**
 * Increases the count of times a domain has been seen
 */
function addHitToDB(db, host) {
  return db.none(
    'UPDATE domains SET times_seen = times_seen + 1 WHERE host = $1',
    [host],
  )
}

/**
 * Checks for scam domains ("free discord nitro!")
 */
module.exports = class ScamRule extends Rule {
  constructor({ id, punishment, limit, timeout, params, message, silent }) {
    super({
      id,
      name: 'scam',
      punishment,
      limit,
      timeout,
      params,
      message: message || 'Scam domain detected',
      silent,
    })
  }

  /**
   * Takes a message and returns a punishment (if any) to take against it (null, 'roleban', 'kick', 'ban')
   * @param {Discord.message} message
   */
  async filter(message) {
    if (message.content === '') {
      return
    }

    const cleanContent = cleanText(message.content)
    const hosts = getHostsFrom(cleanContent)

    if (hosts.length === 0) {
      return
    }

    const db = message.client.sleet.db
    const knownScams = await Promise.all(hosts.map(h => checkDBForScam(db, h)))

    if (knownScams.some(s => s && s.is_scam)) {
      // There's a scam
      knownScams.map(d => addHitToDB(db, d.host))

      return {
        punishment: this.punishment,
        deletes: [message],
        reason: 'Found scam domain',
        silent: true,
      }
    }
  }
}

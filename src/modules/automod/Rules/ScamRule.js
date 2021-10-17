const Rule = require('./Rule')

const URL_REGEX = /https?:\/\/(?<host>[^\s]+\.[^\s]+?)(?:\/|\b)/gi

/**
 * Get all hosts from some string, without repetition
 * @example
 * https://example.com/hello/world.html
 *         ^^^^^^^^^^^
 *            Host
 */
function getHostsFrom(text) {
  const matches = [...text.matchAll(URL_REGEX)].map(m => m.groups.host)
  // Don't have the same host twice
  return [...new Set(matches)]
}

/**
 * Contacts the phishing API to check if the host is a known scam domain
 */
function checkAPIForScam(host) {
  // API returns 0 or 1 to for "not known scam" and "known scam" respectively
  return fetch(`https://api.hyperphish.com/check-domain/${encodeURI(host)}`)
         .then(r => !!r.json())
}

/**
 * Checks a database to know if a host is a known scam or not
 * @returns {bool|null} True if a scam domain, False if not, null if unknown
 */
async function checkDBForScam(db, host) {
  const result = await db.oneOrNone('SELECT * FROM domains WHERE host = $1', [host])

  if (result === null) {
    return null
  }

  return result.is_scam
}

/**
 * Adds a host to the database, noting if it's a scam or not
 */
function addHostToDB(db, host, { isScam }) {
  return db.none('INSERT INTO domains (host, is_scam) VALUES ($1, $2)', [host, isScam])
}

/**
 * Checks for scam domains ("free discord nitro!")
 */
module.exports = class ScamRule extends Rule {
  constructor(id, punishment, limit, timeout, params) {
    super(id, 'scam', punishment, limit, timeout * 1000, params)
    this.name = 'Scam domain detected'
  }

  /**
   * Takes a message and returns a punishment (if any) to take against it (null, 'roleban', 'kick', 'ban')
   * @param {Discord.message} message
   */
  async filter(message) {
    if (message.content === '') {
      return
    }

    const hosts = getHostsFrom(message.content)

    if (hosts.length === 0) {
      return
    }

    const db = message.client.sleet.db
    const knownScams = await Promise.all(hosts.map(h => checkDBForScam(db, h)))

    if (knownScams.some(s => s)) {
      // There's a scam
      return {
        punishment: this.punishment,
        deletes: [message],
        reason: 'Found scam domain',
        silent: true,
      }
    }
  }
}

const AutoProp = require('./AutoProp')
const Rule = require('./Rule')

// Lol regexes
const inviteRegex =
  /(?:discord\s*\.?\s*gg\s*|discord\s*(?:app)?\s*\.?\s*com\s*\/?\s*invite)\s*\/?\s*(?<code>[a-z0-9-]+)/gi

/**
 * Allows a punishment to happen if a user shills another server
 */
module.exports = class AdRule extends Rule {
  /**
   * @param {String|Number} id The database id of this rule
   * @param {String} punishment The punishment to do
   * @param {Number} limit The max amount a user can post ads to servers
   * @param {Number} timeout The timeout (in seconds) before a violation expires
   * @param {String[]} params The ids of the servers to ignore in ads
   */
  constructor({ id, punishment, limit, timeout, params, message, silent }) {
    super({
      id,
      name: 'ad',
      punishment,
      limit,
      timeout,
      params: [],
      message: message || `Max ads (${limit}) reached`,
      silent,
    })

    this.violations = AutoProp({}, 0)
    this.shills = AutoProp({}, [])
  }

  async filter(message) {
    const uid = message.guild.id + message.author.id
    const allowed = this.params || []

    // Fetch all the invites mentionned that
    // 1) Exist
    // 2) Aren't for the same guild the message was sent in
    // 3) Aren't allowed
    const invites = (
      await getAllInvites(message.client, message.content)
    ).filter(v => {
      if (v.invite === true) {
        // Just a boolean
        return true
      } else if (v.invite.guild) {
        // Invite to guild
        return (
          v.invite.guild.id !== message.guild.id &&
          !allowed.includes(v.invite.guild.id)
        )
      } else if (v.channel.type === 'group') {
        // Group DM invite
        return true
      } else {
        // Unsure?
        return true
      }
    })

    if (invites.length === 0) return null

    this.violations[uid] += invites.reduce((acc, b) => acc + b.count, 0)

    let punishment

    if (this.violations[uid] >= this.limit) {
      punishment = this.punishment
    }

    const index = this.shills[uid].push(message.id) - 1
    setTimeout(
      (id, index) => --this.violations[id] || this.shills[id].splice(index, 1),
      this.timeout,
      uid,
      index,
    )

    return { punishment, deletes: this.shills[uid] }
  }
}

/**
 * Tries to get all the invites in a string, returning an array of
 *
 * {
 *   // The matched code
 *   code: {String},
 *   // The invite if possible, else best guess if it exists
 *   invite: {Discord.Invite|Boolean},
 *   // The number of times this invite appears
 *   count: {Number}
 * }
 *
 * @param {Discord.Client} client The client to resolve invites with
 * @param {String} str The string to check for invites
 * @return {Promise<FoundInvites[]>} An array of all the founds invites
 */
async function getAllInvites(client, str) {
  const valid = []
  const invites = getAllInviteCodes(inviteRegex, str)

  if (invites.length === 0) return []

  const counts = countOccurences(invites)
  const codes = Object.keys(counts)

  for (const code of codes) {
    const invite = await resolveInvite(client, code)

    if (invite !== false) {
      valid.push({ code, invite, count: counts[code] })
    }
  }

  return valid
}
module.exports.getAllInvites = getAllInvites

/**
 * Takes in an invite code, then tries to either:
 *   - Fetch it and return the invite info
 *   - Try to verify if it exists if it can't be fetched
 *
 * @param {String} code The invite code to check
 * @return {Discord.Invite|Boolean} The Invite object if it can be fetched, otherwise true/false based on *best guess* if it exists
 */
async function resolveInvite(client, code) {
  return true
  try {
    // First try to fetch it, if we can then it's obviously real
    return await client.fetchInvite(code)
  } catch (e) {
    return false
  }
}
module.exports.resolveInvite = resolveInvite

function getAllInviteCodes(reg, str) {
  return Array.from(str.matchAll(reg)).map(match => match.groups.code)
}

function countOccurences(arr) {
  const occ = {}

  for (const val of arr) {
    occ[val] ? occ[val]++ : (occ[val] = 1)
  }

  return occ
}

const AutoProp = require('./AutoProp')
const Rule = require('./Rule')

// Lol regexes
const inviteRegex = /(?:discord\s*\.?\s*gg\s*|discord\s*(?:app)?\s*\.?\s*com\s*\/?\s*invite)\s*\/?\s*([a-z0-9-]+?)(?:https:\/\/|discord\.gg|[^a-z0-9-]|$)/ig

/**
 * Allows a punishment to happen if a user shills another server
 */
module.exports = class AdRule extends Rule {
  /**
   * @param {String|Number} id The database id of this rule
   * @param {String} punishment The punishment to do
   * @param {Number} maxAds The max amount a user can post ads to servers
   * @param {Number} timeout The timeout (in seconds) before a violation expires
   * @param {String[]} params The ids of the servers to ignore in ads
   */
  constructor(id, punishment, maxAds, timeout, params) {
    super(id, 'ad', punishment, maxAds, timeout, [])
    this.punishment = punishment
    this.maxAds = maxAds
    this.timeout = timeout * 1000
    this.parameters = params

    this.violations = AutoProp({}, 0)
    this.shills = AutoProp({}, [])
    this.name = `Max ads (${maxAds}) reached`
  }

  async filter(message) {
    const uid = message.guild.id + message.author.id
    const allowed = this.parameters || []

    // Fetch all the invites mentionned that
    // 1) Exist
    // 2) Aren't for the same guild the message was sent in
    // 3) Aren't allowed
    const invites = (await getAllInvites(message.client, message.content))
      .filter(v => v.invite === true || (v.invite.guild.id !== message.guild.id && !allowed.includes(v.invite.guild.id)) )

    if (invites.length === 0)
      return null

    this.violations[uid] += invites.reduce((acc, b) => acc + b.count, 0)

    let punishment

    if (this.violations[uid] >= this.maxAds) {
      punishment = this.punishment
    }

    const index = this.shills[uid].push(message.id) - 1
    setTimeout((id, index) => --this.violations[id] || this.shills[id].splice(index, 1), this.timeout, uid, index)

    return ({ punishment, deletes: this.shills[uid] })
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
 * @return {FoundInvites[]} An array of all the founds invites
 */
async function getAllInvites(client, str) {
  const valid = []
  const invites = findAllMatches(inviteRegex, str)

  if (invites.length === 0)
    return []

  const counts = countOccurences(invites)
  const codes = Object.keys(counts)

  for (const code of codes) {
    const invite = await resolveInvite(client, code)

    if (invite !== false) {
      valid.push({code, invite, count: counts[code]})
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
  try {
    // First try to fetch it, if we can then it's obviously real
    // This *does* fail if we're banned so...
    return await client.fetchInvite(code)
  } catch(e) {
    try {
      // ...we try deleting it
      // If we can, whoops, shouldn't happen anyways
      await client.rest.methods.deleteInvite({code})
      return false
    } catch(e){
      // If we can't, then it exists but we don't have perms (obviously, we're banned)
      // (While banned, trying to fetch it returns a 404, but trying to delete it returns a 403)
      return (e.name === 'DiscordAPIError' && (e.code === 50013 || e.message === 'Missing Permissions'))
    }
  }
}
module.exports.resolveInvite = resolveInvite

function findAllMatches(reg, str) {
  let arr
  const matches = []

  while ((arr = reg.exec(str)) !== null) {
    matches.push(arr[1])
  }

  reg.lastIndex = 0
  return matches
}

function countOccurences(arr) {
  const occ = {}

  for (const val of arr) {
    occ[val] ? occ[val]++ : occ[val] = 1
  }

  return occ
}

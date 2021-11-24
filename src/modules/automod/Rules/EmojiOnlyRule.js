const AutoProp = require('./AutoProp')
const Rule = require('./Rule')

/**
 * A rule to prevent a user posting more than X messages with just emoji
 */
module.exports = class EmojiOnlyRule extends Rule {
  /**
   * @param {string|number} id The id of this rule in the database
   * @param {String} punishment The punishment to apply
   * @param {Number} maxRepeats The max number a user can repeat their message
   * @param {Number} timeout The timeout (in seconds) before a violation expires
   * @param {String[]} ignore If a message starts with one of the strings, ignore it
   */
  constructor({
    id,
    punishment,
    limit,
    timeout,
    params = [],
    message,
    silent,
  }) {
    super({
      id,
      name: 'emojionly',
      punishment,
      limit,
      timeout,
      params,
      message: message || `Max emoji-only messages reached (${limit})`,
      silent,
    })

    this.ignore = params.map(v => v.toLowerCase())
    this.lastMessage = {}
    this.violations = new Map()
  }

  filter(message) {
    const uid = message.guild.id + message.author.id
    const caught = this.violations.get(uid) || new Set()

    if (justEmoji(message.content)) {
      caught.add(message.id)

      if (caught.size >= this.limit) {
        caught.clear()
        this.violations.set(uid, caught)
        return { punishment: this.punishment }
      }

      this.violations.set(uid, caught)

      setTimeout(() => {
        caught.delete(message.id)
        this.violations.set(uid, caught)
      }, this.timeout)
    }
  }
}

function justEmoji(str) {
  return emojiOnlyRegex.test(str)
}

// Matches if a message contains only custom emoji, unicode emojis, and/or spaces
const emojiOnlyRegex =
  /^(?:<a?:\w+:\d+>|[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3|\u3299|\u3297|\u303d|\u3030|\u24c2|\ud83c[\udd70-\udd71]|\ud83c[\udd7e-\udd7f]|\ud83c\udd8e|\ud83c[\udd91-\udd9a]|\ud83c[\udde6-\uddff]|[\ud83c[\ude01\uddff]|\ud83c[\ude01-\ude02]|\ud83c\ude1a|\ud83c\ude2f|[\ud83c[\ude32\ude02]|\ud83c\ude1a|\ud83c\ude2f|\ud83c[\ude32-\ude3a]|[\ud83c[\ude50\ude3a]|\ud83c[\ude50-\ude51]|\u203c|\u2049|[\u25aa-\u25ab]|\u25b6|\u25c0|[\u25fb-\u25fe]|\u00a9|\u00ae|\u2122|\u2139|\ud83c\udc04|[\u2600-\u26FF]|\u2b05|\u2b06|\u2b07|\u2b1b|\u2b1c|\u2b50|\u2b55|\u231a|\u231b|\u2328|\u23cf|[\u23e9-\u23f3]|[\u23f8-\u23fa]|\ud83c\udccf|\u2934|\u2935|[\u2190-\u21ff]| )+$/

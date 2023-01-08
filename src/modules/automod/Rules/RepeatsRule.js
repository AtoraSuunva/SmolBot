const Rule = require('./Rule')

/**
 * A rule to prevent a user repeating a message more than X times
 */
module.exports = class RepeatsRule extends Rule {
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
      name: 'repeats',
      punishment,
      limit,
      timeout,
      params: params.map(v => v.toLowerCase()),
      message: message || `Max repeats reached (${limit})`,
      silent,
    })

    this.lastMessage = new Map()
    this.violations = new Map()
  }

  filter(message) {
    const uid = message.guild.id + message.author.id
    const caught = this.violations.get(uid) || new Set()

    if (isRepeat(message, this.lastMessage.get(uid))) {
      caught.add(message.id)

      if (caught.size >= this.limit - 1) {
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

    this.lastMessage.set(uid, {
      id: message.id,
      content: message.content,
    })
  }
}

function isRepeat(message, lastMessage) {
  if (!message || !lastMessage) return false
  return (
    message.id !== lastMessage.id && message.content === lastMessage.content
  )
}

const AutoProp = require('./AutoProp')
const Rule = require('./Rule')

/**
 * A rule to prevent a user from posting the same embed X times, matching via name/size
 */
module.exports = class EmbedsRule extends Rule {
  /**
   * @param {string|number} id The database id of this rule
   * @param {String} punishment The punishment to apply
   * @param {Number} maxRepeats The max number of embeds with the same name/size
   * @param {Number} timeout The time (in seconds) before a violation expires
   */
  constructor({ id, punishment, limit, timeout, message, silent }) {
    super({
      id,
      name: 'embeds',
      punishment,
      limit,
      timeout,
      params: [],
      message: message || `Max embed repeats reached (${limit})`,
      silent,
    })

    this.lastAttach = {}
    this.violations = AutoProp({})
  }

  filter(message) {
    // Avoid tossing people for editing a message with an embed
    if (message.edits.length > 1) return

    const uid = message.guild.id + message.author.id
    const attach = message.attachments.first()

    if (!attach) {
      this.lastAttach[uid] = null
      return
    }

    const lAttach = this.lastAttach[uid]

    if (
      lAttach &&
      attach.name === lAttach.name &&
      attach.size === lAttach.size
    ) {
      if (++this.violations[uid] >= this.limit) {
        return { punishment: this.punishment }
      }

      setTimeout(id => --this.violations[id], this.timeout, uid)
    }

    this.lastAttach[uid] = {
      name: attach.name,
      size: attach.size,
    }
  }
}

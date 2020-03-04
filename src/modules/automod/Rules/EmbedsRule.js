const AutoProp = require('./AutoProp')
const Rule = require('./Rule')

/**
 * A rule to prevent a user from posting the same embed X times, matching via filename/filesize
 */
module.exports = class EmbedsRule extends Rule {
  /**
   * @param {string|number} id The database id of this rule
   * @param {String} punishment The punishment to apply
   * @param {Number} maxRepeats The max number of embeds with the same filename/filesize
   * @param {Number} timeout The time (in seconds) before a violation expires
   */
  constructor(id, punishment, maxRepeats, timeout) {
    super(id, 'embeds', punishment, maxRepeats, timeout, [])
    this.punishment = punishment
    this.maxRepeats = maxRepeats
    this.timeout = timeout * 1000
    this.parameters = []

    this.lastAttach = {}
    this.violations = AutoProp({})
    this.name = `Max embed repeats reached (${maxRepeats})`
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

    if (lAttach && attach.filename === lAttach.filename && attach.filesize === lAttach.filesize) {
      if (++this.violations[uid] >= this.maxRepeats) {
        return ({ punishment: this.punishment })
      }

      setTimeout(id => --this.violations[id], this.timeout, uid)
    }

    this.lastAttach[uid] = {filename: attach.filename, filesize: attach.filesize}
  }
}

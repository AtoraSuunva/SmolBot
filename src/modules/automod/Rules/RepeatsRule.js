const AutoProp = require('./AutoProp')
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
  constructor(id, punishment, maxRepeats, timeout, ignore = []) {
    super(id, 'repeats', punishment, maxRepeats, timeout, ignore)
    this.punishment = punishment
    this.maxRepeats = maxRepeats
    this.timeout = timeout * 1000
    this.parameters = ignore

    this.ignore = ignore.map(v => v.toLowerCase())
    this.lastMessage = {}
    this.violations = AutoProp({})
    this.name = `Max repeats reached (${maxRepeats})`
  }

  filter(message) {
    const uid = message.guild.id + message.author.id

    if (this.ignore.find(v => message.content.toLowerCase().startsWith(v))) {
      return
    }

    if (this.lastMessage[uid] && message.content === this.lastMessage[uid]) {
      // -1 because the first message isn't counted since it's not a repeat
      if (++this.violations[uid] >= this.maxRepeats - 1) {
        this.violations[uid] = 0
        return { punishment: this.punishment }
      }

      setTimeout(id => --this.violations[id], this.timeout, uid)
    }

    this.lastMessage[uid] = message.content
  }
}

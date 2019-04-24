const AutoProp = require('./AutoProp')
const Rule = require('./Rule')
const checkStrForArray = (str, arr) => arr.some(v => str.includes(v))
const countOcc = (str, arr) => str.split('').map(v => arr.includes(v)).reduce((a, b) => a + b, 0)

// longass arabic char, of char, halfwidth spacer
const defaultChars = ['\u{fdfd}', '\u{94c}', '\u{ffa0}']

 /**
 * A list of forebidden chars a user can't post
 * Recommended to blacklist client crashing chars, as messages are auto-deleted no matter the punishment
 * The punishment applies after maxChars in a message/maxChars over the last X messages in Y seconds
 */
module.exports = class ForbiddenChars extends Rule {
  /**
   * @param {string|number} id The id of this rule in the database
   * @param {String} punishment The punishment to apply after violating too many forbidden chars
   * @param {String[]} charList An array of chars to blacklist & delete on sight
   * @param {Number} maxChars The max amount a user can post a blacklisted char in 1/over many messages
   * @param {Number} timeout The timeout (in seconds) before a violation expires
   */
  constructor(id, punishment, maxChars, timeout, charList = defaultChars) {
    super(id, 'forbidden', punishment, maxChars, timeout, charList)
    this.punishment = punishment
    this.maxChars = maxChars
    this.timeout = timeout * 1000
    this.parameters = charList

    this.charList = charList
    this.lastMessage = {}
    this.violations = AutoProp({})
    this.name = `Max forbidden characters (${maxChars}) reached.`
  }

  filter(message) {
    const uid = message.guild.id + message.author.id
    const occ = countOcc(message.content, this.charList)

    if (occ > 0) {
      setTimeout(id => --this.violations[id], this.timeout, uid)
      if ((this.violations[uid] + occ) >= this.maxChars) {
        return this.punishment
      } else {
        return 'delete'
      }
    }
  }
}

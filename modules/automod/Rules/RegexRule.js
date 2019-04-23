const AutoProp = require('./AutoProp')
const Rule = require('./Rule')

 /**
 * Matches messages against a regex, matching messages then get a punishment >:(
 */
module.exports = class RegexRule extends Rule {
  /**
   * @param {string|number} id The id of this rule in the database
   * @param {String} punishment The punishment to apply after violating too regex matches
   * @param {Number} maxChars The max amount a user can match against a regex (can match multiple times/message)
   * @param {Number} timeout The timeout (in seconds) before a violation expires
   * @param {String[]|Regex[]} regex The regex to match against. Only the first element is taken
   */
  constructor(id, punishment, maxCount, timeout, regex) {
    super(id, 'regex', punishment, maxCount, timeout, regex)
    this.punishment = punishment
    this.maxCount = maxCount
    this.timeout = timeout * 1000
    this.parameters = regex

    this.regex = regex[0] instanceof RegExp ? regex[0] : new RegExp(regex[0], 'g')
    this.lastMessage = {}
    this.violations = AutoProp({})
    this.vioMessages = {}

    this.name = `Max regex matches (${maxCount}) reached.`
  }

  filter(message) {
    const uid = message.guild.id + message.author.id
    const match = message.content.match(this.regex)

    if (match === null) return

    const occ = match.length

    if (occ > 0) {
      this.violations[uid] += occ

      this.vioMessages[uid] = this.vioMessages[uid] || []
      this.vioMessages[uid].push(message)

      setTimeout((id, occ) => {
        this.violations[id] - occ
        this.vioMessages[id].shift()
      }, this.timeout, uid, occ)


      if (this.violations[uid] >= this.maxCount) {
        return [this.punishment, this.vioMessages[uid]]
      }

    }
  }
}

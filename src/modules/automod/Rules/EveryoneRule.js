const AutoProp = require('./AutoProp')
const Rule = require('./Rule')

/**
 * Allows a punishment to happen if a user mentions everyone/a trap everyone role X times
 */
module.exports = class EveryoneRule extends Rule {
  /**
   * @param {string|number} id The id of this rule int the database
   * @param {String} punishment The punishment to do
   * @param {Number} maxMentions The max amount a user can try to mention everyone
   * @param {Number} timeout The timeout (in seconds) before a violation expires
   * @param {String[]?} trapRoles The IDs of 'trap' mentionable roles called 'everyone' and 'here', in that order
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
      name: 'everyone',
      punishment,
      limit,
      timeout,
      params,
      message: message || `Max everyone/here mentions (${limit}) reached`,
      silent,
    })

    this.violations = AutoProp({})
  }

  filter(message) {
    const uid = message.guild.id + message.author.id

    if (
      message.mentions.everyone ||
      this.params.some(r => message.mentions.roles.has(r))
    ) {
      if (++this.violations[uid] >= this.limit) {
        return { punishment: this.punishment }
      }
      setTimeout(id => --this.violations[id], this.timeout, uid)
    }
  }
}

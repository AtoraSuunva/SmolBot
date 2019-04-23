/**
 * Some basic Rule
 * Takes a punishment (null, 'delete', roleban', 'kick', 'ban') and does it all the time
 */
module.exports = class Rule {
  constructor(id, name, punishment, limit, timeout, params) {
    this.id = id
    this.name = name
    this.punishment = punishment
    this.limit = limit
    this.timeout = timeout
    this.params = params
  }

  /**
   * Takes a message and returns a punishment (if any) to take against it (null, 'roleban', 'kick', 'ban')
   * @param {Discord.message} message
   */
  filter(message) {
    if (message)
      return this.punishment
  }
}

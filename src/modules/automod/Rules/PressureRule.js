const PRESSURE = {
  /** Base pressure added on every message */
  BASE: 10,
  /** Added for each embed */
  EMBED: 8.3,
  /** Added for each character */
  LENGTH: 0.0125,
  /** Added for each newline */
  LINE: 0.714,
  /** Added for each mention */
  MENTION: 2.5,
  /** Added for each repeat message */
  // Potential change: repeats add the pressure of the previous message
  REPEAT: 10,
  /** The pressure decay per second */
  DECAY: 2,
}

/**
 * Pressure-based automod, based on https://erikmcclure.com/blog/pressure-based-anti-spam-for-discord-bots/
 */
module.exports = class Rule {
  constructor(id, punishment, limit, timeout, params) {
    this.id = id
    this.name = `Max Pressure (${limit})`
    this.punishment = punishment
    this.limit = limit
    this.timeout = timeout * 1000
    this.params = params
    this.reason = `Too much pressure (${limit})`

    this.pressure = new Map()
    this.lastMessage = new Map()
  }

  /**
   * Takes a message and returns a punishment (if any) to take against it (null, 'roleban', 'kick', 'ban')
   * @param {Discord.message} message
   */
  filter(message) {
    const { member } = message
    let pressure = this.getPressure(member)
    const initial = pressure

    // console.log(`[PRESSURE] ${message.author.tag} - (Init) Pressure: ${pressure}`)

    const lastMessage = this.getLastMessage(member)

    if (lastMessage) {
      const decay = ((Date.now() - lastMessage.createdTimestamp) / 1000) * PRESSURE.DECAY
      pressure = Math.max(pressure - decay, 0)
      // console.log(`[PRESSURE]   - Decay: ${decay} => Final: ${pressure}`)
    }

    const BASE = PRESSURE.BASE
    pressure += BASE
    // console.log(`[PRESSURE]   - Base    : ${BASE}`)

    const EMBEDS = (message.attachments.size + message.embeds.length) * PRESSURE.EMBED
    pressure += EMBEDS
    // console.log(`[PRESSURE]   - Embeds  : ${EMBEDS}`)

    const LENGTH = message.content.length * PRESSURE.LENGTH
    pressure += LENGTH
    // console.log(`[PRESSURE]   - Length  : ${LENGTH}`)

    const CAPS = message.content.replace(/[^A-Z]/g, '').length * PRESSURE.LENGTH
    pressure += CAPS
    // console.log(`[PRESSURE]   - CAPS    : ${CAPS}`)

    const LINES = (message.content.split('\n').length - 1) * PRESSURE.LINE
    pressure += LINES
    // console.log(`[PRESSURE]   - Lines   : ${LINES}`)

    const MENTIONS = (message.mentions.users.size + message.mentions.roles.size) * PRESSURE.MENTION
    pressure += MENTIONS
    // console.log(`[PRESSURE]   - Mentions: ${MENTIONS}`)

    let REPEAT = 0
    if (lastMessage) {
      REPEAT = (message.content === lastMessage.content) * PRESSURE.REPEAT
      pressure += REPEAT
      // console.log(`[PRESSURE]   - Repeat  : ${REPEAT}`)
    }

    this.setLastMessage(member, message)
    this.setPressure(member, pressure)
    // console.log(`[PRESSURE] ${message.author.tag} - (End ) Pressure: ${pressure}`)

    if (pressure >= this.limit)
      return ({ punishment: this.punishment, reason: `Too much pressure: ${initial.toFixed(2)} => ${pressure.toFixed(2)} (B${BASE}+E${EMBEDS}+L${LENGTH}+C${CAPS}+L${LINES}+M${MENTIONS}+R${REPEAT})` })
  }

  /** @returns string uid suitable for automod */
  uidFrom(member) {
    return `${member.guild.id}-${member.id}`
  }

  /** The last message recorded, or null */
  getLastMessage(member) {
    return this.lastMessage.get(this.uidFrom(member)) || null
  }

  /** Just set the last message */
  setLastMessage(member, message) {
    return this.lastMessage.set(this.uidFrom(member), message)
  }

  /** Get current pressure */
  getPressure(member) {
    return this.pressure.get(this.uidFrom(member)) || 0
  }

  /** Sets pressure */
  setPressure(member, amount) {
    return this.pressure.set(this.uidFrom(member), amount)
  }
}

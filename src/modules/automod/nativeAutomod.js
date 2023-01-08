// @ts-check
const { MessageEmbed } = require('discord.js')
const tldts = require('tldts')

module.exports.config = {
  name: 'nativeAutomod',
  invokers: [],
  help: 'Integrates with native automod',
  expandedHelp: 'It integrates with native automod wow',
  invisible: true,
}

module.exports.events = {}
module.exports.events.raw = handleRaw

// #region types
/** @typedef {import("discord.js/src/client/Client")} Client */
/** @typedef {import("discord.js/src/structures/Message")} Message */
/** @typedef {import("discord.js/src/structures/Guild")} Guild */
/** @typedef {import("discord.js/src/structures/GuildMember")} GuildMember */
/** @typedef {import("discord.js/src/structures/interfaces/TextBasedChannel")} TextBasedChannel */
/** @typedef {import("discord.js/src/structures/User")} User */

/**
 * @typedef Packet
 * @property {string} t
 * @property {number} s
 * @property {number} op
 * @property {object} d
 */

/**
 * @typedef AutomodEmbedField
 * @property {string} name
 * @property {string} value
 * @property {boolean} inline
 */

/**
 * @typedef AutomodEmbed
 * @property {string} type
 * @property {AutomodEmbedField[]} fields
 * @property {string} description
 */

/**
 * @typedef AutomodCase
 * @property {'auto_moderation_message'} type The type (constant)
 * @property {string} messageContent The message the user sent
 * @property {string} ruleName The name of the rule triggered
 *
 * @property {Guild} guild The guild this happened in
 * @property {User} user The user who trigged the rule
 * @property {GuildMember} member The member who triggered the rule
 * @property {TextBasedChannel} channel The channel the user triggered the rule in
 * @property {TextBasedChannel} logChannel The channel the automod log was posted to
 */

// #endregion

const AUTOMOD_TYPE = 24

/**
 * @param {Client} bot
 */
function handleRaw(bot, packet) {
  if (!packet.d || packet.d.guild_id !== '120330239996854274') {
    return
  }

  if (packet.d.type !== AUTOMOD_TYPE) {
    return
  }

  // ignore errors for now...
  createAutomodCase(bot, packet)
    .then(automodCase => handleNewAutomodCase(bot, automodCase))
    .catch(e => {})
}

/**
 * @param {Client} bot
 * @param {*} packet
 * @returns {Promise<AutomodCase>}
 */
async function createAutomodCase(bot, packet) {
  const { guild_id, author, channel_id: log_channel_id, embeds } = packet.d
  const embed = embeds[0]

  const type = embed.type
  const messageContent = embed.description
  const ruleName = findField(embed, 'rule_name').value

  const guild = await bot.guilds.fetch(guild_id)
  const user = await bot.users.fetch(author.id)
  /** @type {GuildMember} */
  const member = await guild.members.fetch(author.id)

  const channel_id = findField(embed, 'channel_id').value
  /** @type {TextBasedChannel} */
  // @ts-ignore
  const channel = guild.channels.cache.get(channel_id)

  /** @type {TextBasedChannel} */
  // @ts-ignore
  const logChannel = guild.channels.cache.get(log_channel_id)

  /** @type {AutomodCase} */
  const automodCase = {
    type,
    messageContent,
    ruleName,

    guild,
    user,
    member,
    channel,
    logChannel,
  }

  return automodCase
}

/**
 * @param {AutomodEmbed} embed
 * @param {string} fieldName
 * @returns {AutomodEmbedField}
 */
function findField(embed, fieldName) {
  return embed.fields.find(field => field.name === fieldName)
}

/**
 * @param {Client} bot
 * @param {AutomodCase} automodCase
 */
function handleNewAutomodCase(bot, automodCase) {
  // Yay!
  switch (automodCase.ruleName) {
    case 'Harmful Link Filter':
      // @ts-ignore
      handleHarmfulLink(bot, automodCase).catch(e => bot.sleet.logger.error(e))
      break
  }
}

// this should be in another file but im doing like 1 integration for now

const LINK_REGEX = /(?:https?:\/\/)?(?:[^\s]+\.)+[^\s]+(?:\/[^\s]+)?/gi
const IGNORE_USERS = ['297555667944734721']

/**
 * @param {Client} bot
 * @param {AutomodCase} automodCase
 */
async function handleHarmfulLink(bot, automodCase) {
  const { messageContent, member, ruleName, logChannel } = automodCase
  const links = Array.from(
    new Set(
      messageContent
        .match(LINK_REGEX)
        .map(link => tldts.parse(link))
        .flatMap(parsed =>
          parsed.domain === parsed.hostname
            ? [parsed.domain]
            : [parsed.domain, parsed.hostname],
        ),
    ),
  )

  if (links.length === 0) {
    // how
    return
  }

  // @ts-ignore
  const domainInfo = await getDomainsFromDB(bot.sleet.db, links)

  console.log(links)
  console.log(domainInfo)

  const scams = domainInfo.filter(info => info.is_scam).map(info => info.host)
  const iploggers = domainInfo
    .filter(info => info.is_iplogger)
    .map(info => info.host)
  const shortener = domainInfo
    .filter(info => info.is_shortener)
    .map(info => info.host)

  const scamText = scams.join('\n')
  const iploggerText = iploggers.join('\n')
  const shortenerText = shortener.join('\n')

  const embed = new MessageEmbed()
    .setTitle('Discord Automod caught a harmful link!')
    .setDescription(messageContent)
    .setColor('#ff0000')
    .addField('User', `${member.user.tag} (${member.user.id})`, true)
    .addField('Rule', ruleName)

  if (scamText) {
    embed.addField('Scams', scamText, true)
  }

  if (iploggerText) {
    embed.addField('IP Loggers', iploggerText, true)
  }

  if (shortenerText) {
    embed.addField('Shorteners', shortenerText, true)
  }

  const caughtSomething = scamText || iploggerText

  if (caughtSomething && member.kickable && !IGNORE_USERS.includes(member.id)) {
    await member.kick(`Automod caught a harmful link`)
    embed.setFooter('User was kicked for harmful link')
  }

  logChannel.send({ embed })
}

/**
 * @typedef DomainInfo
 * @property {string} host The hostname or domain
 * @property {boolean} is_scam Known scam domain
 * @property {boolean} is_iplogger Known iplogger
 * @property {boolean} is_shortener Known shortener
 * @property {boolean} is_revoked The API revoked this domain from the scam domain list
 */

/**
 * Get some info for some domains from the domain db
 * @param {*} db The database
 * @param {string[]} domains The domains to check
 * @returns {Promise<DomainInfo[]>}
 */
async function getDomainsFromDB(db, domains) {
  /** @type {DomainInfo[]} */
  const result = await db.many(
    `SELECT host, is_scam, is_iplogger, is_shortener, is_revoked FROM domains WHERE host = ANY($1) AND is_revoked = false`,
    [domains],
  )

  return result
}

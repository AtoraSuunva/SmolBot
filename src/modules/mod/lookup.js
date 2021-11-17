const { invokers } = (module.exports.config = {
  name: 'lookup',
  invokers: ['lookup', 'whois', 'who is', 'who the fuck is', '?'],
  help: 'Fetches info for a user, guild, or invite',
  expandedHelp:
    'Use a user id, guild id, or guild invite to fetch public info about them',
  usage: [
    'User',
    'lookup 74768773940256768',
    'Guild',
    'lookup 81384788765712384',
    'Invite',
    'lookup discord-api',
  ],
})

const fetch = require('node-fetch')
const Discord = require('discord.js')
const time = require('./time.js')

module.exports.events = {}
/**
 *
 * @param {Discord.Client} bot
 * @param {Discord.Message} message
 * @returns
 */
module.exports.events.message = async (bot, message) => {
  let [cmd, data] = bot.sleet.shlex(message, { invokers })

  if (!data) {
    return message.channel.send('What do you want me to lookup?')
  }

  let err

  try {
    const u = await bot.users.fetch(data)
    return sendUserLookup(bot, message.channel, u)
  } catch (e) {
    err = e
  }

  try {
    const i = await bot.fetchInvite(data)
    return sendInviteLookup(bot, message.channel, i)
  } catch (e) {
    console.log(e)
    err = e
  }

  try {
    const g = await fetchGuild(data)

    if (g.message) {
      return message.channel.send(g.message)
    }

    if (g.instant_invite) {
      return sendInviteLookup(
        bot,
        message.channel,
        await bot.fetchInvite(g.instant_invite),
      )
    }

    return sendGuildLookup(message.channel, g)
  } catch (e) {
    err = e
  }

  message.channel.send(
    `Did not find a user, invite, or guild with "\`${data}\`"...\n${err}`,
  )
}

const widgetUrl = g =>
  `https://canary.discordapp.com/api/guilds/${g}/widget.json`

async function fetchGuild(data) {
  let r

  try {
    r = await fetch(widgetUrl(data))
  } catch (e) {
    r = e
  }

  if (r.status === 404 || r.status === 400) {
    throw new Error('No guild found or snowflake incorrect.')
  } else if (r.status === 403) {
    const snowflake = Discord.SnowflakeUtil.deconstruct(data)
    return {
      message:
        'Guild found with id "`' +
        data +
        '`", no more information found.\n' +
        `Guild created at: ${formatCreatedAt(snowflake.date)}`,
    }
  } else if (r.status === 200) {
    return r.json()
  }
}

const rpcUrl = app => `https://discord.com/api/applications/${app}/rpc`
const oAuthUrl = app =>
  `https://discord.com/oauth2/authorize?client_id=${app}&permissions=0&scope=bot`

async function getRPCDetails(app) {
  let res

  res = await fetch(rpcUrl(app))

  if (res.status === 404) {
    throw new Error('No application found or snowflake incorrect.')
  } else if (res.status === 200) {
    return res.json()
  }
}

const Badges = {
  DISCORD_EMPLOYEE: '<:BadgeStaff:909313939911897138>',
  PARTNERED_SERVER_OWNER: '<:BadgePartner:909313940725571604>',
  HYPESQUAD_EVENTS: '<:BadgeHypeSquadEvents:909313941178548246>',
  BUGHUNTER_LEVEL_1: '<:BadgeBugHunter:909313942407483402>',
  HOUSE_BRAVERY: '<:BadgeBravery:909313943233789972>',
  HOUSE_BRILLIANCE: '<:BadgeBrilliance:909313944047468544>',
  HOUSE_BALANCE: '<:BadgeBalance:909313944869564416>',
  EARLY_SUPPORTER: '<:BadgeEarlySupporter:909313946132029440>',
  TEAM_USER: '[Team User]',
  BUGHUNTER_LEVEL_2: '<:BadgeBugHunterLvl2:909313947172233266>',
  VERIFIED_BOT: '<:VerifiedBot:910427927160709180>',
  EARLY_VERIFIED_DEVELOPER:
    '<:BadgeEarlyVerifiedBotDeveloper:909313948355018752>',
  DISCORD_CERTIFIED_MODERATOR: '<:BadgeCertifiedMod:909313949332275300>',
  BOT_HTTP_INTERACTIONS: '[HTTP Interactions]',
}

function getUserBadgeEmojis(user) {
  if (!user.flags) return []

  const badges = []

  for (const [key, flag] of Object.entries(Discord.UserFlags.FLAGS)) {
    if (key !== 'VERIFIED_BOT' && user.flags.has(flag)) {
      badges.push(Badges[key])
    }
  }

  return badges
}

async function sendUserLookup(bot, channel, user) {
  if (!(user instanceof Discord.User)) {
    return channel.send('Did not find info for that user.')
  }

  const rawUser = '`' + Discord.Util.escapeInlineCode(user.tag) + '`'
  const badges = getUserBadgeEmojis(user)
  const formattedBadges =
    badges.length > 0 ? `\n**Badges:** ${badges.join(' ')}` : ''

  const embed = new Discord.MessageEmbed()
    .setTitle(bot.sleet.formatUser(user, { id: false, plain: true }))
    .setThumbnail(user.displayAvatarURL({ size: 4096 }))
    .setDescription(
      `**ID:** ${user.id}\n**Raw Username:** ${rawUser}${formattedBadges}`,
    )
    .addField('Created at:', formatCreatedAt(user.createdAt))

  if (user.bot) {
    const verifiedBot = user.flags.has('VERIFIED_BOT')

    let rpc = null
    try {
      rpc = await getRPCDetails(user.id)
    } catch (e) {
      rpc = null
    }

    const details = []

    if (verifiedBot) {
      details.push(`${Badges.VERIFIED_BOT} **Verified Bot**`)
    }

    if (rpc) {
      const availability = rpc.bot_public ? 'Public' : 'Private'
      details.push(
        `**${availability}** [(Invite)](${oAuthUrl(rpc.id)})\n`,
        `> ${rpc.description.replaceAll(/\n/g, '\n> ')}`,
      )
    } else {
      details.push('No RPC information available. This bot is likely too old.')
    }

    const formattedDetails = details.join('\n')
    embed.addField('Bot Details:', formattedDetails)
  }

  channel.send({ embed })
}

const ONLINE = '<:i_online:468214881623998464>'
const OFFLINE = '<:i_offline2:468215162244038687>'

/**
 *
 * @param {Discord.Client} bot
 * @param {Discord.TextChannel} channel
 * @param {Discord.Invite} invite
 */
function sendInviteLookup(bot, channel, invite) {
  const { guild, code, presenceCount, memberCount } = invite

  const embed = new Discord.MessageEmbed()

  if (guild.description) {
    embed.setDescription(guild.description)
  }

  embed.setTitle(`:incoming_envelope:  Invite: ${code}`)
  embed.addField(
    `Guild Info:`,
    `${guild.name}\n**ID:** ${guild.id}\n[#${invite.channel.name}](http://discord.com)`,
    true,
  )

  const ratio = ((presenceCount / memberCount) * 100).toFixed(0)
  embed.addField(
    'Members:',
    `${ONLINE} **${presenceCount}** Online (${ratio}%)\n` +
      `${OFFLINE} **${memberCount}** Total`,
    true,
  )

  embed.addField('Created at:', formatCreatedAt(guild.createdAt))

  if (guild.icon) {
    embed.setThumbnail(guild.iconURL({ size: 4096 }))
  }

  if (guild.features.length > 0) {
    embed.addField(
      'Features:',
      '```\n' + guild.features.sort().join(', ') + '\n```',
    )
  }

  const images = []

  if (guild.splash) {
    images.push(`[Splash](${guild.splashURL({ size: 4096 })})`)
  }

  if (guild.banner) {
    images.push(`[Banner](${guild.bannerURL({ size: 4096 })})`)
  }

  if (images.length > 0) {
    embed.addField('Images:', images.join('\n'), true)
  }

  embed.addField('Verification Level:', guild.verificationLevel, true)

  if (guild.vanityURLCode) {
    embed.addField(
      'Vanity URL:',
      `[/${guild.vanityURLCode}](https://discord.gg/${guild.vanityURLCode})`,
      true,
    )
  }

  if (invite.inviter) {
    embed.addField('Inviter:', `${bot.sleet.formatUser(invite.inviter)}`, true)
  }

  channel.send({ embed })
}

function sendGuildLookup(channel, guild) {
  const created = Discord.SnowflakeUtil.deconstruct(guild.id).date

  const embed = new Discord.MessageEmbed()
    .setTitle(`Guild: ${guild.name}`)
    .addField('ID:', guild.id, true)
    .addField('Invite:', guild.instant_invite, true)
    .addField('Channels:', guild.channels.length + ' voice', true)
    .addField('Members:', guild.presence_count + ' online', true)
    .addField('Created at:', created.toUTCString())
    .setTimestamp(created)

  channel.send({ embed })
}

function formatCreatedAt(date) {
  return date.toUTCString() + ' (' + time.since(date).format() + ')'
}

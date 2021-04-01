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
let botTag

module.exports.events = {}
module.exports.events.message = async (bot, message) => {
  let [cmd, data] = bot.sleet.shlex(message, { invokers })

  botTag = botTag || bot.emojis.cache.find(e => e.name === 'botTag') || '[BOT]'

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
    return {
      message:
        'Guild found with id "`' + data + '`", no more information found.',
    }
  } else if (r.status === 200) {
    return r.json()
  }
}

function sendUserLookup(bot, channel, user) {
  if (!(user instanceof Discord.User))
    return channel.send('Did not find info for that user.')

  channel.send({
    embed: new Discord.MessageEmbed()
      .setTitle(bot.sleet.formatUser(user, false))
      .setThumbnail(user.displayAvatarURL())
      .setDescription(`**ID:** ${user.id}`)
      .addField('\nAccount Age:', time.since(user.createdAt).format())
      .addField('Created at (UTC):', user.createdAt.toUTCString())
      .setFooter('Created at')
      .setTimestamp(user.createdAt),
  })
}

function sendInviteLookup(bot, channel, invite) {
  const created = Discord.SnowflakeUtil.deconstruct(invite.guild.id).date
  const embed = new Discord.MessageEmbed()
    .setTitle(`:incoming_envelope: Invite: ${invite.code}`)
    .addField(
      `Guild (${invite.guild.id})`,
      invite.guild.name + '\n[#' + invite.channel.name + '](http://a.ca)',
    )

  if (invite.guild.icon) embed.setThumbnail(invite.guild.iconURL())

  if (invite.guild.splash) embed.setImage(invite.guild.splashURL())

  if (invite.guild.available)
    embed.addField(
      'Created at:',
      `${invite.guild.createdAt.toUTCString()} (${time
        .since(invite.guild.createdAt)
        .format()})`,
    )

  if (invite.memberCount)
    embed.addField(
      'Members:',
      `<:i_online:468214881623998464> **${invite.presenceCount}** Online (${(
        (invite.presenceCount / invite.memberCount) *
        100
      ).toFixed(0)}%)\n**<:i_offline2:468215162244038687> ${
        invite.memberCount
      }** Total`,
      true,
    )

  if (invite.inviter)
    embed.addField('Inviter:', `${bot.sleet.formatUser(invite.inviter)}`)

  embed
    .addField('Created at (UTC):', created.toUTCString())
    .setFooter('Created at')
    .setTimestamp(created)

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

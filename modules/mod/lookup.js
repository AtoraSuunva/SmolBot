const {invokers} = module.exports.config = {
  name: 'lookup',
  invokers: ['lookup', 'whois', 'who is', 'who the fuck is', '?'],
  help: 'Fetches info for a user, guild, or invite',
  expandedHelp: 'Use a user id, guild id, or guild invite to fetch public info about them',
  usage: ['User', 'lookup 74768773940256768', 'Guild', 'lookup 81384788765712384', 'Invite', 'lookup discord-api']
}

const fetch = require('node-fetch')
const Discord = require('discord.js')
const path = require('path')
const time = require('./time.js')
let botTag

module.exports.events = {}
module.exports.events.message = async (bot, message) => {
  let [cmd, data] = bot.sleet.shlex(message, {invokers})

  botTag = botTag || bot.emojis.find('name', 'botTag') || '[BOT]'

  if (!data) {
    return message.channel.send('What do you want me to lookup?')
  }

  let err

  try {
    const u = await bot.fetchUser(data)
    return sendUserLookup(bot, message.channel, u)
  } catch (e) {err = e}

  try {
    const i = await bot.fetchInvite(data)
    return sendInviteLookup(bot, message.channel, i)
  } catch (e) {err = e}

  try {
    await bot.rest.methods.deleteInvite({code: data})
  } catch(e) {
    if (e.name === 'DiscordAPIError'
        && (e.code === 50013 || e.message === 'Missing Permissions')) {

      // Valid, but we are banned from the guild and cannot fetch it normally
      return message.channel.send('That invite exists, but I am banned from the guild and cannot fetch info.')
    }
  }

  try {
    const g = await fetchGuild(data)

    if (g.message) {
      return message.channel.send(g.message)
    }

    if (g.instant_invite) {
      return sendInviteLookup(message.channel, await bot.fetchInvite(g.instant_invite))
    }

    return sendGuildLookup(message.channel, g)
  } catch (e) {err = e}

  message.channel.send(`Did not find a user, invite, or guild with "\`${data}\`"...\n${err}`)
}

const widgetUrl = g => `https://canary.discordapp.com/api/guilds/${g}/widget.json`

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
    return {message: 'Guild found with id "`' + data + '`", no more information found.'}
  } else if (r.status === 200) {
    return r.body
  }
}


function sendUserLookup(bot, channel, user) {
  if ( !(user instanceof Discord.User) ) return channel.send('Did not find info for that user.')

  channel.send({embed: new Discord.RichEmbed()
    .setTitle(bot.sleet.formatUser(user, false))
    .setThumbnail(user.avatarURL)
    .setDescription(`**ID:** ${user.id}`)
    .addField('\nAccount Age:', time.since(user.createdAt).format())
    .addField('Created at (UTC):', user.createdAt.toUTCString())
    .setFooter('Created at')
    .setTimestamp(user.createdAt)
  })
}

function sendInviteLookup(bot, channel, invite) {
  const created = Discord.SnowflakeUtil.deconstruct(invite.guild.id).date
  const embed = new Discord.RichEmbed()
    .setTitle(`:incoming_envelope: Invite: ${invite.code}`)
    .addField(`Guild (${invite.guild.id}) ${invite.guild.splash ? '[Partner]' : ''}`, invite.guild.name + '\n[#' + invite.channel.name + '](http://a.ca)')

  if (invite.guild.icon)
    embed.setThumbnail(getGuildIcon(invite.guild))

  if (invite.guild.splash)
    embed.setImage(getGuildSplash(invite.guild))

  if (invite.guild.available)
    embed.addField('Created at:', `${invite.guild.createdAt.toUTCString()} (${time.since(invite.guild.createdAt).format()})`)

  if (invite.memberCount)
    embed.addField('Members:', `<:i_online:468214881623998464> **${invite.presenceCount}** Online (${(invite.presenceCount / invite.memberCount * 100).toFixed(0)}%)\n**<:i_offline2:468215162244038687> ${invite.memberCount}** Total`, true)

  if (invite.textChannelCount)
    embed.addField('Channels:', `:pencil: ${invite.textChannelCount} text\n:loud_sound: ${invite.voiceChannelCount} voice`, true)

  if (invite.inviter)
    embed.addField('Inviter:', `${bot.sleet.formatUser(invite.inviter)}`)

  embed
    .addField('Created at (UTC):', created.toUTCString())
    .setFooter('Created at')
    .setTimestamp(created)

  channel.send({embed})
}

function sendGuildLookup(channel, guild) {
  const created = Discord.SnowflakeUtil.deconstruct(guild.id).date
  const embed = new Discord.RichEmbed()
    .setTitle(`Guild: ${guild.name}`)
    .setDescription('Guild found with that id')
    .addField('Id:', guild.id)
    .addField('Channels:', guild.channels.length + ' voice', true)
    .addField('Members:', guild.members.length + ' online', true)
    .addField('Created at:', created.toUTCString())
    .setTimestamp(created)

  channel.send({embed})
}

function getGuildIcon(guild) {
  return Discord.Constants.Endpoints.Guild(guild.id).Icon(guild.client.options.http.cdn, guild.icon)
}

function getGuildSplash(guild, size = 512) {
  return Discord.Constants.Endpoints.Guild(guild.id).Splash(guild.client.options.http.cdn, guild.splash) + '?size=512'
}

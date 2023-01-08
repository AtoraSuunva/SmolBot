module.exports.config = {
  name: 'baninvites',
  invokers: ['baninvites', 'banrevoke', 'br', 'revoke'],
  help: 'Checks for invites from just banned users',
  expandedHelp:
    "Whenever someone is banned, it'll display all invites they've made (if any) with the option to revoke them.",
  invisible: true,
}

const Discord = require('discord.js')

async function fetchLogChannel(db, guild_id) {
  const res = await db.oneOrNone(
    "SELECT settings->'logChannel' AS log_channel FROM settings WHERE guild_id = $1",
    [guild_id],
  )

  return res ? res.log_channel : null
}

module.exports.events = {}
module.exports.events.message = async (bot, message) => {
  if (!message.guild) return
  if (!message.guild.me.permissions.has('MANAGE_GUILD'))
    return message.channel.send("I don't have `MANAGE_GUILD` perms.")
  if (!message.member.permissions.has('BAN_MEMBERS'))
    return message.channel.send(
      'You need to be able to ban members to revoke their invites',
    )

  let args = bot.sleet.shlex(message)

  if (args[1] === undefined)
    return message.channel.send("You need to pass a banned user's id")

  let invites = await message.guild.fetchInvites()
  let invitesToRevoke = invites.filter(i => i.inviter.id === args[1])

  if (invitesToRevoke.size === 0)
    return message.channel.send('No (cached) invites to revoke')

  let inviteStr = ''
  const inviter = invitesToRevoke.first().inviter
  const embed = new Discord.MessageEmbed()
    .setAuthor(
      `${inviter.username}#${inviter.discriminator}`,
      inviter.displayAvatarURL(),
    )
    .setColor('#f44336')
    .setTitle('Revoked Invites:')

  for (let [code, i] of invitesToRevoke) {
    inviteStr +=
      `[${code}]` +
      `[#${i.channel.name}] ` +
      `Uses: <${i.uses}/${i.maxUses === 0 ? '\u{221E}' : i.maxUses}>, ` +
      `Expires: ${
        i.expiresTimestamp - new Date().getTime() > 0
          ? shittyMStoTime(
              i.expiresTimestamp - new Date().getTime(),
              '{hh}:{mm}:{ss}',
            )
          : 'Never'
      }\n`
    await i.delete()
  }

  embed.setDescription('```md\n' + inviteStr + '\n```')

  message.channel.send({ embed })
}

module.exports.events.guildBanAdd = async (bot, guild, user) => {
  const logChannel = await fetchLogChannel(bot.sleet.db, guild.id)

  if (logChannel === null) return
  if (!guild.me.permissions.has('MANAGE_GUILD')) return

  const revokeInvites = guild.id === '120330239996854274'
  const invites = await guild.fetchInvites()
  const foundInvites = invites.filter(
    inv => inv.inviter && inv.inviter.id === user.id,
  )

  if (foundInvites.size === 0) return

  let formattedInvites = ''
  for (let [code, i] of foundInvites) {
    formattedInvites +=
      `[${code}]` +
      `[#${i.channel.name}] ` +
      `Uses: <${i.uses}/${i.maxUses === 0 ? '\u{221E}' : i.maxUses}>, ` +
      `Expires: ${
        i.expiresTimestamp - new Date().getTime() > 0
          ? shittyMStoTime(
              i.expiresTimestamp - new Date().getTime(),
              '{hh}:{mm}:{ss}',
            )
          : 'Never'
      }\n`
  }

  if (revokeInvites) {
    await Promise.all(invites.map(i => i.delete('User was banned')))
  }

  const embed = new Discord.MessageEmbed()
    .setAuthor(
      `${user.username}#${user.discriminator} (${user.id})`,
      user.displayAvatarURL(),
    )
    .setTitle('Displaying invites created by recently banned user:')
    .setDescription('```md\n' + formattedInvites + '```')
    .setFooter(
      revokeInvites
        ? 'Invites have been revoked'
        : 'Use s?revoke [user id] to revoke these invites',
    )

  guild.channels.cache.get(logChannel).send({ embed })
}

function shittyMStoTime(time, text) {
  let rep = new Map()
  rep
    .set('w', time / 604800000)
    .set('week', rep.get('w') === 1 ? 'week' : 'weeks')
    .set('d', (time %= 604800000) ? time / 86400000 : 0)
    .set('day', rep.get('d') === 1 ? 'day' : 'days')
    .set('h', (time %= 86400000) ? time / 3600000 : 0)
    .set(
      'hh',
      Math.floor(rep.get('h')) < 10
        ? `0${Math.floor(rep.get('h'))}`
        : `${Math.floor(rep.get('h'))}`,
    )
    .set('hour', rep.get('h') === 1 ? 'hour' : 'hours')
    .set('m', (time %= 3600000) ? time / 60000 : 0)
    .set(
      'mm',
      Math.floor(rep.get('m')) < 10
        ? `0${Math.floor(rep.get('m'))}`
        : `${Math.floor(rep.get('m'))}`,
    )
    .set('minute', rep.get('m') === 1 ? 'minute' : 'minutes')
    .set('s', (time %= 60000) ? time / 1000 : 0)
    .set(
      'ss',
      Math.floor(rep.get('s')) < 10
        ? `0${Math.floor(rep.get('s'))}`
        : `${Math.floor(rep.get('s'))}`,
    )
    .set('second', rep.get('s') === 1 ? 'second' : 'seconds')

  for (let [format, val] of rep)
    text = text.replace(
      new RegExp(`{${format}}`, 'g'),
      typeof val === 'number' ? Math.floor(val) : val,
    )

  return text
}

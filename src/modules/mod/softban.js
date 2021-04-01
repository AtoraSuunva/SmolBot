const invokers = ['softban', 'gently ban', 'force cache']
module.exports.config = {
  name: 'softban',
  invokers,
  help: 'Bans/unbans people to purge messages',
  expandedHelp:
    'Used to purge 1-7 days of messages by banning and unbanning someone\nPurges 7 days by default',
  usage: [
    'Softban',
    'softban [@user]',
    'Softban by id',
    'softban [user id]',
    'Softban with time and reason',
    'softban @user 14 bad posts',
  ],
}

const Discord = require('discord.js')

module.exports.events = {}
module.exports.events.message = async (bot, message) => {
  if (!message.guild) return

  if (!message.guild.me.permissions.has('BAN_MEMBERS'))
    return message.channel.send('I do not have ban permissions.')

  if (!message.member.permissions.has('BAN_MEMBERS'))
    return message.channel.send('You do not have ban permissions.')

  let [cmd, user, days = 7, ...userReason] = bot.sleet.shlex(message, {
    invokers,
  })
  userReason = userReason.join(' ')
  const reason =
    (userReason ? userReason + ' ' : '') +
    `[Softban by ${bot.sleet.formatUser(message.author)}]`

  user = (
    await bot.sleet.extractMembers(
      { from: user, source: message },
      { keepIds: true },
    )
  )[0]

  if (!user) return message.channel.send('So, who do you want to softban?')

  days = parseInt(days)

  if (Number.isNaN(days) || days < 0 || days > 7)
    return message.channel.send(
      'That is not a valid number of days to delete messages for (1-7)',
    )

  const id = user instanceof Discord.GuildMember ? user.id : user
  const member = user instanceof Discord.GuildMember ? user : null

  if (id === bot.user.id)
    return message.channel.send('I am not banning myself.')

  if (id === message.author.id)
    return message.channel.send('I am not letting you ban yourself.')

  if (
    member !== null &&
    member.roles.highest.position >= message.member.roles.highest.position
  )
    return message.channel.send(
      `${bot.sleet.formatUser(member.user.tag, {
        id: false,
      })} is higher or equal to you.`,
    )

  if (
    member !== null &&
    member.roles.highest.position >= message.guild.me.roles.highest.position
  )
    return message.channel.send(
      `${bot.sleet.formatUser(member.user.tag, {
        id: false,
      })} is higher or equal to *me*.`,
    )

  const previouslyBanned = (await message.guild.fetchBans()).get(id)

  if (previouslyBanned) {
    try {
      await message.guild.members.unban(id, { reason })
    } catch (e) {
      return message.channel.send(
        `There was an error while trying to unban that user to reban them.\n\`${e}\``,
      )
    }
  }

  message.guild.members
    .ban(id, { reason })
    .then(u =>
      previouslyBanned ? Promise.resolve(u) : message.guild.members.unban(u),
    )
    .then(async u => {
      const user =
        u instanceof Discord.GuildMember || u instanceof Discord.User
          ? u
          : await bot.users.fetch(u)
      message.channel.send(
        `I have softbanned ${bot.sleet.formatUser(user)}, clearing ${days} day${
          days === 1 ? '' : 's'
        }.`,
      )
    })
    .catch(e =>
      message.channel.send(
        `There was an error while trying to softban that user.\n\`${e}\``,
      ),
    )
}

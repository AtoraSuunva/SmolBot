module.exports.config = {
  name: 'ban',
  invokers: ['ban', 'xban', 'begone', 'omae wa mou shindeiru', 'vore', 'yeet'],
  help: 'Bans people',
  expandedHelp: 'does the bann',
  usage: ['Ban someone', 'ban [@user]', 'Ban another person', 'ban [user id]', 'Ban, but with reason', 'ban @user u suck']
}

const Discord = require('discord.js')
const logs = module.exports.logs = {
  '211956704798048256': '304464438436823043',
  '401230076265496576': '401238438239666185',
}

module.exports.events = {}
module.exports.events.message = async (bot, message) => {
  if (!message.guild) return

  if (!message.guild.me.permissions.has('BAN_MEMBERS'))
    return message.channel.send('I do not have ban permissions.')

  if (!message.member.permissions.has('BAN_MEMBERS'))
    return message.channel.send('You do not have ban permissions.')

  let [cmd, user, ...reason] = bot.sleet.shlex(message, {invokers: module.exports.config.invokers})
  reason = reason.join(' ')

  user = (await bot.sleet.extractMembers(user, message, {keepIds: true}))[0]

  if (!user)
    return message.channel.send('So, who do you want to ban?')

  const id = (user instanceof Discord.GuildMember ? user.id : user)
  const member = (user instanceof Discord.GuildMember ? user : null)

  if (id === bot.user.id)
    return message.channel.send('I am not banning myself.')

  if (id === message.author.id)
    return message.channel.send('I am not letting you ban yourself.')

  if (member !== null && member.highestRole.position >= message.member.highestRole.position)
    return message.channel.send(`${bot.sleet.formatUser(member.user.tag, {id: false})} is higher or equal to you.`)

  if (member !== null && member.highestRole.position >= message.guild.me.highestRole.position)
    return message.channel.send(`${bot.sleet.formatUser(member.user.tag, {id: false})} is higher or equal to *me*.`)

  if ((await message.guild.fetchBans()).get(id))
    return message.channel.send('That user is already banned.')

  message.guild.ban(id, {reason: (reason ? reason + ' ' : '') + `[Ban by ${bot.sleet.formatUser(message.author)}]`})
    .then(async u => {
      const user = (u instanceof Discord.GuildMember || u instanceof Discord.User) ? u : await bot.fetchUser(u)

      message.channel.send(`I have banned ${bot.sleet.formatUser(user)}.`)

      if (logs[message.guild.id] && bot.channels.get(logs[message.guild.id])) {
        const embed = new Discord.RichEmbed()
          .setAuthor(bot.sleet.formatUser(user), u.avatarURL)
          .setTitle ('Ban')
          .setDescription(`**Reason:**\n${reason || 'No reason provided.'}`)
          .setFooter(`By ${bot.sleet.formatUser(message.author)}`)
          .setTimestamp(new Date())

        bot.channels.get(logs[message.guild.id]).send({embed})
      }
    })
    .catch(e => message.channel.send('There was an error while trying to ban that user.\n`' + e + '`').then(m => bot.sleet.logger.warn(e)))
}

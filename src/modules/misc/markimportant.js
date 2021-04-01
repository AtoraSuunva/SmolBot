const markEmoji = '\u{d83d}\u{dcec}' // :mailbox_with_mail:
const markCount = 5

module.exports.config = {
  name: 'markimportant',
  invokers: ['markimportant'],
  help: 'DMs atlas important messages',
  expandedHelp: `react with ${markEmoji}`,
  invisible: true,
}

const { createEmbed } = require('../util/quote')
const whitelistGuilds = ['211956704798048256', '120330239996854274']
const alreadySent = []
const firstUsers = new Map()

module.exports.events = {}
module.exports.events.messageReactionAdd = async (bot, react, user) => {
  if (!react.message.guild) return
  if (!whitelistGuilds.includes(react.message.guild.id)) return
  if (react.emoji.name !== markEmoji) return

  if (react.count === 1 && !firstUsers.has(user.id)) {
    firstUsers.set(user.id, user)
  }

  if (react.count < markCount) return
  if (alreadySent.includes(react.message.id)) return

  alreadySent.push(react.message.id)

  const embed = createEmbed(react.message, react.message)
  user
    .send(
      'Please enter at least 69 characters on why I should DM this mesasge to atlas:',
      { embed },
    )
    .then(m => {
      const filter = m => m.content.length >= 69
      m.channel
        .awaitMessages(filter, { max: 1, time: 600000, errors: ['time'] })
        .then(async c => {
          const f = c.first()
          user.send('Alright, sent.')
          const owner = await bot.fetchUser('74768773940256768')
          owner.send(
            `${react.message.url}\n*From: ${
              f.author.tag
            }*\n>>> ${f.content.slice(0, 1000)}`,
            { embed },
          )
        })
        .catch(() => {})
    })
    .catch(() => {})

  // const owner = await bot.fetchUser('74768773940256768')
  // owner.send(react.message.url, { embed })
}

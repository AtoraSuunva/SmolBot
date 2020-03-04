// Grant roles via reactions

// :closed_lock_with_key: 🔐
const REACT_EMOJI = '\u{1f510}'
// lol regex
// const getReactRegex = () => /([\u{1f300}-\u{1f5ff}\u{1f900}-\u{1f9ff}\u{1f600}-\u{1f64f}\u{1f680}-\u{1f6ff}\u{2600}-\u{26ff}\u{2700}-\u{27bf}\u{1f1e6}-\u{1f1ff}\u{1f191}-\u{1f251}\u{1f004}\u{1f0cf}\u{1f170}-\u{1f171}\u{1f17e}-\u{1f17f}\u{1f18e}\u{3030}\u{2b50}\u{2b55}\u{2934}-\u{2935}\u{2b05}-\u{2b07}\u{2b1b}-\u{2b1c}\u{3297}\u{3299}\u{303d}\u{00a9}\u{00ae}\u{2122}\u{23f3}\u{24c2}\u{23e9}-\u{23ef}\u{25b6}\u{23f8}-\u{23fa}]|<a?:(.*?):(\d+)>)\s*(?::|for|->|=>|\||>|=|\s)\s*(.+)/ug
const getReactRegex = () => /([\u{1f300}-\u{1f5ff}\u{1f900}-\u{1f9ff}\u{1f600}-\u{1f64f}\u{1f680}-\u{1f6ff}\u{2600}-\u{26ff}\u{2700}-\u{27bf}\u{1f1e6}-\u{1f1ff}\u{1f191}-\u{1f251}\u{1f004}\u{1f0cf}\u{1f170}-\u{1f171}\u{1f17e}-\u{1f17f}\u{1f18e}\u{3030}\u{2b50}\u{2b55}\u{2934}-\u{2935}\u{2b05}-\u{2b07}\u{2b1b}-\u{2b1c}\u{3297}\u{3299}\u{303d}\u{00a9}\u{00ae}\u{2122}\u{23f3}\u{24c2}\u{23e9}-\u{23ef}\u{25b6}\u{23f8}-\u{23fa}]|<a?:(.*?):(\d+)>)\s*(?::|for|->|=>|\||>|=|\s)\s*(.+?)(\s+(?:(?::|->|=>|\||>|=)\s*(.*)?|$)|$)/ugm

const reactMessages = new Map()
const optReacts = {
  one: '1\u{20e3}', // 1️⃣
}

module.exports.config = {
  name: 'reactrole',
  invokers: ['reactrole', 'rolereact'],
  help: 'Grants roles via ractions',
  expandedHelp: `React to a message with ${REACT_EMOJI} to have it parsed & reactions added!\nUse the command for more info`
}


module.exports.events = {}
module.exports.events.message = (bot, message) => {
  message.channel.send(`
You can make any message be a "role giving" message:
  - You need Manage Roles
  - All roles to give must be under your highest role
  - Format a message like this:
    - \`[emoji] [separator] [role name/mention] <optional separator> <optional description>\`
    - \`[emoji]\`: emoji (✏️) or a discord emote (<:Bulbasaur:269682851363028994>)
    - \`[separators]\`: \`:\` \`for\` \`->\` \`=>\` \`|\` \`>\` \`=\` or just a space
    - \`[role name/mention]\`: Self-explanatory
  - Then react to it with:
    - ${optReacts.one} Only allow users to have one of the roles at a time
    - ${REACT_EMOJI} Create the react message

(For example) Select a reaction to get a role:

🔴: red
🔵 for blue
⚫ -> black
<:vermintide:662024166672826380> green
💛 => yellow
💜 | purple
💔 > dead

This message would be valid for giving out roles
`.trim())
}

module.exports.events.init = async sleet => {
  // Load stuff from db yea boi
  for (let row of await sleet.db.manyOrNone('SELECT * FROM rolereact;')) {
    reactMessages.set(row.message, row.roles)
  }
}

// Make sure we get reacts for even non-cached messages
const whitelistPackets = ['MESSAGE_REACTION_ADD', 'MESSAGE_REACTION_REMOVE', 'MESSAGE_DELETE']
module.exports.events.raw = async (bot, packet) => {
  if (!packet.d || !packet.d.guild_id || !whitelistPackets.includes(packet.t)) return

  if (packet.t === 'MESSAGE_DELETE') {
    if (reactMessages.has(packet.d.id)) {
      reactMessages.delete(packet.d.id)
      bot.sleet.db.none('DELETE FROM rolereact WHERE message = $1', [packet.d.id])
    }
    return
  }

  const channel = bot.channels.get(packet.d.channel_id)

  // Message is already cached, so it already got handled just fine
  if (!channel || channel.messages.get(packet.d.message_id)) return

  // Easiest thing to do is probably to fetch the message and then use d.js' "message reaction add" packet handler
  // which would allow me to just use the handler for d.js' actual reaction add event

  // Fetch the message so it's cached first...
  await channel.fetchMessage(packet.d.message_id)
  // Now call the event ourselves :)
  // This will call the djs handler which calls the action handler and then emits the event
  bot.ws.connection.packetManager.handle(packet)
}

module.exports.events.messageReactionAdd = async (bot, react, user) => {
  if (user.id === bot.user.id || user.bot || !react.message.guild) return

  const member = await react.message.guild.fetchMember(user)

  if (react.emoji.name === REACT_EMOJI) {
    if (!member.permissions.has('MANAGE_ROLES')) return

    // Time to parse it
    return parseMessage(bot, react.message, react, member)
  } else if (reactMessages.has(react.message.id)) {
    // do some role stuff...
    const giveInfo = reactMessages.get(react.message.id)
    const toGive = giveInfo.roles[react.emoji.id || react.emoji.name]

    if (!toGive) {
      return
    }

    if (!giveInfo.settings.single) {
      member.addRole(toGive.role)
    } else {
      // ensure only 1 role, remove other reacts
      const giverRoles = []
      for (let emoji of Object.keys(giveInfo.roles))
        giverRoles.push(giveInfo.roles[emoji].role)

      const mRoles = member.roles.filter(r => !giverRoles.includes(r.id)).array()
      mRoles.push(toGive.role)
      member.setRoles(mRoles)

      react.message.reactions.filter(r => r.emoji.name !== react.emoji.name && r.users.get(member.id)).forEach(r => r.remove(member))
    }
  }
}

// Now to remove
module.exports.events.messageReactionRemove = async (bot, react, user) => {
  if (user.id === bot.user.id || user.bot || !react.message.guild) return
  if (!reactMessages.has(react.message.id)) return

  // Remove the role if they have it
  const member = await react.message.guild.fetchMember(user)
  const giveInfo = reactMessages.get(react.message.id)
  const toGive = giveInfo.roles[react.emoji.id || react.emoji.name]

  if (toGive && member.roles.get(toGive.role)) {
    member.removeRole(toGive.role)
  }
}

async function parseMessage(bot, message, react, member) {
  const log = []

  const messageReacts = message.reactions
  const giveSettings = {single: false}
  const giveRoles = {}

  // The :one: emoji
  if (messageReacts.find(r => r.emoji.name === optReacts.one)) giveSettings.single = true

  const reg = getReactRegex()
  let m

  while (m = reg.exec(message.content)) {
    const roleInfo = {
      name: m[2] || m[1],
      emoji: m[3] || m[1],
      role: m[4].trim(),
      custom: !!m[2]
    }

    // If it's a mention, extract the id
    const roleMatch = roleInfo.role.match(/(<@&(\d+)>|.+)/)
    if (roleMatch[2]) roleInfo.role = roleMatch[2]

    // Check if this role is under the member & the bot
    const role = message.guild.roles.find(r => r.name === roleInfo.role || r.id === roleInfo.role)

    if (!role) {
      log.push(`\`${roleInfo.role}\` is not a valid role`)
    } else if (role.position >= member.highestRole.position) {
      log.push(`\`${roleInfo.role}\` is higher or equal to your highest role`)
    } else if (role.position >= message.guild.me.highestRole.position) {
      log.push(`\`${roleInfo.role}\` is higher or equal to my highest role`)
    } else if (roleInfo.custom && !message.client.emojis.get(roleInfo.emoji)) {
      log.push(`\`${roleInfo.role}\` is not assigned to an emoji I have access to!`)
    } else {
      log.push(`\`${roleInfo.role}\` was added successfully, mapped to \`${role.name}\``)
      roleInfo.role = role.id
      giveRoles[roleInfo.emoji] = roleInfo
    }
  }

  if (Object.keys(giveRoles).length > 0) {
    member.send('Role giving was (maybe mostly) successfully setup, logs:\n```js\n' + log.join('\n') + '\n```')
    reactMessages.set(message.id, {roles: giveRoles, settings: giveSettings})

    // Check if we should just update it instead
    if (await bot.sleet.db.oneOrNone('SELECT message FROM rolereact WHERE message = $1', [message.id]))
      bot.sleet.db.none('UPDATE rolereact SET roles = $2 WHERE message = $1', [message.id, reactMessages.get(message.id)])
    else
      bot.sleet.db.none('INSERT INTO rolereact (message, roles) VALUES ($1, $2)', [message.id, reactMessages.get(message.id)])

    addReactions(message, giveRoles)
  } else {
    member.send('Role giving failed completely (nothing was setup), logs:\n```js\n' + log.join('\n') + '\n```')
  }
}

async function addReactions(message, giveRoles) {
  // Remove the options the user put
  const opts = Object.values(optReacts)
  for (let r of message.reactions) {
    if (r[0] === REACT_EMOJI || opts.includes(r[0]))
      await r[1].remove(r[1].users.first())
  }

  for (let e of Object.keys(giveRoles))
    await message.react(e)
}

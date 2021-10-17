// Grant roles via reactions

// :closed_lock_with_key: 🔐
const REACT_EMOJI = '\u{1f510}'
// lol regex
// const getReactRegex = () => /([\u{1f300}-\u{1f5ff}\u{1f900}-\u{1f9ff}\u{1f600}-\u{1f64f}\u{1f680}-\u{1f6ff}\u{2600}-\u{26ff}\u{2700}-\u{27bf}\u{1f1e6}-\u{1f1ff}\u{1f191}-\u{1f251}\u{1f004}\u{1f0cf}\u{1f170}-\u{1f171}\u{1f17e}-\u{1f17f}\u{1f18e}\u{3030}\u{2b50}\u{2b55}\u{2934}-\u{2935}\u{2b05}-\u{2b07}\u{2b1b}-\u{2b1c}\u{3297}\u{3299}\u{303d}\u{00a9}\u{00ae}\u{2122}\u{23f3}\u{24c2}\u{23e9}-\u{23ef}\u{25b6}\u{23f8}-\u{23fa}]|<a?:(.*?):(\d+)>)\s*(?::|for|->|=>|\||>|=|\s)\s*(.+)/ug
const getReactRegex = () =>
  /([\u{1f300}-\u{1f5ff}\u{1f900}-\u{1f9ff}\u{1f600}-\u{1f64f}\u{1f680}-\u{1f6ff}\u{2600}-\u{26ff}\u{2700}-\u{27bf}\u{1f1e6}-\u{1f1ff}\u{1f191}-\u{1f251}\u{1f004}\u{1f0cf}\u{1f170}-\u{1f171}\u{1f17e}-\u{1f17f}\u{1f18e}\u{3030}\u{2b50}\u{2b55}\u{2934}-\u{2935}\u{2b05}-\u{2b07}\u{2b1b}-\u{2b1c}\u{3297}\u{3299}\u{303d}\u{00a9}\u{00ae}\u{2122}\u{23f3}\u{24c2}\u{23e9}-\u{23ef}\u{25b6}\u{23f8}-\u{23fa}]|<a?:(.*?):(\d+)>)\s*(?::|for|->|=>|\||>|=|\s)\s*(.+?)(\s+(?:(?::|->|=>|\||>|=)\s*(.*)?|$)|$)/gmu

const reactMessages = new Map()
const optReacts = {
  one: '\u{31}\u{fe0f}\u{20e3}', // :one:
  x: '\u{274c}', // :x:
}

module.exports.config = {
  name: 'reactrole',
  invokers: ['reactrole', 'rolereact'],
  help: 'Grants roles via ractions',
  expandedHelp: `React to a message with ${REACT_EMOJI} to have it parsed & reactions added!\nUse the command for more info`,
}

module.exports.events = {}
module.exports.events.message = (bot, message) => {
  message.channel.send(
    `
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
    - ${optReacts.x} Allow users to clear their role using an ${optReacts.x} react
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
`.trim(),
  )
}

module.exports.events.init = async sleet => {
  // Load stuff from db yea boi
  for (let row of await sleet.db.manyOrNone('SELECT * FROM rolereact;')) {
    row.canClear = row.canclear
    delete row.canclear
    reactMessages.set(row.message, row)
  }
}

// Make sure we get reacts for even non-cached messages
const whitelistPackets = [
  'MESSAGE_REACTION_ADD',
  'MESSAGE_REACTION_REMOVE',
  'MESSAGE_DELETE',
]
module.exports.events.raw = async (bot, packet) => {
  if (!packet.d || !packet.d.guild_id || !whitelistPackets.includes(packet.t))
    return

  if (packet.t === 'MESSAGE_DELETE') {
    if (reactMessages.has(packet.d.id)) {
      reactMessages.delete(packet.d.id)
      bot.sleet.db.none('DELETE FROM rolereact WHERE message = $1', [
        packet.d.id,
      ])
    }
    return
  }

  const channel = bot.channels.cache.get(packet.d.channel_id)

  // no channel, just give up
  if (!channel) return

  const messageCached = channel.messages.cache.get(packet.d.message_id)
  const memberCached = channel.guild.members.cache.get(packet.d.user_id)

  // Assume it was cached and fired correctly
  if (messageCached && memberCached) return

  // Easiest thing to do is probably to fetch the message/member and then use d.js' "message reaction add" packet handler
  // which would allow me to just use the handler for d.js' actual reaction add event

  try {
    if (!messageCached) await channel.messages.fetch(packet.d.message_id)
    if (!memberCached) await channel.guild.members.fetch(packet.d.user_id)
  } catch {
    // Possibly deleted or member left, give up
  }

  // This will call the djs handler which calls the action handler and then emits the event
  if (packet.t === 'MESSAGE_REACTION_ADD') {
    bot.actions.MessageReactionAdd.handle(packet)
  } else if (packet.t === 'MESSAGE_REACTION_REMOVE') {
    bot.actions.MessageReactionRemove.handle(packet)
  }
}

module.exports.events.messageReactionAdd = async (bot, react, user) => {
  if (user.id === bot.user.id || user.bot || !react.message.guild) return

  const member = await react.message.guild.members.fetch(user)

  if (react.emoji.name === REACT_EMOJI) {
    if (!member.permissions.has('MANAGE_ROLES')) return

    // Time to parse it
    return parseMessage(bot, react.message, react, member)
  } else if (reactMessages.has(react.message.id)) {

    if (member.roles.cache.has('122150407806910464')) {
      return react.users.remove(member)
    }

    // do some role stuff...
    const { roles, single, canClear } = reactMessages.get(react.message.id)

    if (canClear && react.emoji.name === optReacts.x) {
      const giverRoles = Object.keys(roles).map(r => roles[r].role)
      const keepRoles = member.roles.cache
        .filter(r => !giverRoles.includes(r.id))
        .array()
      member.roles.set(keepRoles)
      react.message.reactions.cache
        .filter(r => r.users.cache.get(member.id))
        .forEach(r => r.users.remove(member))
      return
    }

    const toGive = roles[react.emoji.id || react.emoji.name]

    if (!toGive) {
      return
    }

    if (!single) {
      member.roles.add(toGive.role)
    } else {
      // ensure only 1 role, remove other reacts
      const giverRoles = Object.keys(roles).map(r => roles[r].role)

      // other react roles the member already has
      const rEntries = Object.entries(roles)
      const otherRoles = member.roles.cache
        .filter(r => giverRoles.includes(r.id) && r.id !== toGive.role)
        .array()
        .map(r => {
          const v = rEntries.find(e => e[1].role === r.id)
          if (v) return v[0]
        })
        .filter(v => !!v)

      const keepRoles = member.roles.cache
        .filter(r => !giverRoles.includes(r.id))
        .array()
      keepRoles.push(toGive.role)
      member.roles.set(keepRoles)

      react.message.reactions.cache
        .filter(
          r =>
            (r.emoji.name !== react.emoji.name &&
              r.users.cache.get(member.id)) ||
            otherRoles.includes(r.id),
        )
        .forEach(r => r.users.remove(member))
    }
  }
}

// Now to remove
module.exports.events.messageReactionRemove = async (bot, react, user) => {
  if (user.id === bot.user.id || user.bot || !react.message.guild) return
  if (!reactMessages.has(react.message.id)) return

  // Remove the role if they have it
  const member = await react.message.guild.members.fetch(user)
  const { roles } = reactMessages.get(react.message.id)
  const toGive = roles[react.emoji.id || react.emoji.name]

  if (toGive && member.roles.cache.get(toGive.role)) {
    member.roles.remove(toGive.role)
  }
}

async function parseMessage(bot, message, react, member) {
  const log = []

  const messageReacts = message.reactions.cache
  const giveSettings = { single: false, canClear: false }
  const giveRoles = {}

  // The :one: emoji
  if (messageReacts.find(r => r.emoji.name === optReacts.one))
    giveSettings.single = true
  if (messageReacts.find(r => r.emoji.name === optReacts.x))
    giveSettings.canClear = true

  const reg = getReactRegex()
  let m

  while ((m = reg.exec(message.content))) {
    const roleInfo = {
      name: m[2] || m[1],
      emoji: m[3] || m[1],
      role: m[4].trim(),
      custom: !!m[2],
    }

    // If it's a mention, extract the id
    const roleMatch = roleInfo.role.match(/(<@&(\d+)>|.+)/)
    if (roleMatch[2]) roleInfo.role = roleMatch[2]

    // Check if this role is under the member & the bot
    const role = message.guild.roles.cache.find(
      r => r.name === roleInfo.role || r.id === roleInfo.role,
    )

    if (!role) {
      log.push(`\`${roleInfo.role}\` is not a valid role`)
    } else if (role.position >= member.roles.highest.position) {
      log.push(`\`${roleInfo.role}\` is higher or equal to your highest role`)
    } else if (role.position >= message.guild.me.roles.highest.position) {
      log.push(`\`${roleInfo.role}\` is higher or equal to my highest role`)
    } else if (roleInfo.custom && !message.client.emojis.cache.get(roleInfo.emoji)) {
      log.push(
        `\`${roleInfo.role}\` is not assigned to an emoji I have access to!`,
      )
    } else {
      log.push(
        `\`${roleInfo.role}\` was added successfully, mapped to \`${role.name}\``,
      )
      roleInfo.role = role.id
      giveRoles[roleInfo.emoji] = roleInfo
    }
  }

  log.push(`\nSettings: \`${JSON.stringify(giveSettings)}\``)

  if (Object.keys(giveRoles).length > 0) {

    if (!message.channel.permissionsFor(bot.user).has('ADD_REACTIONS')) {
      return member.send('I am missing "Add Reactions" permissions to setup the reaction roles.')
    }

    member.send(
      'Role giving was (maybe mostly) successfully setup, logs:\n```js\n' +
        log.join('\n') +
        '\n```',
    )
    reactMessages.set(message.id, { roles: giveRoles, ...giveSettings })

    // Check if we should just update it instead
    if (
      await bot.sleet.db.oneOrNone(
        'SELECT message FROM rolereact WHERE message = $1',
        [message.id],
      )
    )
      bot.sleet.db.none(
        'UPDATE rolereact SET roles = $2, single = $3, canClear = $4 WHERE message = $1',
        [message.id, giveRoles, giveSettings.single, giveSettings.canClear],
      )
    else
      bot.sleet.db.none(
        'INSERT INTO rolereact (message, roles, single, canClear) VALUES ($1, $2, $3, $4)',
        [message.id, giveRoles, giveSettings.single, giveSettings.canClear],
      )

    addReactions(message, giveRoles, giveSettings)
  } else {
    member.send(
      'Role giving failed completely (nothing was setup), logs:\n```js\n' +
        log.join('\n') +
        '\n```',
    )
  }
}

async function addReactions(message, giveRoles, giveSettings) {
  // Remove the options the user put
  await message.reactions.removeAll()
  for (let e of Object.keys(giveRoles)) await message.react(e)
  if (giveSettings.canClear) await message.react(optReacts.x)
}

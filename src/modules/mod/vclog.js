module.exports.config = {
  name: 'vclog',
  invokers: [],
  help: 'Log join/leaves in voice channels',
  expandedHelp: 'It logs things',
  invisible: true,
}

module.exports.events = {}
module.exports.events.init = handleInit
module.exports.events.voiceStateUpdate = handleVoiceStateUpdate

/** @typedef {import("discord.js/src/client/Client")} Client */
/** @typedef {import("discord.js/src/structures/VoiceState")} VoiceState */
/** @typedef {import("discord.js/src/structures/Webhook")} Webhook */

/**
 * @typedef {Object} WebhookDef
 * @property {string} guildID
 * @property {string} webhookID
 */

/**
 * @type {Array<WebhookDef>}
 */
const webhookDefs = [
  {
    guildID: '211956704798048256',
    webhookID: '923336688711913522',
  },
  {
    guildID: '120330239996854274',
    webhookID: '923355553894395914',
  },
]

/**
 * Map<guildID, webhook>
 * @type {Map<string, Webhook>}
 */
const webhooks = new Map()

/**
 * @param {*} sleet
 * @param {Client} bot
 */
function handleInit(sleet, bot) {
  for (const def of webhookDefs) {
    bot.fetchWebhook(def.webhookID).then(webhook => {
      webhooks.set(def.guildID, webhook)
    })
  }
}

/**
 * @param {Client} bot
 * @param {VoiceState} oldState
 * @param {VoiceState} newState
 */
function handleVoiceStateUpdate(bot, oldState, newState) {
  const webhook = webhooks.get(newState.guild.id)
  if (!webhook) return

  if (!oldState.channelID && newState.channelID) {
    return sendLog(
      webhook,
      '📥',
      'Join',
      `${bot.sleet.formatUser(oldState.member)} ${oldState.member} joined ${
        newState.channel
      }`,
    )
  }

  if (oldState.channelID && !newState.channelID) {
    return sendLog(
      webhook,
      '📤',
      'Left',
      `${bot.sleet.formatUser(oldState.member)} ${oldState.member} left ${
        oldState.channel
      }`,
    )
  }

  if (oldState.channelID !== newState.channelID) {
    return sendLog(
      webhook,
      '⏩',
      'Move',
      `${bot.sleet.formatUser(oldState.member)} ${oldState.member} moved ${
        oldState.channel
      } => ${newState.channel}`,
    )
  }

  if (!oldState.streaming && newState.streaming) {
    return sendLog(
      webhook,
      '🔴',
      'Live',
      `${bot.sleet.formatUser(oldState.member)} ${
        oldState.member
      } started streaming in ${oldState.channel}`,
    )
  }

  if (oldState.streaming && !newState.streaming) {
    return sendLog(
      webhook,
      '⏹️',
      'Dead',
      `${bot.sleet.formatUser(oldState.member)} ${
        oldState.member
      } stopped streaming in ${oldState.channel}`,
    )
  }

  if (!oldState.selfVideo && newState.selfVideo) {
    return sendLog(
      webhook,
      '📱',
      'YCam',
      `${bot.sleet.formatUser(oldState.member)} ${
        oldState.member
      } started their camera in ${oldState.channel}`,
    )
  }

  if (oldState.selfVideo && !newState.selfVideo) {
    return sendLog(
      webhook,
      '📵',
      'XCam',
      `${bot.sleet.formatUser(oldState.member)} ${
        oldState.member
      } stopped their camera in ${oldState.channel}`,
    )
  }

  if (!oldState.serverDeaf && newState.serverDeaf) {
    return sendLog(
      webhook,
      '🙉',
      'Deaf',
      `${bot.sleet.formatUser(oldState.member)} ${
        oldState.member
      } was server deafened in ${oldState.channel}`,
    )
  }

  if (oldState.serverDeaf && !newState.serverDeaf) {
    return sendLog(
      webhook,
      '🔊',
      'Hear',
      `${bot.sleet.formatUser(oldState.member)} ${
        oldState.member
      } stopped being server deafened in ${oldState.channel}`,
    )
  }

  if (!oldState.serverMute && newState.serverMute) {
    return sendLog(
      webhook,
      '🙊',
      'Mute',
      `${bot.sleet.formatUser(oldState.member)} ${
        oldState.member
      } was server muted in ${oldState.channel}`,
    )
  }

  if (oldState.serverMute && !newState.serverMute) {
    return sendLog(
      webhook,
      '🎙️',
      'Talk',
      `${bot.sleet.formatUser(oldState.member)} ${
        oldState.member
      } stopped being server muted in ${oldState.channel}`,
    )
  }
}

function sendLog(
  webhook,
  emoji,
  type,
  message,
  { embed = null, timestamp = new Date(), ...rest } = {},
) {
  const d = timestamp instanceof Date ? timestamp : new Date(timestamp)
  const time = padExpressions`${d.getUTCHours()}:${d.getUTCMinutes()}:${d.getUTCSeconds()}`
  const msg = `${emoji} \`[${time}]\` \`[${type}]\`: ${message}`
  const allowedMentions = {
    parse: [],
  }

  return webhook.send(msg, { embed, allowedMentions, ...rest })
}

/** Pads the expressions in tagged template literals */
function padExpressions(str, ...args) {
  return str
    .map(
      (v, i) =>
        v + (args[i] !== undefined ? (args[i] + '').padStart(2, 0) : ''),
    )
    .join('')
}

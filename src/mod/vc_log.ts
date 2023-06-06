import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
  Constants,
  GuildTextBasedChannel,
  VoiceState,
} from 'discord.js'
import {
  formatUser,
  getGuild,
  getTextBasedChannel,
  SleetSlashCommand,
  SleetSlashSubcommand,
} from 'sleetcord'
import { prisma } from '../util/db.js'

const config = new SleetSlashSubcommand(
  {
    name: 'config',
    description: 'Configure VC logging',
    options: [
      {
        name: 'channel',
        description: 'The channel to log to',
        type: ApplicationCommandOptionType.Channel,
        required: true,
        channel_types: Constants.GuildTextBasedChannelTypes,
      },
    ],
  },
  {
    run: runVCLogConfig,
  },
)

const disable = new SleetSlashSubcommand(
  {
    name: 'disable',
    description: 'Disable VC logging',
  },
  {
    run: runDisableVClog,
  },
)

export const vc_log = new SleetSlashCommand(
  {
    name: 'vc_log',
    description: 'Manage VC logging',
    dm_permission: false,
    default_member_permissions: ['ManageGuild'],
    options: [config, disable],
  },
  {
    voiceStateUpdate: handleVoiceStateUpdate,
  },
)

async function runVCLogConfig(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)
  const channel = await getTextBasedChannel(interaction, 'channel', true)
  const guildID = guild.id

  await prisma.voiceLogConfig.upsert({
    where: {
      guildID,
    },
    update: {
      channelID: channel.id,
    },
    create: {
      guildID,
      channelID: channel.id,
    },
  })

  await interaction.reply({
    content: 'VC logging configured',
    ephemeral: true,
  })
}

async function runDisableVClog(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)
  const guildID = guild.id
  await prisma.voiceLogConfig.delete({
    where: {
      guildID,
    },
  })

  await interaction.reply({
    content: 'VC logging disabled',
    ephemeral: true,
  })
}

async function handleVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState,
) {
  const vcConfig = await prisma.voiceLogConfig.findUnique({
    where: {
      guildID: oldState.guild.id,
    },
  })

  if (!vcConfig) return
  if (!oldState.member) return

  const channel = oldState.guild.channels.cache.get(vcConfig.channelID)
  if (!channel?.isTextBased()) return

  if (!oldState.channelId && newState.channelId) {
    return sendLog(
      channel,
      '📥',
      'Join',
      `${formatUser(oldState.member)} joined ${String(newState.channel)}`,
    )
  }

  if (oldState.channelId && !newState.channelId) {
    return sendLog(
      channel,
      '📤',
      'Left',
      `${formatUser(oldState.member)} left ${String(oldState.channel)}`,
    )
  }

  if (oldState.channelId !== newState.channelId) {
    return sendLog(
      channel,
      '⏩',
      'Move',
      `${formatUser(oldState.member)} moved ${String(
        oldState.channel,
      )} => ${String(newState.channel)}`,
    )
  }

  if (!oldState.streaming && newState.streaming) {
    return sendLog(
      channel,
      '🔴',
      'Live',
      `${formatUser(oldState.member)} started streaming in ${String(
        oldState.channel,
      )}`,
    )
  }

  if (oldState.streaming && !newState.streaming) {
    return sendLog(
      channel,
      '⏹️',
      'Dead',
      `${formatUser(oldState.member)} stopped streaming in ${String(
        oldState.channel,
      )}`,
    )
  }

  if (!oldState.selfVideo && newState.selfVideo) {
    return sendLog(
      channel,
      '📱',
      'YCam',
      `${formatUser(oldState.member)} started their camera in ${String(
        oldState.channel,
      )}`,
    )
  }

  if (oldState.selfVideo && !newState.selfVideo) {
    return sendLog(
      channel,
      '📵',
      'XCam',
      `${formatUser(oldState.member)} stopped their camera in ${String(
        oldState.channel,
      )}`,
    )
  }

  if (!oldState.serverDeaf && newState.serverDeaf) {
    return sendLog(
      channel,
      '🙉',
      'Deaf',
      `${formatUser(oldState.member)} was server deafened in ${String(
        oldState.channel,
      )}`,
    )
  }

  if (oldState.serverDeaf && !newState.serverDeaf) {
    return sendLog(
      channel,
      '🔊',
      'Hear',
      `${formatUser(oldState.member)} stopped being server deafened in ${String(
        oldState.channel,
      )}`,
    )
  }

  if (!oldState.serverMute && newState.serverMute) {
    return sendLog(
      channel,
      '🙊',
      'Mute',
      `${formatUser(oldState.member)} was server muted in ${String(
        oldState.channel,
      )}`,
    )
  }

  if (oldState.serverMute && !newState.serverMute) {
    return sendLog(
      channel,
      '🎙️',
      'Talk',
      `${formatUser(oldState.member)} stopped being server muted in ${String(
        oldState.channel,
      )}`,
    )
  }

  return
}

function sendLog(
  channel: GuildTextBasedChannel,
  emoji: string,
  type: string,
  message: string,
  { timestamp = new Date() } = {},
) {
  const d = timestamp instanceof Date ? timestamp : new Date(timestamp)
  const time = padExpressions`${d.getUTCHours()}:${d.getUTCMinutes()}:${d.getUTCSeconds()}`
  const content = `${emoji} \`[${time}]\` \`[${type}]\`: ${message}`
  const allowedMentions = {
    parse: [],
  }

  return channel.send({ content, allowedMentions })
}

/** Pads the expressions in tagged template literals */
function padExpressions(str: TemplateStringsArray, ...args: unknown[]) {
  return str
    .map(
      (v, i) =>
        v + (args[i] !== undefined ? String(args[i]).padStart(2, '0') : ''),
    )
    .join('')
}

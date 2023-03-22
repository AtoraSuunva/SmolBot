import { ReportConfig } from '@prisma/client'
import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
  Guild,
  GuildTextBasedChannel,
  User,
} from 'discord.js'
import { getGuild, SleetSlashSubcommand } from 'sleetcord'
import { TextChannelTypes } from '../../../util/constants.js'
import { prisma } from '../../../util/db.js'
import { formatConfig } from '../../../util/format.js'
import { handleReportButtonInteraction } from '../utils.js'

export const report_config = new SleetSlashSubcommand(
  {
    name: 'config',
    description: 'Configure the report system',
    options: [
      {
        name: 'enabled',
        description: 'Enable or disable the report system',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'channel',
        description: 'The channel to send reports to',
        type: ApplicationCommandOptionType.Channel,
        channel_types: TextChannelTypes,
      },
      {
        name: 'message',
        description:
          'The message to send when a report is made. Use "none" for no message. (default: "Report Received")',
        type: ApplicationCommandOptionType.String,
      },
    ],
  },
  {
    run: runReportConfig,
    interactionCreate: handleReportButtonInteraction,
  },
)

async function runReportConfig(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)

  const enabled = interaction.options.getBoolean('enabled')
  const channel = interaction.options.getChannel('channel')
  const messageArg = interaction.options.getString('message')
  const message = messageArg?.toLowerCase() === 'none' ? '' : messageArg

  const currentConfig = await prisma.reportConfig.findUnique({
    where: {
      guildID: guild.id,
    },
  })

  const newConfig = await prisma.reportConfig.upsert({
    where: {
      guildID: guild.id,
    },
    update: {
      enabled: enabled ?? currentConfig?.enabled ?? false,
      channelID: channel?.id ?? currentConfig?.channelID ?? null,
      message: message ?? currentConfig?.message ?? '',
    },
    create: {
      guildID: guild.id,
      enabled: enabled ?? true,
      channelID: channel?.id ?? null,
      message: message ?? '',
    },
  })

  const warnings: string[] = []

  if (!newConfig.enabled) {
    warnings.push('The report system is currently disabled.')
  }

  if (!newConfig.channelID) {
    warnings.push(
      'The report channel has not been set. You will not receive any reports.',
    )
  }

  const warningsMessage = warnings.length > 0 ? `\n${warnings.join('\n')}` : ''

  await interaction.reply({
    content: `Report config updated.\n${formatConfig(
      guild,
      newConfig,
    )}${warningsMessage}`,
    allowedMentions: { parse: [] },
  })
}

export interface ReportConfigResolved {
  config: ReportConfig
  reportChannel: GuildTextBasedChannel
}

export async function fetchConfig(
  guild: Guild,
  user: User,
): Promise<ReportConfigResolved> {
  const config = await prisma.reportConfig.findUnique({
    where: {
      guildID: guild.id,
    },
  })

  if (!config) {
    throw new Error('The report system has not been configured for this guild.')
  }

  if (!config.enabled) {
    throw new Error('The report system is disabled for this guild.')
  }

  if (!config.channelID) {
    throw new Error(
      'The report channel has not been set. You should let the staff team know.',
    )
  }

  const reportChannel = await guild.channels.fetch(config.channelID)

  if (!reportChannel) {
    throw new Error(
      'The report channel has been deleted or is not accessible. You should let the staff team know.',
    )
  }

  if (!reportChannel.isTextBased()) {
    throw new Error(
      'The report channel is not a text channel. You should let the staff team know.',
    )
  }

  const reportBlock = await prisma.reportBan.findUnique({
    where: {
      guildID_userID: {
        guildID: guild.id,
        userID: user.id,
      },
    },
  })

  if (reportBlock) {
    throw new Error(
      'You have been blocked from using the report system in this guild.',
    )
  }

  return {
    config,
    reportChannel,
  }
}

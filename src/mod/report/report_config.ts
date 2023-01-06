import { ReportConfig } from '@prisma/client'
import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
  Guild,
  GuildTextBasedChannel,
} from 'discord.js'
import { getGuild, SleetSlashCommand } from 'sleetcord'
import { TextChannelTypes } from '../../util/constants.js'
import { prisma } from '../../util/db.js'

export const report_config = new SleetSlashCommand(
  {
    name: 'report_config',
    description: 'Configure the report system',
    dm_permission: false,
    default_member_permissions: ['ManageGuild'],
    options: [
      {
        name: 'channel',
        description: 'Set the channel to send reports to',
        type: ApplicationCommandOptionType.Channel,
        required: true,
        channel_types: TextChannelTypes,
      },
      {
        name: 'message',
        description:
          'Set the message to send when a report is made (default: "Report Received")',
        type: ApplicationCommandOptionType.String,
      },
    ],
  },
  {
    run: runReportConfig,
  },
)

async function runReportConfig(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)

  const channel = interaction.options.getChannel('channel', true)
  const message = interaction.options.getString('message')

  const currentConfig = await prisma.reportConfig.findUnique({
    where: {
      guildID: guild.id,
    },
  })

  await prisma.reportConfig.upsert({
    where: {
      guildID: guild.id,
    },
    update: {
      channelID: channel.id,
      message: message ?? currentConfig?.message ?? 'Report Received',
    },
    create: {
      guildID: guild.id,
      channelID: channel.id,
      message: message ?? 'Report Received',
    },
  })

  await interaction.reply({
    content: `Report channel set to ${channel} and message set to '${message}'`,
    allowedMentions: { parse: [] },
    ephemeral: true,
  })
}

export interface ReportConfigResolved {
  config: ReportConfig
  reportChannel: GuildTextBasedChannel
}

export async function fetchConfig(guild: Guild): Promise<ReportConfigResolved> {
  const config = await prisma.reportConfig.findUnique({
    where: {
      guildID: guild.id,
    },
  })

  if (!config) {
    throw new Error('The report system has not been configured for this guild.')
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

  return {
    config,
    reportChannel,
  }
}

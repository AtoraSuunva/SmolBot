import { WarningConfig } from '@prisma/client'
import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
} from 'discord.js'
import { getGuild, SleetSlashSubcommand } from 'sleetcord'
import { TextChannelTypes } from '../../../util/constants.js'
import { prisma } from '../../../util/db.js'
import { formatConfig } from '../../../util/format.js'
import { markWarningArchiveDirty } from '../utils.js'

export const warningsConfigEdit = new SleetSlashSubcommand(
  {
    name: 'edit',
    description: 'Configure the warnings system',
    options: [
      {
        name: 'expires_after',
        description:
          'Set the time (in days) after which a warning expires. 0 to disable. (default: 0)',
        type: ApplicationCommandOptionType.Integer,
        min_value: 0,
      },
      {
        name: 'archive_enabled',
        description:
          'Enable or disable warning archiving, you also need to set the archive_channel (default: false)',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'archive_channel',
        description:
          'Set the channel where warnings will be archived as a csv file, if enabled (default: none)',
        type: ApplicationCommandOptionType.Channel,
        channel_types: TextChannelTypes,
      },
    ],
  },
  {
    run: runWarningsConfigEdit,
  },
)

async function runWarningsConfigEdit(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)
  const { options } = interaction

  const expiresAfter = options.getInteger('expires_after')
  const archiveEnabled = options.getBoolean('archive_enabled')
  const archiveChannel = options.getChannel('archive_channel')

  const oldConfig = await prisma.warningConfig.findUnique({
    where: {
      guildID: guild.id,
    },
  })

  const mergedConfig: Omit<WarningConfig, 'updatedAt'> = {
    guildID: guild.id,
    expiresAfter: expiresAfter ?? oldConfig?.expiresAfter ?? 0,
    archiveEnabled: archiveEnabled ?? oldConfig?.archiveEnabled ?? false,
    archiveChannel: archiveChannel?.id ?? oldConfig?.archiveChannel ?? null,
  }

  await prisma.warningConfig.upsert({
    where: {
      guildID: guild.id,
    },
    update: mergedConfig,
    create: mergedConfig,
  })

  if (oldConfig && !oldConfig.archiveEnabled && archiveEnabled) {
    markWarningArchiveDirty(guild.id, true)
  }

  const warning =
    mergedConfig.archiveEnabled && mergedConfig.archiveChannel === null
      ? '⚠️ You enabled archiving, but did not specify an archive channel. Warnings will NOT be archived!!!\n'
      : ''

  await interaction.reply({
    content: `New configuration:\n${warning}${formatConfig(
      guild,
      mergedConfig,
    )}`,
  })
}

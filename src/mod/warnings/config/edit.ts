import { WarningConfig } from '@prisma/client'
import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
} from 'discord.js'
import { getGuild, SleetSlashSubcommand } from 'sleetcord'
import { prisma } from '../../../util/db.js'
import { formatConfig } from '../../../util/format.js'

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
    ],
  },
  {
    run: runWarningsConfigEdit,
  },
)

export function getDefaultWarningConfig(): Omit<
  WarningConfig,
  'guildID' | 'updatedAt'
> {
  return {
    expiresAfter: 0,
  }
}

async function runWarningsConfigEdit(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)
  const { options } = interaction

  const expiresAfter = options.getInteger('expires_after', true)

  const oldConfig = await prisma.warningConfig.findUnique({
    where: {
      guildID: guild.id,
    },
  })

  const mergedConfig: Omit<WarningConfig, 'updatedAt'> = {
    ...getDefaultWarningConfig(),
    guildID: guild.id,
    expiresAfter: expiresAfter ?? oldConfig?.expiresAfter,
  }

  await prisma.warningConfig.upsert({
    where: {
      guildID: guild.id,
    },
    update: mergedConfig,
    create: mergedConfig,
  })

  await interaction.reply({
    content: `New configuration:\n${formatConfig(guild, mergedConfig)}`,
  })
}

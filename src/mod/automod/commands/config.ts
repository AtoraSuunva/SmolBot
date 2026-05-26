import { ApplicationCommandOptionType, type ChatInputCommandInteraction } from 'discord.js'
import { inGuildGuard, SleetSlashSubcommand } from 'sleetcord'

import { Prisma } from '../../../generated/prisma/client.js'
import type { AutomodConfigCreateInput } from '../../../generated/prisma/models.js'
import { prisma } from '../../../helpers/db.js'
import { formatConfig } from '../../../helpers/format.js'

export const automod_config = new SleetSlashSubcommand(
  {
    name: 'config',
    description: "View and manage your automod's configuration",
    options: [
      {
        name: 'prepend',
        description:
          'Message to prepend automod messages with (e.g. a staff ping) (use "-" to remove, default: "-")',
        type: ApplicationCommandOptionType.String,
      },
      {
        name: 'ignore_channels',
        description:
          'Channels that automod should ignore (comma-separated channel IDs, use "-" to remove, default: none)',
        type: ApplicationCommandOptionType.String,
      },
      {
        name: 'ignore_roles',
        description:
          'Roles that automod should ignore (comma-separated role IDs, use "-" to remove, default: none)',
        type: ApplicationCommandOptionType.String,
      },
      {
        name: 'ignore_users',
        description:
          'Users that automod should ignore (comma-separated user IDs, use "-" to remove, default: none)',
        type: ApplicationCommandOptionType.String,
      },
      {
        name: 'ignore_bots',
        description: 'Whether automod should ignore bots (default: true)',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'ignore_admins',
        description:
          'Whether automod should ignore users with Administrator permissions (default: true)',
        type: ApplicationCommandOptionType.Boolean,
      },
    ],
  },
  {
    run: handleConfigRun,
  },
)

async function handleConfigRun(interaction: ChatInputCommandInteraction) {
  inGuildGuard(interaction)
  await interaction.deferReply()

  const guild = await interaction.client.guilds.fetch(interaction.guildId)

  const prepend = interaction.options.getString('prepend')
  const ignoreChannels = interaction.options.getString('ignore_channels')
  const ignoreRoles = interaction.options.getString('ignore_roles')
  const ignoreUsers = interaction.options.getString('ignore_users')
  const ignoreBots = interaction.options.getBoolean('ignore_bots')
  const ignoreAdmins = interaction.options.getBoolean('ignore_admins')

  const oldConfig = await prisma.automodConfig.findUnique({
    where: {
      guildID: guild.id,
    },
  })

  const configCreate: AutomodConfigCreateInput = {
    guildID: guild.id,
    prepend: prepend === '-' ? null : (prepend ?? oldConfig?.prepend ?? Prisma.skip),
    ignoredChannels:
      ignoreChannels === '-'
        ? []
        : ignoreChannels
          ? ignoreChannels.split(',').map((id) => id.trim())
          : (oldConfig?.ignoredChannels ?? Prisma.skip),
    ignoredRoles:
      ignoreRoles === '-'
        ? []
        : ignoreRoles
          ? ignoreRoles.split(',').map((id) => id.trim())
          : (oldConfig?.ignoredRoles ?? Prisma.skip),
    ignoredUsers:
      ignoreUsers === '-'
        ? []
        : ignoreUsers
          ? ignoreUsers.split(',').map((id) => id.trim())
          : (oldConfig?.ignoredUsers ?? Prisma.skip),
    ignoreBots: ignoreBots !== null ? ignoreBots : (oldConfig?.ignoreBots ?? Prisma.skip),
    ignoreAdmins: ignoreAdmins !== null ? ignoreAdmins : (oldConfig?.ignoreAdmins ?? Prisma.skip),
  }

  const newConfig = await prisma.automodConfig.upsert({
    where: {
      guildID: guild.id,
    },
    create: configCreate,
    update: configCreate,
  })

  const formattedConfig = formatConfig({
    guild,
    config: newConfig,
    oldConfig,
  })

  await interaction.editReply({
    content: `Automod configuration updated successfully!\n${formattedConfig}`,
  })
}

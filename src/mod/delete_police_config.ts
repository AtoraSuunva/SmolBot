import { DeletePoliceConfig } from '@prisma/client'
import {
  ApplicationCommandOptionType,
  InteractionContextType,
} from 'discord-api-types/v10'
import {
  ChatInputCommandInteraction,
  Message,
  PartialMessage,
} from 'discord.js'
import { SleetSlashCommand, getGuild } from 'sleetcord'
import { getOptionCount } from 'sleetcord-common'
import { prisma } from '../util/db.js'
import { formatConfig } from '../util/format.js'
import { quoteMessage } from '../util/quoteMessage.js'

export const delete_police_config = new SleetSlashCommand(
  {
    name: 'delete_police_config',
    description:
      'Automatically repost messages that have been deleted too quickly',
    contexts: [InteractionContextType.Guild],
    default_member_permissions: ['ManageGuild'],
    options: [
      {
        name: 'enabled',
        description:
          'Whether to enable or disable quick delete (default: false)',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'threshold',
        description:
          'Messages deleted faster than this many seconds will be reposted (default: 5)',
        type: ApplicationCommandOptionType.Integer,
        min_value: 1,
      },
      {
        name: 'fuzziness',
        description:
          'Randomly add 0-fuzziness extra time to make it harder to guess the threshold (default: 0)',
        type: ApplicationCommandOptionType.Integer,
        min_value: 0,
      },
      {
        name: 'ignore_bots',
        description: 'Whether to ignore messages from bots (default: true)',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'ignore_mods',
        description:
          'Whether to ignore messages from mods (anyone with "Manage Messages") (default: true)',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'footer_message',
        description:
          'The message to put in the footer of reposted messages (default: none)',
        type: ApplicationCommandOptionType.String,
        max_length: 2000,
      },
    ],
  },
  {
    run: runDeletePolice,
    messageDelete: handleMessageDelete,
  },
)

async function runDeletePolice(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)

  const oldConfig = await prisma.deletePoliceConfig.findUnique({
    where: {
      guildID: guild.id,
    },
  })

  if (getOptionCount(interaction) === 0) {
    if (!oldConfig) {
      await interaction.reply({
        content:
          'Quick delete police is not configured, use `/delete_police_config` to configure it.',
        ephemeral: true,
      })
      return
    }

    await interaction.reply({
      content: `Current Config:\n${formatConfig({
        config: oldConfig,
        guild,
      })}`,
    })
    return
  }

  const enabled = interaction.options.getBoolean('enabled')
  const threshold = interaction.options.getInteger('threshold')
  const fuzziness = interaction.options.getInteger('fuzziness')
  const ignoreBots = interaction.options.getBoolean('ignore_bots')
  const ignoreMods = interaction.options.getBoolean('ignore_mods')
  const footerMessage = interaction.options.getString('footer_message')

  const mergedConfig: Omit<DeletePoliceConfig, 'updatedAt'> = {
    guildID: guild.id,
    enabled: enabled ?? oldConfig?.enabled ?? false,
    threshold: threshold ?? oldConfig?.threshold ?? 5,
    fuzziness: fuzziness ?? oldConfig?.fuzziness ?? 0,
    ignoreBots: ignoreBots ?? oldConfig?.ignoreBots ?? true,
    ignoreMods: ignoreMods ?? oldConfig?.ignoreMods ?? true,
    footerMessage: footerMessage ?? oldConfig?.footerMessage ?? null,
  }

  await prisma.deletePoliceConfig.upsert({
    where: {
      guildID: guild.id,
    },
    update: mergedConfig,
    create: mergedConfig,
  })

  await interaction.reply({
    content: `New config:\n${formatConfig({
      config: mergedConfig,
      oldConfig,
      guild,
    })}`,
  })
}

async function handleMessageDelete(message: Message | PartialMessage) {
  if (message.partial || !message.inGuild()) {
    return
  }

  const config = await prisma.deletePoliceConfig.findUnique({
    where: {
      guildID: message.guild.id,
    },
  })

  if (!config?.enabled) {
    return
  }

  const { threshold, fuzziness, ignoreBots, ignoreMods, footerMessage } = config

  if (ignoreBots && message.author.bot) {
    return
  }

  if (
    ignoreMods &&
    message.member?.permissionsIn(message.channel).has('ManageMessages')
  ) {
    return
  }

  const now = new Date().getTime()
  const messageTime = message.createdAt.getTime()
  const timeSinceMessage = now - messageTime

  const limit = (threshold + Math.floor(Math.random() * (fuzziness + 1))) * 1000

  if (timeSinceMessage > limit) {
    return
  }

  const embeds = await quoteMessage(message, {
    includeChannel: false,
    includeTimestamp: false,
  })

  embeds[0].setFooter({
    text: footerMessage ?? '',
  })

  await message.channel.send({
    embeds,
  })
}

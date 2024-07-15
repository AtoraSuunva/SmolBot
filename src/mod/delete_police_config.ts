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
import { getGuild, SleetSlashCommand } from 'sleetcord'
import { getOptionCount } from 'sleetcord-common'
import { prisma } from '../util/db.js'
import { formatConfig } from '../util/format.js'
import { quoteMessage } from '../util/quoteMessage.js'
import { deleteEvents, MessageDeleteAuditLog } from './messageDeleteAuditLog.js'

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
        name: 'footer_message',
        description:
          'The message to put in the footer of reposted messages (default: none)',
        type: ApplicationCommandOptionType.String,
        max_length: 2000,
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
        name: 'only_self_delete',
        description:
          'Whether to only repost messages that were self-deleted, unreliable with bots (default: false)',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'guess_bot_delete',
        description:
          "Try to guess when a bot deleted a message and don't repost it (default: false)",
        type: ApplicationCommandOptionType.Boolean,
      },
    ],
  },
  {
    run: runDeletePolice,
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
  const footerMessage = interaction.options.getString('footer_message')
  const ignoreBots = interaction.options.getBoolean('ignore_bots')
  const ignoreMods = interaction.options.getBoolean('ignore_mods')
  const onlySelfDelete = interaction.options.getBoolean('only_self_delete')
  const guessBotDelete = interaction.options.getBoolean('guess_bot_delete')

  const mergedConfig: Omit<DeletePoliceConfig, 'updatedAt'> = {
    guildID: guild.id,
    enabled: enabled ?? oldConfig?.enabled ?? false,
    threshold: threshold ?? oldConfig?.threshold ?? 5,
    fuzziness: fuzziness ?? oldConfig?.fuzziness ?? 0,
    footerMessage: footerMessage ?? oldConfig?.footerMessage ?? null,
    ignoreBots: ignoreBots ?? oldConfig?.ignoreBots ?? true,
    ignoreMods: ignoreMods ?? oldConfig?.ignoreMods ?? true,
    onlySelfDelete: onlySelfDelete ?? oldConfig?.onlySelfDelete ?? false,
    guessBotDelete: guessBotDelete ?? oldConfig?.guessBotDelete ?? false,
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

deleteEvents.on('messageDeleteWithAuditLog', handleMessageDelete)
deleteEvents.registerSingle(async (message: Message | PartialMessage) => {
  if (message.partial || !message.inGuild()) {
    return false
  }

  const config = await prisma.deletePoliceConfig.findUnique({
    where: {
      guildID: message.guild.id,
    },
  })

  return !!(config?.enabled && config.onlySelfDelete)
})

async function handleMessageDelete(
  message: Message | PartialMessage,
  auditLog: MessageDeleteAuditLog | null,
) {
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

  const {
    threshold,
    fuzziness,
    ignoreBots,
    ignoreMods,
    onlySelfDelete,
    guessBotDelete,
    footerMessage,
  } = config

  if (ignoreBots && message.author.bot) {
    return
  }

  if (
    ignoreMods &&
    message.member?.permissionsIn(message.channel).has('ManageMessages')
  ) {
    return
  }

  // Use the audit log creation time (since it's probably more accurate due to "syncing computer time is hard and dealing with network latency is hard" reasons)
  // Otherwise fallback to our time, ideally we'd track every message's "arrival time" but that's effort and extra data for not much gain
  const now = auditLog?.createdTimestamp ?? new Date().getTime()
  const messageTime = message.createdTimestamp
  const timeSinceMessage = Math.abs(now - messageTime)

  // Bot message deletes don't create audit log entries, so we have to guess
  // based on if the message was deleted inhumanly fast
  // Not reliable, and someone using a self-bot or client mod could accomplish this,
  // while a bot could take too long or have network delays
  if (guessBotDelete && timeSinceMessage < 500) {
    return
  }

  const limit = (threshold + Math.floor(Math.random() * (fuzziness + 1))) * 1000

  if (timeSinceMessage > limit) {
    return
  }

  // If audit log is not null, it means someone else deleted this message
  if (onlySelfDelete && auditLog !== null) {
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

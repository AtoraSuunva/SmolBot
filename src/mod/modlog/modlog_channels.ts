import {
  ApplicationCommandOptionType,
  type ChatInputCommandInteraction,
  type CommandInteractionOption,
  Constants,
  type GuildTextBasedChannel,
} from 'discord.js'
import { getGuild, SleetSlashSubcommand } from 'sleetcord'
import { getOptionCount } from 'sleetcord-common'

import type { ModLogChannels } from '../../generated/prisma/client.js'
import { prisma } from '../../helpers/db.js'
import { channelFormatter, formatConfig, type GuildFormatter } from '../../helpers/format.js'
import {
  ACTION_KEYS,
  ACTION_KEYS_CAMEL,
  ACTION_KEYS_SNAKE,
  clearCacheFor,
  getValidatedConfigFor,
  type LoggedAction,
} from './utils.js'

export const modlog_channels = new SleetSlashSubcommand(
  {
    name: 'channels',
    description: 'Redirect certain modlog messages to specific channels',
    options: ACTION_KEYS_SNAKE.map((a) => ({
      name: a,
      description:
        'Redirect log messages to another channel, set to the same log channel as the main config to sync',
      type: ApplicationCommandOptionType.Channel,
      channel_types: Constants.GuildTextBasedChannelTypes,
    })),
  },
  {
    run: runModlogChannels,
  },
)

const createFormatters = (
  defaultChannel: GuildTextBasedChannel | null,
): Record<LoggedAction, GuildFormatter<string | null>> => {
  const formatters: Partial<Record<LoggedAction, GuildFormatter<string | null>>> = {}
  for (const action of ACTION_KEYS_CAMEL) {
    formatters[action] = (channelID, guild) => {
      if (!channelID) {
        return defaultChannel
          ? `[default] ${channelFormatter(defaultChannel.id, guild)}`
          : 'No channel set'
      }
      return channelFormatter(channelID, guild)
    }
  }

  return formatters as Record<LoggedAction, GuildFormatter<string | null>>
}

async function runModlogChannels(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)

  const oldConfig = await prisma.modLogChannels.findFirst({
    where: {
      guildID: guild.id,
    },
  })

  const mainConfig = await getValidatedConfigFor(guild)
  const mainChannel = mainConfig?.channel ?? null

  if (getOptionCount(interaction) === 0) {
    // No options specified, show the current config
    if (!oldConfig) {
      return interaction.reply({
        content:
          "You don't have any log channel overrides, use `/modlog channels` with options to create one.",
      })
    }

    return interaction.reply({
      content: `Current channel overrides:\n${formatConfig({
        config: oldConfig,
        guild,
        formatters: createFormatters(mainChannel),
      })}`,
      allowedMentions: { parse: [] },
    })
  }

  const options = getConfigOptionsFromInteraction(interaction)

  const mergedConfig: Omit<ModLogChannels, 'updatedAt'> = {
    guildID: guild.id,
    ...mergeOptions(options, oldConfig, mainChannel),
  }

  await prisma.modLogChannels.upsert({
    where: {
      guildID: guild.id,
    },
    update: mergedConfig,
    create: mergedConfig,
  })

  clearCacheFor(guild)

  return interaction.reply({
    content: `Modlog channel overrides:\n${formatConfig({
      config: mergedConfig,
      oldConfig,
      guild,
      formatters: createFormatters(mainChannel),
    })}`,
    allowedMentions: { parse: [] },
  })
}

type ModlogChannelOptions = Record<LoggedAction, CommandInteractionOption['channel']>

function getConfigOptionsFromInteraction(
  interaction: ChatInputCommandInteraction,
): ModlogChannelOptions {
  const options: Partial<ModlogChannelOptions> = {}

  for (const { camel, snake } of ACTION_KEYS) {
    options[camel] = interaction.options.getChannel(snake)
  }

  return options as ModlogChannelOptions
}

type MergeOptions = Record<LoggedAction, string | null>

function mergeOptions(
  newOptions: ModlogChannelOptions,
  oldConfig: ModLogChannels | null,
  mainChannel: CommandInteractionOption['channel'] | null = null,
) {
  const merged: Partial<MergeOptions> = {}

  for (const action of ACTION_KEYS_CAMEL) {
    merged[action] = mergedChannel(
      newOptions[action] ?? null,
      oldConfig?.[action] ?? null,
      mainChannel,
    )
  }

  return merged as MergeOptions
}

interface MaybeChannel {
  id?: string
}

function mergedChannel(
  newChannel: MaybeChannel | null,
  oldChannel: string | null | undefined,
  mainChannel: MaybeChannel | null,
): string | null {
  if (newChannel?.id === mainChannel?.id) {
    // Reset to null to sync it
    return null
  }

  // Otherwise use the new channel, fallback to the old config, or set it null as default
  return newChannel?.id ?? oldChannel ?? null
}

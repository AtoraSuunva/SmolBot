import {
  type APIApplicationCommandBasicOption,
  ApplicationCommandOptionType,
  type ChatInputCommandInteraction,
  Constants,
  MessageFlags,
} from 'discord.js'
import { getGuild, makeChoices, SleetSlashSubcommand } from 'sleetcord'
import { getOptionCount } from 'sleetcord-common'

import type { ModLogConfig } from '../../generated/prisma/client.js'
import { prisma } from '../../helpers/db.js'
import { type CamelToSnakeCase, formatConfig } from '../../helpers/format.js'
import {
  CONFIG_KEYS,
  type CONFIG_KEYS_SNAKE,
  clearCacheFor,
  type ModlogConfigKey,
} from './utils.js'

export enum UserUpdate {
  None = 'None',
  Username = 'Username',
  Avatar = 'Avatar',
  Both = 'Both',
}

const userUpdateChoices = makeChoices([
  UserUpdate.None,
  UserUpdate.Username,
  UserUpdate.Avatar,
  UserUpdate.Both,
])

// Use a type here to enforce that all the possible config options are included in the command options, and to get type safety when accessing the options
// If you add a new config option, you'll get a type error here until you add it to the command options as well
type ConfigKeys = (typeof CONFIG_KEYS_SNAKE)[number]

type UnnamedAPIApplicationCommandBasicOption<U = APIApplicationCommandBasicOption> =
  U extends unknown ? Omit<U, 'name'> : never

type ModlogConfigOptions = {
  [K in ConfigKeys]: UnnamedAPIApplicationCommandBasicOption
}

const modlogConfigOptions = {
  enabled: {
    description: 'Whether modlog is enabled',
    type: ApplicationCommandOptionType.Boolean,
  },
  member_add: {
    description: 'Log new member joins',
    type: ApplicationCommandOptionType.Boolean,
  },
  member_add_new: {
    description: 'The time in hours for an account to be marked as "new" (0 to disable)',
    type: ApplicationCommandOptionType.Integer,
    min_value: 0,
  },
  member_add_invite: {
    description: 'Log which invite was used to join',
    type: ApplicationCommandOptionType.Boolean,
  },
  member_welcome: {
    description: 'Log when a member is welcomed',
    type: ApplicationCommandOptionType.Boolean,
  },
  member_remove: {
    description: 'Log when a member leaves (or is kicked)',
    type: ApplicationCommandOptionType.Boolean,
  },
  member_remove_roles: {
    description: 'Log the roles a member had when they left',
    type: ApplicationCommandOptionType.Boolean,
  },
  member_ban: {
    description: 'Log when a member is banned',
    type: ApplicationCommandOptionType.Boolean,
  },
  member_unban: {
    description: 'Log when a member is unbanned',
    type: ApplicationCommandOptionType.Boolean,
  },
  member_timeout: {
    description: 'Log when a member is timed out or has their timeout removed',
    type: ApplicationCommandOptionType.Boolean,
  },
  automod_timeout: {
    description: 'Log when a member is timed out by Discord automod',
    type: ApplicationCommandOptionType.Boolean,
  },
  user_update: {
    description: 'Log when a user is updated',
    type: ApplicationCommandOptionType.String,
    choices: userUpdateChoices,
  },
  message_delete: {
    description: 'Log when a message is deleted',
    type: ApplicationCommandOptionType.Boolean,
  },
  message_delete_bulk: {
    description: 'Log when multiple messages are deleted at once',
    type: ApplicationCommandOptionType.Boolean,
  },
  channel_create: {
    description: 'Log when a channel is created',
    type: ApplicationCommandOptionType.Boolean,
  },
  channel_delete: {
    description: 'Log when a channel is deleted',
    type: ApplicationCommandOptionType.Boolean,
  },
  channel_update: {
    description: 'Log when a channel is updated',
    type: ApplicationCommandOptionType.Boolean,
  },
  reaction_actions: {
    description: 'Allow to act on modlog entries by reacting',
    type: ApplicationCommandOptionType.Boolean,
  },
  automod_action: {
    description: 'Log when an automod action by this bot is taken',
    type: ApplicationCommandOptionType.Boolean,
  },
  reaction_remove: {
    description: 'Log when a reaction is removed from a message',
    type: ApplicationCommandOptionType.Boolean,
  },
  reaction_time: {
    description: 'Only log if a reaction was removed in under this many seconds (0 for no limit)',
    type: ApplicationCommandOptionType.Integer,
    min_value: 0,
  },
} satisfies ModlogConfigOptions

export const modlog_config = new SleetSlashSubcommand(
  {
    name: 'config',
    description: 'View or edit the modlog config',
    options: [
      {
        name: 'channel',
        description: 'The channel to log to',
        type: ApplicationCommandOptionType.Channel,
        channel_types: Constants.GuildTextBasedChannelTypes,
      },
      ...Object.entries(modlogConfigOptions).map(([name, option]) =>
        Object.assign(option, {
          name,
        }),
      ),
    ],
  },
  {
    run: runModlogConfig,
  },
)

async function runModlogConfig(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)

  const oldConfig = await prisma.modLogConfig.findFirst({
    where: {
      guildID: guild.id,
    },
  })

  // No options specified, show the current config
  if (getOptionCount(interaction) === 0) {
    if (!oldConfig) {
      await interaction.reply({
        content:
          "You don't have an existing modlog config, use `/modlog config` with options to create one.",
      })
      return
    }

    await interaction.reply({
      content: `Current config:\n${formatConfig({
        config: oldConfig,
        guild,
      })}`,
    })
    return
  }

  const channel = interaction.options.getChannel('channel')
  const options = getConfigOptionsFromInteraction(interaction)

  const channelID = channel?.id ?? oldConfig?.channelID
  if (!channelID) {
    await interaction.reply({
      content: 'Please specify a channel to log to.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const mergedConfig: Omit<ModLogConfig, 'updatedAt'> = {
    guildID: guild.id,
    channelID,
    ...mergeOptions(options, oldConfig),
  }

  await prisma.modLogConfig.upsert({
    where: {
      guildID: guild.id,
    },
    update: mergedConfig,
    create: mergedConfig,
  })

  clearCacheFor(guild)

  await interaction.reply({
    content: `Modlog Config:\n${formatConfig({
      config: mergedConfig,
      oldConfig,
      guild,
    })}`,
    allowedMentions: { parse: [] },
  })
  return
}

type PrimitiveFromOptionType<T extends ApplicationCommandOptionType> =
  T extends ApplicationCommandOptionType.String
    ? string
    : T extends ApplicationCommandOptionType.Integer
      ? number
      : T extends ApplicationCommandOptionType.Boolean
        ? boolean
        : T extends ApplicationCommandOptionType.User
          ? string
          : T extends ApplicationCommandOptionType.Channel
            ? string
            : T extends ApplicationCommandOptionType.Role
              ? string
              : T extends ApplicationCommandOptionType.Mentionable
                ? string
                : never

type ModlogConfigValueOptions = {
  [K in ModlogConfigKey]: PrimitiveFromOptionType<
    (typeof modlogConfigOptions)[CamelToSnakeCase<K>]['type']
  >
}

function getConfigOptionsFromInteraction(
  interaction: ChatInputCommandInteraction,
): ModlogConfigValueOptions {
  const options: Partial<ModlogConfigValueOptions> = {}

  for (const { camel, snake } of CONFIG_KEYS) {
    options[camel] = interaction.options.get(snake)?.value as never // trick typescript
  }

  return options as ModlogConfigValueOptions
}

function mergeOptions(newOptions: ModlogConfigValueOptions, oldConfig: ModLogConfig | null) {
  const merged: Partial<ModlogConfigValueOptions> = {}

  for (const { camel, snake } of CONFIG_KEYS) {
    merged[camel] = (newOptions[camel] ?? oldConfig?.[camel] ?? getDefaultOption(snake)) as never
  }

  return merged as ModlogConfigValueOptions
}

function getDefaultOption(key: (typeof CONFIG_KEYS_SNAKE)[number]): string | number | boolean {
  const option = modlogConfigOptions[key].type

  switch (option) {
    case ApplicationCommandOptionType.Boolean:
      return false
    case ApplicationCommandOptionType.Integer:
      return 0
    case ApplicationCommandOptionType.String:
      if (key === 'user_update') {
        return UserUpdate.None
      }
      return ''
    default:
      throw new Error(`Unsupported option type: ${option}`)
  }
}

import { type Guild, type GuildTextBasedChannel, time } from 'discord.js'
import { TicketQueue } from 'ticket-queue'

import { type ModLogChannels, type ModLogConfig, Prisma } from '../../generated/prisma/client.js'
import { prisma } from '../../helpers/db.js'
import { type CamelToSnakeCase, toSnakeCase } from '../../helpers/format.js'

export enum EVENT_COLORS {
  memberAdd = 0x77b255,
  memberRemove = 0xdd2e44,
  userBan = 0xff0000,
  userUnban = 0x55acee,
}

const modlogTicketQueueMap = new Map<Guild, TicketQueue>()

export function getModlogTicketQueue(guild: Guild): TicketQueue {
  let queue = modlogTicketQueueMap.get(guild)

  if (!queue) {
    queue = new TicketQueue({
      ticketTimeout: 500,
      ticketRetries: 3,
    })
    modlogTicketQueueMap.set(guild, queue)
  }

  return queue
}

const configCache = new Map<Guild, ModLogConfig>()

export async function getConfigFor(guild: Guild): Promise<ModLogConfig | null> {
  const cached = configCache.get(guild)

  if (cached) return cached

  const config = await prisma.modLogConfig.findFirst({
    where: {
      guildID: guild.id,
    },
  })

  if (config) configCache.set(guild, config)

  return config
}

export type ConfigChecker = (config: ModLogConfig) => boolean

export interface ValidConfig {
  config: ModLogConfig
  channel: GuildTextBasedChannel
}

/** CamelCase keys type for modlog config: memberAdd, memberTimeout, etc */
export type ModlogConfigKey = Exclude<
  keyof Prisma.ModLogConfigCreateInput,
  'guildID' | 'updatedAt' | 'channelID'
>

/** CamelCase keys type for modlog config options: memberAdd, memberTimeout, etc */
export const CONFIG_KEYS = (
  Object.keys(Prisma.ModLogConfigScalarFieldEnum) as unknown as Array<
    keyof typeof Prisma.ModLogConfigScalarFieldEnum
  >
)
  .filter((a) => a !== 'guildID' && a !== 'updatedAt' && a !== 'channelID')
  .map((a) => ({
    camel: a,
    snake: toSnakeCase(a),
  })) as { camel: ModlogConfigKey; snake: CamelToSnakeCase<ModlogConfigKey> }[]

/** camelCase keys for modlog config options: memberAdd, memberTimeout, etc */
export const CONFIG_KEYS_CAMEL = CONFIG_KEYS.map((a) => a.camel)

/** snake_case keys for modlog config options: member_ban, member_timeout, etc */
export const CONFIG_KEYS_SNAKE = CONFIG_KEYS.map((a) => a.snake)

/** CamelCase keys type for modlog actions: memberAdd, memberTimeout, etc */
export type LoggedAction = Exclude<keyof Prisma.ModLogChannelsCreateInput, 'guildID' | 'updatedAt'>

export const ACTION_KEYS = (
  Object.keys(Prisma.ModLogChannelsScalarFieldEnum) as unknown as Array<
    keyof typeof Prisma.ModLogChannelsScalarFieldEnum
  >
)
  .filter((a) => a !== 'guildID' && a !== 'updatedAt')
  .map((a) => ({
    camel: a,
    snake: toSnakeCase(a),
  })) as { camel: LoggedAction; snake: CamelToSnakeCase<LoggedAction> }[]

/** camelCase keys for modlog actions: memberAdd, memberTimeout, etc */
export const ACTION_KEYS_CAMEL = ACTION_KEYS.map((a) => a.camel)

/** snake_case keys for modlog actions: member_ban, member_timeout, etc */
export const ACTION_KEYS_SNAKE = ACTION_KEYS.map((a) => a.snake)

const validadedConfigCache = new Map<string, ValidConfig | null>()

export async function getValidatedConfigFor(
  guild: Guild,
  loggedAction: LoggedAction | '' = '',
  checker: ConfigChecker = () => true,
): Promise<ValidConfig | null> {
  const cacheKey = `${guild.id}-${loggedAction}`
  const cached = validadedConfigCache.get(cacheKey)

  if (cached && checker(cached.config)) return cached

  const config = await getConfigFor(guild)

  if (!config?.enabled || !checker(config)) return null

  if (loggedAction) {
    const channel = await getChannelFor(guild, loggedAction, false)

    if (channel) {
      const validConfig = { config, channel }
      validadedConfigCache.set(cacheKey, validConfig)
      return validConfig
    }
  }

  const channel = await guild.channels.fetch(config.channelID).catch(() => null)

  if (!channel?.isTextBased()) return null

  const validConfig = { config, channel }
  validadedConfigCache.set(cacheKey, validConfig)
  return validConfig
}

const channelsCache = new Map<Guild, ModLogChannels>()

async function getCachedChannelFor(guild: Guild): Promise<ModLogChannels | null> {
  const cached = channelsCache.get(guild)

  if (cached) return cached

  const channels = await prisma.modLogChannels.findFirst({
    where: {
      guildID: guild.id,
    },
  })

  if (channels) channelsCache.set(guild, channels)

  return channels
}

export async function getChannelFor(
  guild: Guild,
  loggedAction: LoggedAction,
  fallback = true,
): Promise<GuildTextBasedChannel | null> {
  const channels = await getCachedChannelFor(guild)

  let channelID: string | null | undefined = channels?.[loggedAction]

  if (!channelID) {
    if (!fallback) return null

    const config = await getConfigFor(guild)

    if (!config) return null
    channelID = config.channelID
  }

  const channel = await guild.channels.fetch(channelID).catch(() => null)

  if (!channel?.isTextBased()) return null

  return channel
}

export function clearCacheFor(guild: Guild) {
  configCache.delete(guild)
  channelsCache.delete(guild)

  for (const key of validadedConfigCache.keys()) {
    if (key.startsWith(guild.id)) {
      validadedConfigCache.delete(key)
    }
  }
}

export function formatLog(emoji: string, type: string, message: string, timestamp: Date): string {
  return `${emoji} ${time(timestamp, 'T')} \`[${type}]\`: ${message}`
}

export function formatTime(timestamp: Date | null = new Date()): string {
  if (timestamp === null) return 'null'
  return padExpressions`${timestamp.getUTCHours()}:${timestamp.getUTCMinutes()}:${timestamp.getUTCSeconds()}`
}

/** Pads the expressions in tagged template literals */
function padExpressions(strings: TemplateStringsArray, ...expressions: unknown[]) {
  return strings
    .map(
      (v, i) =>
        v +
        (expressions[i] !== undefined ? String(expressions[i] as unknown).padStart(2, '0') : ''),
    )
    .join('')
}

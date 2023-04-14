import { ModLogConfig } from '@prisma/client'
import { Guild, GuildTextBasedChannel } from 'discord.js'
import { prisma } from '../../util/db.js'

export enum EVENT_COLORS {
  memberAdd = 0x77b255,
  memberRemove = 0xdd2e44,
  userBan = 0xff0000,
  userUnban = 0x55acee,
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

export async function getValidatedConfigFor(
  guild: Guild,
  checker: ConfigChecker = () => true,
): Promise<{ config: ModLogConfig; channel: GuildTextBasedChannel } | null> {
  const config = await getConfigFor(guild)

  if (!config || !config.enabled || !checker(config)) return null

  const channel = guild.channels.cache.get(config.channelID)

  if (!channel || !channel.isTextBased()) return null

  return { config, channel }
}

export function clearCacheFor(guild: Guild) {
  configCache.delete(guild)
}

export function formatLog(
  emoji: string,
  type: string,
  message: string,
  timestamp = new Date(),
): string {
  return `${emoji} \`[${formatTime(timestamp)}]\` \`[${type}]\`: ${message}`
}

export function formatTime(timestamp: Date = new Date()): string {
  return padExpressions`${timestamp.getUTCHours()}:${timestamp.getUTCMinutes()}:${timestamp.getUTCSeconds()}`
}

/** Pads the expressions in tagged template literals */
function padExpressions(
  strings: TemplateStringsArray,
  ...expressions: unknown[]
) {
  return strings
    .map(
      (v, i) =>
        v +
        (expressions[i] !== undefined
          ? (expressions[i] + '').padStart(2, '0')
          : ''),
    )
    .join('')
}

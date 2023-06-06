import { codeBlock, Guild } from 'discord.js'

type Values = string | number | boolean | Date | null | undefined

export function formatConfig<Config extends Record<string, Values>>(
  guild: Guild,
  config: Partial<Config>,
): string {
  let longest = 0

  const formatted = Object.entries(config)
    .filter(
      ([key]) =>
        !['guildid', 'updatedat', 'createdat'].includes(key.toLowerCase()),
    )
    .map(([key, value]): [string, Values] => {
      const snakeKey = snakeCase(key)
      const lengthKey = snakeKey === 'channel_id' ? 'channel' : snakeKey

      if (lengthKey.length > longest) longest = lengthKey.length

      return [snakeKey, value]
    })
    .map(([key, value]) => {
      if (key === 'channel_id') {
        key = 'channel'
        value = `#${
          guild.channels.cache.get(value as string)?.name ??
          `unknown-channel (${String(value)})`
        }`
      }

      return `${key.padEnd(longest, ' ')} = ${String(value)}`
    })
    .join('\n')

  return codeBlock('ini', formatted)
}

export function notNullish<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

function snakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/\s+/g, '_')
    .toLowerCase()
    .trim()
}

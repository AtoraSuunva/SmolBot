import { codeBlock, Guild } from 'discord.js'

export function formatConfig<
  Value extends string | number | boolean | Date,
  Config extends Record<string, Value>,
>(guild: Guild, config: Partial<Config>): string {
  let longest = 0

  const formatted = Object.entries(config)
    .map(([key, value]): [string, Value] => {
      key = snakeCase(key)
      if (key.length > longest) longest = key.length
      return [key, value]
    })
    .map(([key, value]) => {
      if (['guild_id', 'updated_at'].includes(key)) return null
      if (key === 'channel_id') {
        key = 'channel'
        value = `#${
          guild.channels.cache.get(value as string)?.name ?? 'unknown-channel'
        }` as Value
      }

      return `${snakeCase(key).padEnd(longest, ' ')} = ${value}`
    })
    .filter(notNullish)
    .join('\n')

  return codeBlock('ini', formatted)
}

function notNullish<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

function snakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/\s+/g, '_')
    .toLowerCase()
}

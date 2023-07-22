import { codeBlock, Guild } from 'discord.js'
import pluralize from 'pluralize'

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

/**
 * A predicate function for filtering out nullish values
 *
 * @example
 * const notNull: string[] = ['a', null, 'b', undefined, 'c'].filter(notNullish)
 * @param value A value that might be null or undefined
 * @returns True if the value is not null or undefined, false otherwise
 */
export function notNullish<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

/**
 * Converts a string from camelCase to snake_case
 * @param str The string to make snake case
 * @returns The snake cased string
 */
function snakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/\s+/g, '_')
    .toLowerCase()
    .trim()
}

interface PluralOptions {
  includeCount?: boolean
  boldNumber?: boolean
}

/**
 * A simple wrapper around the npm pluralize package, to include the count by default and to use `toLocaleString` for the count
 * @param str The string to pluralize
 * @param count The count of the string there is
 * @param includeCount Whether to include the count in the string as `<count> string`
 * @returns A pluralized string, depending on the count
 */
export function plural(
  str: string,
  count: number,
  { includeCount = true, boldNumber = true }: PluralOptions = {},
): string {
  let numberFormat = (n: number) => n.toLocaleString()

  if (boldNumber) {
    numberFormat = (num) => `**${num.toLocaleString()}**`
  }

  return `${includeCount ? `${numberFormat(count)} ` : ''}${pluralize(
    str,
    count,
  )}`
}

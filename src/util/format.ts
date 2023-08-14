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

export interface TableFormatOptions<T> {
  /** The keys to show, by default all keys of the first object */
  keys?: (keyof T)[]
  /** Map column names (taken from keys) to something else, usually `keyName` => `Key Name` */
  columnsNames?: Partial<Record<keyof T, string>>
  /** Whether to show "nullish" (null | undefined) values as-is or as empty cells, default true (show as-is) */
  showNullish?: boolean
}

/**
 * Format an array of objects as a markdown table, with the keys (configurable) as the columns
 * and with appropriate padding
 * @param data The data to format
 * @param options Options for formatting
 * @returns A formatted table, as a string
 */
export function tableFormat<T extends object>(
  data: T[],
  options?: TableFormatOptions<T>,
): string {
  const keys = options?.keys ?? (Object.keys(data[0]) as (keyof T)[])
  const columnNames =
    options?.columnsNames ?? ({} as Record<keyof T, string | undefined>)
  const showNullish = options?.showNullish ?? true

  const header: string[] = []
  const separator: string[] = []
  const rows: string[] = []

  for (const key of keys) {
    const name: string = columnNames[key] ?? String(key)
    const longest = Math.max(
      name.length,
      ...data.map((d) => String(d[key]).length),
    )
    header.push(name.padEnd(longest, ' '))
    separator.push('-'.repeat(longest))
  }

  for (const d of data) {
    rows.push(
      keys
        .map((k) => {
          let r: string | null | undefined = d[k]

          if (!showNullish && (r === null || r === undefined)) {
            r = ''
          }

          return String(r).padEnd(header[keys.indexOf(k)].length, ' ')
        })
        .join(' | '),
    )
  }

  return `${header.join(' | ')}\n${separator.join(' | ')}\n${rows.join('\n')}`
}

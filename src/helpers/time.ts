import { DateTime, type Zone } from 'luxon'

const unixMsRegex = /^\d+$/

/**
 * Parse a string (ISO 8601 or unix milliseconds) or number (unix milliseconds) into a DateTime object
 * @param input Input string as either unix milliseconds or ISO 8601 YYYY-MM-DDTHH:MM:SS or input number as unix milliseconds
 * @param zone Timezone to interpret the input in if the input specifies none, defaults to UTC
 * @returns
 */
export function dateTimeFrom(
  input: string | number,
  zone: string | Zone = 'UTC',
): DateTime {
  if (typeof input === 'number') {
    return DateTime.fromMillis(input, { zone })
  }

  return unixMsRegex.test(input)
    ? DateTime.fromMillis(Number.parseInt(input, 10), { zone })
    : DateTime.fromISO(input, { zone })
}

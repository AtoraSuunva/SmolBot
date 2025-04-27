declare module 'parse-human-relative-time/luxon.js' {
  import type { DateTime } from 'luxon'

  export function createParseHumanRelativeTime(
    createDateTime: typeof DateTime,
  ): typeof parseHumanRelativeTime

  function parseHumanRelativeTime(str: string, now: DateTime): DateTime
}

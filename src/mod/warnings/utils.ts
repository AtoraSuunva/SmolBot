import { Prisma, Warning, WarningConfig } from '@prisma/client'
import { APIEmbedField, time } from 'discord.js'
import { PreRunError } from 'sleetcord'
import { prisma } from '../../util/db.js'

export const MAX_PER_PAGE = 5

export interface WarningCount {
  total: number
  expired: number
}

/**
 * A limited (to `MAX_PER_PAGE`) array of warnings to display plus counts for total and expired warnings
 *
 * You will need to paginate in order to actually display or process all warnings, this is meant for pagination
 */
export interface PaginatedWarnings {
  warnings: Warning[]
  counts: WarningCount
}

export interface WarningFilters {
  userID: string
  reason: string
}

/**
 * Gets a (paginated) array of warnings that can be displayed without breaking embed limits, plus counts so you can still
 * tell how many warnings someone has (total and expired)
 * @param guildID The guild to search in
 * @param userID The user to search for
 * @param config The guild config to use
 * @param page The page to start at
 * @returns A (limited) set of warnings to display plus counts for total and expired warnings
 */
export async function fetchPaginatedWarnings(
  guildID: string,
  config: WarningConfig,
  page: number,
  filters: Prisma.WarningWhereInput,
): Promise<PaginatedWarnings> {
  const counts = await fetchWarningCount(guildID, config.expiresAfter, filters)

  const warnings = await prisma.warning.findMany({
    where: {
      ...filters,
      guildID,
      validUntil: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
    skip: (page - 1) * MAX_PER_PAGE,
    take: MAX_PER_PAGE,
  })

  return {
    warnings,
    counts,
  }
}

async function fetchWarningCount(
  guildID: string,
  days: number,
  filters: Prisma.WarningWhereInput,
): Promise<WarningCount> {
  const total = await prisma.warning.count({
    where: {
      ...filters,
      guildID,
      validUntil: null,
    },
  })

  const expired = await prisma.warning.count({
    where: {
      ...filters,
      guildID,
      validUntil: null,
      OR: [
        {
          void: true,
        },
        {
          permanent: false,
          createdAt: {
            gte: getExpirationDate(days),
          },
        },
      ],
    },
  })

  return {
    total,
    expired,
  }
}

export async function fetchPaginatedWarningHistory(
  guildID: string,
  warningID: number,
  page: number,
): Promise<PaginatedWarnings> {
  const total = await fetchWarningHistoryCount(guildID, warningID)

  const warnings = await prisma.warning.findMany({
    where: {
      guildID,
      warningID,
    },
    orderBy: {
      version: 'desc',
    },
    skip: (page - 1) * MAX_PER_PAGE,
    take: MAX_PER_PAGE,
  })

  return {
    warnings,
    counts: {
      total,
      expired: 0,
    },
  }
}

export async function fetchWarningHistoryCount(
  guildID: string,
  warningID: number,
): Promise<number> {
  return prisma.warning.count({
    where: {
      guildID,
      warningID,
    },
  })
}

export async function fetchWarningConfigFor(
  guildID: string,
  required: true,
): Promise<WarningConfig>
export async function fetchWarningConfigFor(
  guildID: string,
  required?: false,
): Promise<WarningConfig | null>
export async function fetchWarningConfigFor(
  guildID: string,
  required = false,
): Promise<WarningConfig | null> {
  const config = await prisma.warningConfig.findUnique({
    where: {
      guildID,
    },
  })

  if (!config && required) {
    throw new PreRunError(
      `No warning config found for this guild. Please run \`/warnings config\` to set one up.`,
    )
  }

  return config
}

export interface WarningFieldFormatOptions {
  showModNote: boolean
  showUserOnWarning: boolean
  showVersion: boolean
  showResponsibleMod: boolean
}

export function formatWarningToField(
  warning: Warning,
  config: WarningConfig,
  options: Partial<WarningFieldFormatOptions> = {},
): APIEmbedField {
  const {
    showModNote = false,
    showUserOnWarning = false,
    showVersion = false,
    showResponsibleMod = false,
  } = options

  const expireDate = getExpirationDate(config.expiresAfter)

  const w = warning
  const version = showVersion ? ` (v${w.version})` : ''
  const permaText = w.permanent ? ' (Permanent)' : ''
  const warningUser = showUserOnWarning
    ? `**User:** ${w.user} (${w.userID})\n`
    : ''
  const timestamp = time(w.createdAt, 'R')
  const expiredText = warningIsExpired(w, config, expireDate)
    ? ' (Expired)'
    : ''
  const voidOrExpired = w.void ? ' (Void)' : expiredText
  const modNote = showModNote && w.modNote ? `\n**Note:** ${w.modNote}` : ''
  const responsibleMod = showResponsibleMod
    ? `\n**By:** <@${w.moderatorID}>`
    : ''

  return {
    name: `#${w.warningID}${version}${permaText}${voidOrExpired}`,
    value: `${warningUser}> ${w.reason} (${timestamp})${modNote}${responsibleMod}`,
  }
}

const DAY_TO_MS = 24 * 60 * 60 * 1000

function warningIsExpired(
  warning: Warning,
  config: WarningConfig,
  expireDate: Date,
): boolean {
  return (
    warning.void ||
    (config.expiresAfter > 0 &&
      !warning.permanent &&
      warning.createdAt >= expireDate)
  )
}

function getExpirationDate(days: number): Date {
  return new Date(Date.now() + days * DAY_TO_MS)
}

import { Warning, WarningConfig } from '@prisma/client'
import { APIEmbedField, EmbedBuilder, time, User } from 'discord.js'
import { PreRunError } from 'sleetcord'
import { prisma } from '../../util/db.js'

export async function getWarningsForUser(
  guildID: string,
  userID: string,
): Promise<Warning[]> {
  return prisma.warning.findMany({
    where: {
      guildID,
      userID,
      validUntil: null,
    },
  })
}

export async function getConfigForGuild(
  guildID: string,
  required: true,
): Promise<WarningConfig>
export async function getConfigForGuild(
  guildID: string,
  required?: false,
): Promise<WarningConfig | null>
export async function getConfigForGuild(
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

const DAY_TO_MS = 24 * 60 * 60 * 1000

export function formatUserWarningsToEmbed(
  user: User,
  warnings: Warning[],
  config: WarningConfig,
  formatOptions: Partial<WarningFieldFormatOptions>,
): EmbedBuilder {
  const fields = warnings.map((w) =>
    formatWarningToField(w, config, formatOptions),
  )

  const expireDate = Date.now() + config.expiresAfter * DAY_TO_MS

  const expiredWarnings = warnings.filter((w) =>
    warningIsExpired(w, config, expireDate),
  ).length

  const expiredText = expiredWarnings > 0 ? `, ${expiredWarnings} Expired` : ''

  return new EmbedBuilder()
    .setTitle(
      `Warnings for ${user.tag} (${warnings.length} Total${expiredText})`,
    )
    .addFields(fields)
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

  const expireDate = Date.now() + config.expiresAfter * DAY_TO_MS

  const w = warning
  const version = showVersion ? ` (v${w.version})` : ''
  const permaText = w.permanent ? ' (Permanent)' : ''
  const warningUser = showUserOnWarning ? `**User:** ${w.user}\n` : ''
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
    value: `${warningUser}${w.reason} (${timestamp})${modNote}${responsibleMod}`,
  }
}

function warningIsExpired(
  warning: Warning,
  config: WarningConfig,
  expireDate: number,
): boolean {
  return (
    warning.void ||
    (config.expiresAfter > 0 &&
      !warning.permanent &&
      warning.createdAt.getTime() >= expireDate)
  )
}

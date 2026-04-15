import { AuditLogEvent, type Guild, type GuildAuditLogsEntry } from 'discord.js'
import { formatUser } from 'sleetcord'

import { sendToModlog } from '../../sendToModlog.js'
import {
  formatLog,
  getModlogTicketQueue,
  getValidatedConfigFor,
  type LoggedAction,
} from '../../utils.js'
import { resolveUser } from './index.js'

export type BanAuditLog = GuildAuditLogsEntry<
  AuditLogEvent.MemberBanAdd | AuditLogEvent.MemberBanRemove | AuditLogEvent.MemberKick,
  'Create' | 'Delete',
  'User'
>

/**
 * Log when a member is removed forcefully by a mod from a guild (or let back in). Ban, unban, and kick.
 */
export async function logMemberBanKick(auditLogEntry: BanAuditLog, guild: Guild) {
  const eventDate = new Date()
  using ticket = getModlogTicketQueue(guild).acquireTicket()

  let action: LoggedAction

  switch (auditLogEntry.action) {
    case AuditLogEvent.MemberBanAdd:
      action = 'memberBan'
      break

    case AuditLogEvent.MemberBanRemove:
      action = 'memberUnban'
      break

    case AuditLogEvent.MemberKick:
      action = 'memberRemove'
      break
  }

  const conf = await getValidatedConfigFor(guild, action, (config) => config[action])
  if (!conf) return

  const executor = await resolveUser(auditLogEntry.executor, auditLogEntry.executorId, guild.client)
  const execUser = executor ? formatUser(executor) : 'Unknown User'

  const target = await resolveUser(auditLogEntry.target, auditLogEntry.targetId, guild.client)
  const targetUser = target ? formatUser(target) : 'Unknown User'

  const reason = auditLogEntry.reason ? ` for "${auditLogEntry.reason}"` : ''
  const verb = LogVerb[auditLogEntry.action]

  const message = `${targetUser} ${verb} by ${execUser}${reason}`

  await ticket.waitUntilFirst()

  await sendToModlog(conf.channel, {
    content: formatLog(
      LogEmoji[auditLogEntry.action],
      LogName[auditLogEntry.action],
      message,
      eventDate,
    ),
    allowedMentions: { parse: [] },
  })
}

const LogEmoji = {
  [AuditLogEvent.MemberBanAdd]: '🔨',
  [AuditLogEvent.MemberBanRemove]: '👼',
  [AuditLogEvent.MemberKick]: '👢',
}

const LogName = {
  [AuditLogEvent.MemberBanAdd]: 'Member Ban',
  [AuditLogEvent.MemberBanRemove]: 'Member Unban',
  [AuditLogEvent.MemberKick]: 'Member Kick',
}

const LogVerb = {
  [AuditLogEvent.MemberBanAdd]: 'banned',
  [AuditLogEvent.MemberBanRemove]: 'unbanned',
  [AuditLogEvent.MemberKick]: 'kicked',
}

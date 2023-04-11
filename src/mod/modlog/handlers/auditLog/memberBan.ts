import { AuditLogEvent, GuildAuditLogsEntry } from 'discord.js'
import { AuditInfo, resolveUser } from './index.js'
import { formatUser } from 'sleetcord'
import { formatLog } from '../../utils.js'

export type BanAuditLog = GuildAuditLogsEntry<
  AuditLogEvent,
  'Create' | 'Delete',
  'User',
  AuditLogEvent.MemberBanAdd | AuditLogEvent.MemberBanRemove
>

export async function logMemberBan(
  auditLogEntry: BanAuditLog,
  { channel, config, guild }: AuditInfo,
) {
  if (
    (auditLogEntry.action === AuditLogEvent.MemberBanAdd &&
      !config.memberBan) ||
    (auditLogEntry.action === AuditLogEvent.MemberBanRemove &&
      !config.memberUnban)
  ) {
    return
  }

  const executor = await resolveUser(
    auditLogEntry.executor,
    auditLogEntry.executorId,
    guild,
  )
  const execUser = executor ? formatUser(executor) : 'Unknown User'

  const target = await resolveUser(
    auditLogEntry.target,
    auditLogEntry.targetId,
    guild,
  )
  const targetUser = target ? formatUser(target) : 'Unknown User'

  const reason = auditLogEntry.reason ? ` for "${auditLogEntry.reason}"` : ''
  const verb = LogVerb[auditLogEntry.action]

  const message = `${targetUser} ${verb} by ${execUser}${reason}`

  channel.send(
    formatLog(
      LogEmoji[auditLogEntry.action],
      LogName[auditLogEntry.action],
      message,
    ),
  )
}

const LogEmoji = {
  [AuditLogEvent.MemberBanAdd]: '🔨',
  [AuditLogEvent.MemberBanRemove]: '👼',
}

const LogName = {
  [AuditLogEvent.MemberBanAdd]: 'Member Ban',
  [AuditLogEvent.MemberBanRemove]: 'Member Unban',
}

const LogVerb = {
  [AuditLogEvent.MemberBanAdd]: 'banned',
  [AuditLogEvent.MemberBanRemove]: 'unbanned',
}

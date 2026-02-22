import {
  type AuditLogEvent,
  type Guild,
  type GuildAuditLogsEntry,
  time,
} from 'discord.js'
import { DateTime, Interval } from 'luxon'
import prettyMilliseconds from 'pretty-ms'
import { formatUser } from 'sleetcord'
import {
  formatLog,
  getModlogTicketQueue,
  getValidatedConfigFor,
  type LoggedAction,
} from '../../utils.js'
import { resolveUser } from './index.js'

export type TimeoutAuditLog = GuildAuditLogsEntry<
  AuditLogEvent.MemberUpdate,
  'Create' | 'Delete',
  'User'
>

/**
 * Log when a member is timed out
 */
export async function logMemberTimeout(
  auditLogEntry: TimeoutAuditLog,
  guild: Guild,
) {
  const eventDate = new Date()
  using ticket = getModlogTicketQueue(guild).acquireTicket()

  const action: LoggedAction = 'memberTimeout'

  const conf = await getValidatedConfigFor(
    guild,
    action,
    (config) => !!config[action],
  )
  if (!conf) return

  const executor = await resolveUser(
    auditLogEntry.executor,
    auditLogEntry.executorId,
    guild.client,
  )
  const execUser = executor ? formatUser(executor) : 'Unknown User'

  const target = await resolveUser(
    auditLogEntry.target,
    auditLogEntry.targetId,
    guild.client,
  )
  const targetUser = target ? formatUser(target) : 'Unknown User'

  const timeoutChange = auditLogEntry.changes.find(
    (change) => change.key === 'communication_disabled_until',
  )

  if (!timeoutChange) {
    return
  }

  let verb = 'timed out'
  let until: DateTime | null = null
  let interval: Interval | null = null

  if (timeoutChange.new) {
    verb = 'was timed out'
    until = DateTime.fromISO(timeoutChange.new)
    interval = Interval.fromDateTimes(DateTime.now(), until)
  } else if (timeoutChange.old) {
    verb = 'had their timeout removed'
  }

  const reason = auditLogEntry.reason ? ` for "${auditLogEntry.reason}"` : ''
  const untilMessage = until ? ` until ${time(until.toJSDate(), 'f')}` : ''
  // Get the duration in seconds to round away wonky ms values due to network latency (since we calculate the duration based on when we receive the audit log entry)
  const intervalMessage = interval
    ? ` (${prettyMilliseconds(Math.round(interval.toDuration('seconds').seconds) * 1000, { verbose: true })})`
    : ''

  const message = `${targetUser} ${verb} by ${execUser}${reason}${untilMessage}${intervalMessage}`

  await ticket.waitUntilFirst()

  await conf.channel.send({
    content: formatLog('🕑', 'Member Timeout', message, eventDate),
    allowedMentions: { parse: [] },
  })
}

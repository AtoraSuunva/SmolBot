import {
  type AuditLogEvent,
  type AutoModerationActionExecution,
  AutoModerationActionType,
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
  const targetUser = target
    ? formatUser(target)
    : `Unknown User (${auditLogEntry.targetId})`

  const timeoutChange = auditLogEntry.changes.find(
    (change) => change.key === 'communication_disabled_until',
  )

  if (!timeoutChange) {
    return
  }

  let emoji = '⏱️'
  let verb = 'was timed out'
  let until: DateTime | null = null
  let interval: Interval | null = null

  if (timeoutChange.new) {
    verb = 'was timed out'
    until = DateTime.fromISO(timeoutChange.new)
    interval = Interval.fromDateTimes(DateTime.now(), until)
  } else if (timeoutChange.old) {
    emoji = '🗣️'
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
    content: formatLog(emoji, 'Member Timeout', message, eventDate),
    allowedMentions: { parse: [] },
  })
}

export async function logAutoModerationActionExecution(
  execution: AutoModerationActionExecution,
) {
  const { guild } = execution

  const eventDate = new Date()
  using ticket = getModlogTicketQueue(guild).acquireTicket()

  const action: LoggedAction = 'automodTimeout'

  const conf = await getValidatedConfigFor(
    guild,
    action,
    (config) => !!config[action],
  )
  if (!conf) return
  if (execution.action.type !== AutoModerationActionType.Timeout) return

  const timeoutDuration = execution.action.metadata.durationSeconds

  if (!timeoutDuration) return

  const targetUser = execution.member
    ? formatUser(execution.member.user)
    : `Unknown User (${execution.userId})`

  const { ruleId } = execution
  const rule = await guild.autoModerationRules
    .fetch(ruleId)
    .then((r) => r.name)
    .catch(() => `Unknown Rule (${ruleId})`)
  const until = DateTime.now().plus({ seconds: timeoutDuration })
  const untilMessage = ` until ${time(until.toJSDate(), 'f')}`
  const intervalMessage = ` (${prettyMilliseconds(timeoutDuration * 1000, { verbose: true })})`

  const message = `${targetUser} was automatically timed out by rule "${rule}"${untilMessage}${intervalMessage}`

  await ticket.waitUntilFirst()

  await conf.channel.send({
    content: formatLog('⏱️', 'Member Timeout', message, eventDate),
    allowedMentions: { parse: [] },
  })
}

import { ActionLogConfig } from '@prisma/client'
import { AuditLogEvent, Guild, GuildAuditLogsEntry } from 'discord.js'
import { SleetModule } from 'sleetcord'
import { prisma } from '../../util/db.js'
import {
  ActionLogEntry,
  fetchActionLogConfigFor,
  formatToLog,
  markActionlogArchiveDirty,
} from './utils.js'

export const logAction = new SleetModule(
  {
    name: 'logAction',
  },
  {
    guildAuditLogEntryCreate,
  },
)

type ActionAuditLog = GuildAuditLogsEntry<
  | AuditLogEvent.MemberBanAdd
  | AuditLogEvent.MemberBanRemove
  | AuditLogEvent.MemberKick
  | AuditLogEvent.MemberUpdate
>

async function guildAuditLogEntryCreate(
  auditLogEntry: GuildAuditLogsEntry,
  guild: Guild,
) {
  switch (auditLogEntry.action) {
    case AuditLogEvent.MemberBanAdd:
    case AuditLogEvent.MemberBanRemove:
    case AuditLogEvent.MemberKick:
    case AuditLogEvent.MemberUpdate:
      await logMemberAction(auditLogEntry as ActionAuditLog, guild)
      return
  }
}

async function logMemberAction(auditLogEntry: ActionAuditLog, guild: Guild) {
  const config = await fetchActionLogConfigFor(guild.id, false)
  const logChannelID = config?.logChannelID
  if (!logChannelID) return

  const logChannel = guild.channels.cache.get(logChannelID)
  if (!logChannel?.isTextBased()) return

  const type = getLogAction(auditLogEntry, config)
  if (!type) return

  const entry: ActionLogEntry = {
    id: 0,
    action: type,
    user: auditLogEntry.target,
    reason: auditLogEntry.reason,
    reasonBy: auditLogEntry.executor,
    responsibleModerator: auditLogEntry.executor,
  }

  const nextActionID = await prisma.$transaction(async (tx) => {
    // So to create a new action, we need to:
    // 0. Figure out the next action ID to use in this guild
    // 1. Create a new action that's actionID + 1

    // 0.
    const latestActionInGuild = await tx.actionLog.findFirst({
      select: {
        actionID: true,
      },
      where: {
        guildID: guild.id,
      },
      orderBy: {
        actionID: 'desc',
      },
    })

    const nextActionID = (latestActionInGuild?.actionID ?? 0) + 1

    // 1.
    await tx.actionLog.create({
      data: {
        guildID: guild.id,
        actionID: nextActionID,
        version: 1,
        action: entry.action,
        userID: entry.user?.id ?? null,
        reason: entry.reason,
        reasonByID: entry.reasonBy?.id ?? null,
        moderatorID: entry.responsibleModerator?.id ?? null,
        channelID: logChannelID,
        // This specifically needs to be null, it's how we tell which version of the action is the latest
        validUntil: null,
      },
    })

    return nextActionID
  })

  await markActionlogArchiveDirty(guild.id)

  entry.id = nextActionID
  const log = formatToLog(entry)
  await logChannel
    .send({
      content: log,
      allowedMentions: {
        parse: [],
      },
    })
    .then((message) =>
      prisma.actionLog.update({
        where: {
          guildID_actionID_version: {
            guildID: guild.id,
            actionID: nextActionID,
            version: 1,
          },
        },
        data: {
          messageID: message.id,
        },
      }),
    )
    .catch(() => {
      // ignore, probably can't send
    })
}

function getLogAction(
  auditLogEntry: ActionAuditLog,
  config: ActionLogConfig,
): ActionLogEntry['action'] | null {
  if (config.logBans && auditLogEntry.action === AuditLogEvent.MemberBanAdd) {
    return 'ban'
  } else if (
    config.logUnbans &&
    auditLogEntry.action === AuditLogEvent.MemberBanRemove
  ) {
    return 'unban'
  } else if (
    config.logKicks &&
    auditLogEntry.action === AuditLogEvent.MemberKick
  ) {
    return 'kick'
  } else if (auditLogEntry.action === AuditLogEvent.MemberUpdate) {
    if (config.logTimeouts && isTimeout(auditLogEntry)) {
      return 'timeout'
    } else if (config.logTimeoutRemovals && isTimeoutRemoval(auditLogEntry)) {
      return 'timeout removed'
    }
  }

  return null
}

function isTimeout(auditLogEntry: ActionAuditLog): boolean {
  return auditLogEntry.changes.some(
    (change) =>
      change.key === 'communication_disabled_until' && change.new !== undefined,
  )
}

function isTimeoutRemoval(auditLogEntry: ActionAuditLog): boolean {
  return auditLogEntry.changes.some(
    (change) =>
      change.key === 'communication_disabled_until' && change.new === undefined,
  )
}

import {
  AuditLogEvent,
  type Client,
  type Guild,
  type GuildAuditLogsEntry,
  type PartialUser,
  type User,
} from 'discord.js'
import { SleetModule } from 'sleetcord'
import {
  type ChannelAuditLog,
  channelDelete,
  logChannelModified,
} from './channelModify.js'
import { logMemberTimeout, type TimeoutAuditLog } from './guildMemberTimeout.js'
import { type BanAuditLog, logMemberBanKick } from './memberBanKick.js'

export const logAuditLog = new SleetModule(
  {
    name: 'logAuditLog',
  },
  {
    guildAuditLogEntryCreate,
    channelDelete,
  },
)

async function guildAuditLogEntryCreate(
  auditLogEntry: GuildAuditLogsEntry,
  guild: Guild,
) {
  switch (auditLogEntry.action) {
    case AuditLogEvent.ChannelCreate:
    case AuditLogEvent.ChannelDelete:
    case AuditLogEvent.ChannelUpdate:
      await logChannelModified(auditLogEntry as ChannelAuditLog, guild)
      break

    case AuditLogEvent.MemberBanAdd:
    case AuditLogEvent.MemberBanRemove:
    case AuditLogEvent.MemberKick:
      await logMemberBanKick(auditLogEntry as BanAuditLog, guild)
      break

    case AuditLogEvent.MemberUpdate:
      await logMemberTimeout(auditLogEntry as TimeoutAuditLog, guild)
      break
  }
}

export async function resolveUser(
  maybeUser: User | PartialUser | null,
  maybeUserId: string | null,
  client: Client,
): Promise<User | null> {
  if (maybeUser === null || maybeUser.username === null) {
    return maybeUserId
      ? await client.users.fetch(maybeUserId).catch(() => null)
      : null
  }

  return maybeUser
}

import {
  Guild,
  GuildAuditLogsEntry,
  AuditLogEvent,
  GuildTextBasedChannel,
  User,
} from 'discord.js'
import { SleetModule } from 'sleetcord'
import { getValidatedConfigFor } from '../../utils.js'
import { ChannelAuditLog, logChannelModifed } from './channelModify.js'
import { ModLogConfig } from '@prisma/client'
import { BanAuditLog, logMemberBanKick } from './memberBanKick.js'

export const logAuditLog = new SleetModule(
  {
    name: 'logAuditLog',
  },
  {
    guildAuditLogEntryCreate,
  },
)

export interface AuditInfo {
  channel: GuildTextBasedChannel
  config: ModLogConfig
  guild: Guild
}

async function guildAuditLogEntryCreate(
  auditLogEntry: GuildAuditLogsEntry,
  guild: Guild,
) {
  const conf = await getValidatedConfigFor(guild)
  if (!conf) return

  const { config, channel } = conf
  const auditInfo: AuditInfo = { channel, config, guild }

  switch (auditLogEntry.action) {
    case AuditLogEvent.ChannelCreate:
    case AuditLogEvent.ChannelDelete:
    case AuditLogEvent.ChannelUpdate:
      await logChannelModifed(auditLogEntry as ChannelAuditLog, auditInfo)
      break

    case AuditLogEvent.MemberBanAdd:
    case AuditLogEvent.MemberBanRemove:
    case AuditLogEvent.MemberKick:
      await logMemberBanKick(auditLogEntry as BanAuditLog, auditInfo)
      break
  }
}

export async function resolveUser(
  maybeUser: User | null,
  maybeUserId: string | null,
  guild: Guild,
): Promise<User | null> {
  return (
    maybeUser ??
    (maybeUserId ? await guild.client.users.fetch(maybeUserId) : null)
  )
}

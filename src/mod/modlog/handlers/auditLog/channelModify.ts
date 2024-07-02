import {
  AuditLogEvent,
  BaseChannel,
  ChannelType,
  DMChannel,
  GuildAuditLogsEntry,
  GuildBasedChannel,
  LimitedCollection,
  NonThreadGuildBasedChannel,
  TextBasedChannel,
} from 'discord.js'
import { escapeAllMarkdown, formatUser } from 'sleetcord'
import { formatLog, getValidatedConfigFor } from '../../utils.js'
import { handleMessageDeleteBulk } from '../messageDeleteBulk.js'
import { AuditInfo, resolveUser } from './index.js'

export type ChannelAuditLog = GuildAuditLogsEntry<
  AuditLogEvent,
  'Create' | 'Delete' | 'Update',
  'Channel',
  | AuditLogEvent.ChannelCreate
  | AuditLogEvent.ChannelDelete
  | AuditLogEvent.ChannelUpdate
>

const tempStoredChannels = new LimitedCollection<
  string,
  NonThreadGuildBasedChannel & TextBasedChannel
>({
  maxSize: 10,
})

export async function channelDelete(
  channel: DMChannel | NonThreadGuildBasedChannel,
) {
  if (channel.isDMBased()) return
  const conf = await getValidatedConfigFor(channel.guild)
  if (!conf) return

  if (
    conf.config.channelDelete &&
    conf.config.messageDeleteBulk &&
    channel.isTextBased()
  ) {
    tempStoredChannels.set(channel.id, channel)
  }
}

export async function logChannelModified(
  auditLogEntry: ChannelAuditLog,
  { channel, config, guild }: AuditInfo,
) {
  if (
    (auditLogEntry.action === AuditLogEvent.ChannelCreate &&
      !config.channelCreate) ||
    (auditLogEntry.action === AuditLogEvent.ChannelDelete &&
      !config.channelDelete) ||
    (auditLogEntry.action === AuditLogEvent.ChannelUpdate &&
      !config.channelUpdate)
  ) {
    return
  }

  const modifiedChannel =
    auditLogEntry.target instanceof BaseChannel
      ? // If target is a channel
        (auditLogEntry.target as NonThreadGuildBasedChannel | TargetChannel)
      : auditLogEntry.targetId
        ? // Use our cache or try to fetch the channel from discord
          tempStoredChannels.get(auditLogEntry.targetId) ??
          (await guild.channels.fetch(auditLogEntry.targetId))
        : // Give up and use just the ID
          auditLogEntry.targetId

  const executor = await resolveUser(
    auditLogEntry.executor,
    auditLogEntry.executorId,
    guild.client,
  )
  const channelText = formatChannel(modifiedChannel)
  const verb = LogVerb[auditLogEntry.action]
  const execUser = executor ? formatUser(executor) : 'Unknown User'
  const changelog = auditLogEntry.changes
    .map((change) => {
      const log = [`=== ${change.key}:`]
      if (change.old !== undefined) {
        log.push(`- ${String(change.old).replace(/\n/g, '\n- ')}`)
      }

      if (change.new !== undefined) {
        log.push(`+ ${String(change.new).replace(/\n/g, '\n+ ')}`)
      }

      return log.join('\n')
    })
    .join('\n')

  const message = `${channelText} ${verb} by ${execUser}${
    changelog ? '\n```diff\n' + changelog.substring(0, 1800) + '\n```' : ''
  }`

  await channel.send({
    content: formatLog(
      LogEmoji[auditLogEntry.action],
      LogName[auditLogEntry.action],
      message,
    ),
    allowedMentions: { parse: [] },
  })

  if (
    auditLogEntry.action === AuditLogEvent.ChannelDelete &&
    modifiedChannel instanceof BaseChannel &&
    modifiedChannel.isTextBased()
  ) {
    await handleMessageDeleteBulk(
      modifiedChannel.messages.cache,
      modifiedChannel,
      true,
    )
  }

  if (
    auditLogEntry.targetId &&
    tempStoredChannels.has(auditLogEntry.targetId)
  ) {
    tempStoredChannels.delete(auditLogEntry.targetId)
  }
}

const LogEmoji = {
  [AuditLogEvent.ChannelCreate]: '🏠',
  [AuditLogEvent.ChannelDelete]: '🏚️',
  [AuditLogEvent.ChannelUpdate]: '🏡',
}

const LogName = {
  [AuditLogEvent.ChannelCreate]: 'Channel Created',
  [AuditLogEvent.ChannelDelete]: 'Channel Deleted',
  [AuditLogEvent.ChannelUpdate]: 'Channel Updated',
}

const LogVerb = {
  [AuditLogEvent.ChannelCreate]: 'created',
  [AuditLogEvent.ChannelDelete]: 'deleted',
  [AuditLogEvent.ChannelUpdate]: 'updated',
}

interface TargetChannel {
  id: string
  name: string
  type: ChannelType
  permission_overwrites: unknown[]
  nsfw: boolean
  rate_limit_per_user: number
  flags: number
}

function formatChannel(
  channel: GuildBasedChannel | TargetChannel | string | null,
): string {
  if (!channel) return 'Unknown Channel'

  if (typeof channel === 'string') return `<#${channel}>`

  const parent =
    'parent' in channel && channel.parent
      ? ` in ${formatChannel(channel.parent)}`
      : ''

  return `**${escapeAllMarkdown(channel.name)}** (${channel.id}) [\`${
    ChannelTypeNames[channel.type]
  }\`]${parent}`
}

const ChannelTypeNames: Record<ChannelType, string> = {
  [ChannelType.AnnouncementThread]: 'Announcement Thread',
  [ChannelType.DM]: 'DM',
  [ChannelType.GroupDM]: 'Group DM',
  [ChannelType.GuildAnnouncement]: 'Announcement',
  [ChannelType.GuildCategory]: 'Category',
  [ChannelType.GuildDirectory]: 'Directory',
  [ChannelType.GuildForum]: 'Forum',
  [ChannelType.GuildStageVoice]: 'Stage',
  [ChannelType.GuildText]: 'Text',
  [ChannelType.GuildVoice]: 'Voice',
  [ChannelType.PrivateThread]: 'Private Thread',
  [ChannelType.PublicThread]: 'Public Thread',
  [ChannelType.GuildMedia]: 'Media',
}

import {
  AttachmentPayload,
  AuditLogEvent,
  EmbedType,
  GuildAuditLogsFetchOptions,
  Message,
  PartialMessage,
  escapeCodeBlock,
} from 'discord.js'
import { SleetModule, formatUser } from 'sleetcord'
import { plural } from '../../../util/format.js'
import { editStore } from '../../unedit.js'
import { formatLog, formatTime, getValidatedConfigFor } from '../utils.js'

export const logMessageDelete = new SleetModule(
  {
    name: 'logMessageDelete',
  },
  {
    messageDelete,
  },
)

const lastDeleteEntry = new Map<string, string>()

async function messageDelete(message: Message | PartialMessage) {
  if (!message.guild) return

  const conf = await getValidatedConfigFor(message.guild)
  if (!conf) return

  const { config, channel } = conf

  if (!config.messageDelete) return

  if (message.partial) {
    const msg = `(${message.id}) (uncached) in ${
      message.channel
    } at \`${formatTime(message.createdAt)}\``

    await channel.send(formatLog('🗑️', 'Message deleted', msg))
    return
  }

  let executor, reason

  if (message.guild.members.me?.permissions.has('ViewAuditLog')) {
    // TODO: maybe listen to audit logs separately and keep a "cache" of delete logs to associate them?
    // Would have to deal with fuzzy timings, but would cut down on GETs
    const fetchOpts: GuildAuditLogsFetchOptions<AuditLogEvent.MessageDelete> = {
      type: AuditLogEvent.MessageDelete,
      limit: 1,
    }

    const lastEntry = lastDeleteEntry.get(message.guild.id)

    if (lastEntry) {
      fetchOpts.after = lastEntry
    }

    const auditLog = await message.guild.fetchAuditLogs(fetchOpts)
    const auditEntry = auditLog.entries.first()

    if (
      auditEntry?.target.id === message.author.id &&
      auditEntry.extra.channel.id === message.channel.id &&
      auditEntry.extra.count === 1 &&
      auditEntry.id !== lastEntry
    ) {
      executor = auditEntry.executor
      reason = auditEntry.reason
      lastDeleteEntry.set(message.guild.id, auditEntry.id)
    }
  }

  const edits = editStore.get(message.id)?.edits ?? []
  // Set to dedupe identical logs, often just discord editing in link embeds after the message was sent
  const editsLog = Array.from(
    new Set(
      [...edits.slice(0, -1), message].map((m, i) =>
        messageToLog(m, {
          username: false,
          id: false,
          includeAttachments: i === 0,
        }),
      ),
    ),
  )
  const attachProxy = message.attachments.map(
    (a) => `[${a.name}](<${a.proxyURL}>)`,
  )
  const stickers = message.stickers.map((s) => `[${s.name}](<${s.url}>)`)

  const messageContent = editsLog.join('\n')

  let msg =
    `(${message.id}) from ${formatUser(message.author)} in ${message.channel}` +
    (executor ? ` by ${formatUser(executor)}` : '') +
    (reason ? ` for "${reason}"` : '') +
    (editsLog.length > 1 ? `, ${plural('revision', editsLog.length)}` : '') +
    '\n' +
    (attachProxy.length > 0
      ? `Attachment Proxies: ${attachProxy.join(', ')}\n`
      : '') +
    (stickers.length > 0 ? `Stickers: ${stickers.join(', ')}\n` : '')

  // +250 to give us some more headroom
  const deletedMessageLength = messageContent.length + 250

  const files: AttachmentPayload[] = []

  if (deletedMessageLength + msg.length > 2000) {
    files.push({
      name: `deleted-message-by-${message.author.tag}-${message.author.id}.txt`,
      attachment: Buffer.from(messageContent),
      description: `Deleted Message by ${formatUser(message.author, {
        markdown: false,
        escape: false,
      })}`,
    })
  } else {
    msg += `\`\`\`\n${messageContent}\`\`\``
  }

  await channel.send({
    content: formatLog('🗑️', 'Message Deleted', msg),
    files,
  })
}

export function messageToLog(
  message: Message,
  {
    username = true,
    id = true,
    includeAttachments = true,
    includeEmbed = false,
  } = {},
): string {
  const embed = message.embeds.find((e) => e.data.type === EmbedType.Rich)
  const richEmbed = embed?.toJSON()

  return (
    `[${formatTime(message.editedAt ?? message.createdAt)}]` +
    (id ? '(' + message.id + ') ' : '') +
    `${
      username
        ? formatUser(message.author, {
            markdown: false,
            id: false,
            bidirectional: false,
            escape: false,
          }) + ' :'
        : ''
    } ${escapeCodeBlock(message.content)}` +
    (includeAttachments && message.attachments.size > 0
      ? ' | Attach: ' + message.attachments.map((a) => a.name).join(' ; ')
      : '') +
    (includeEmbed && richEmbed
      ? ' | RichEmbed: ' + escapeCodeBlock(JSON.stringify(richEmbed))
      : '')
  )
}

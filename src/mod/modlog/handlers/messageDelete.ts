import {
  AttachmentPayload,
  AuditLogEvent,
  Embed,
  GuildAuditLogsFetchOptions,
  GuildMember,
  InteractionType,
  Message,
  PartialMessage,
  User,
  codeBlock,
  escapeCodeBlock,
  escapeMarkdown,
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
      await Promise.all(
        [...edits.slice(0, -1), message].map((m, i) =>
          messageToLog(m, {
            includeInteraction: i === 0,
            includeReference: i === 0,
            includeUser: i === 0,
            includeTimestamp: i === 0,
            includeAttachments: false,
            includeEmbeds: i === 0,
            includePoll: i === 0,
            includeStickers: false,
          }),
        ),
      ),
    ),
  )
  const attachProxy = message.attachments.map(
    (a) => `[${escapeMarkdown(a.name)}](<${a.proxyURL}>)`,
  )
  const stickers = message.stickers.map(
    (s) => `[${escapeMarkdown(s.name)}](<${s.url}>)`,
  )

  const messageContent = editsLog.join('\n┈ ┈ ┈\n')

  let msg =
    `(${message.id}) in ${message.channel}` +
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
    msg += codeBlock(messageContent)
  }

  await channel.send({
    content: formatLog('🗑️', 'Message Deleted', msg),
    files,
  })
}

function formatLogUser(user: User | GuildMember) {
  return formatUser(user, {
    markdown: false,
    id: true,
    bidirectional: false,
    escape: false,
  })
}

export async function messageToLog(
  message: Message,
  {
    includeInteraction = true,
    includeReference = true,
    includeUser = true,
    includeTimestamp = true,
    includeAttachments = true,
    includeEmbeds = true,
    includeStickers = true,
    includePoll = true,
  } = {},
): Promise<string> {
  const lines: string[] = []

  if (includeInteraction && message.interaction) {
    const { interaction } = message

    lines.push(
      `╭╼ ${formatLogUser(interaction.user)} used ${interaction.type === InteractionType.ApplicationCommand ? '/' : ''}${interaction.commandName}`,
    )
  }

  if (includeReference && message.reference) {
    const ref = await message.fetchReference().catch(() => null)

    if (ref) {
      lines.push(
        `╭╼ Reply to ${formatLogUser(ref.author)}: ${ref.content.slice(0, 50)}${ref.content.length > 50 ? '…' : ''}`,
      )
    } else {
      lines.push(
        `╭╼ Original message was deleted (${message.reference.messageId})`,
      )
    }
  }

  if (includeUser) {
    const tags =
      (message.author.bot ? '[APP] ' : '') +
      (message.system ? '[SYSTEM] ' : '') +
      (message.webhookId ? '[WEBHOOK] ' : '') +
      (message.activity ? '[ACTIVITY] ' : '') +
      (message.hasThread ? '[THREAD] ' : '')

    const timestamp = includeTimestamp
      ? `[${formatTime(message.createdAt)}]`
      : ''

    lines.push(`◯ ${formatLogUser(message.author)} ${tags}${timestamp}`)
  } else if (includeTimestamp) {
    lines.push(`[${formatTime(message.createdAt)}]`)
  }

  if (message.content) {
    lines.push(`┊ ${escapeCodeBlock(message.content).split('\n').join('\n┊ ')}`)
  }

  if (includeEmbeds && message.embeds.length > 0) {
    lines.push(embedToLog(message.embeds[0]))

    if (message.embeds.length > 1) {
      lines.push(`╰╼ +${plural('embed', message.embeds.length - 1)} omitted`)
    }
  }

  if (includeAttachments && message.attachments.size > 0) {
    lines.push(
      `╰╼ Attachments: ${message.attachments.map((a) => a.name).join(', ')}`,
    )
  }

  if (includeStickers && message.stickers.size > 0) {
    lines.push(`╰╼ Stickers: ${message.stickers.map((s) => s.name).join(', ')}`)
  }

  if (includePoll && message.poll) {
    lines.push(`╰┮ Poll: ${message.poll.question.text}`)

    let current = 0
    const last = message.poll.answers.size

    for (const [, answer] of message.poll.answers) {
      current++
      lines.push(
        ` ${current === last ? '╰╼' : '├╼'} ${answer.text} (${answer.voteCount})`,
      )
    }
  }

  if (message.editedAt) {
    lines.push(`╰╼ Edited [${formatTime(message.editedAt)}]`)
  }

  return lines.join('\n')
}

const TL_CHAR = '╭'
const TR_CHAR = '╮'
const BL_CHAR = '╰'
const BR_CHAR = '╯'
const H_CHAR = '─'
const V_CHAR = '│'

function embedToLog(embed: Embed): string {
  let lines: string[] = []

  if (embed.author) {
    lines.push(`Author: ${embed.author.name}`)
  }

  if (embed.title) {
    lines.push(`Title: ${embed.title}`)
  }

  if (embed.description) {
    lines.push(`Description: ${embed.description}`)
  }

  for (const field of embed.fields) {
    lines.push(`${field.name}:\n┊ ${field.value.replaceAll('\n', '\n┊ ')}`)
  }

  if (embed.footer) {
    lines.push(`Footer: ${embed.footer.text}`)
  }

  if (embed.timestamp) {
    lines.push(`Timestamp: ${embed.timestamp}`)
  }

  if (embed.image) {
    lines.push(`Image: ${embed.image.url}`)
  }

  if (embed.thumbnail) {
    lines.push(`Thumbnail: ${embed.thumbnail.url}`)
  }

  lines = lines.flatMap((l) => l.split('\n'))

  const maxLineLength = Math.max(...lines.map((l) => l.length))
  const boxWidth = maxLineLength + 2

  for (let i = 0; i < lines.length; i++) {
    lines[i] = `${V_CHAR} ${lines[i].padEnd(maxLineLength)} ${V_CHAR}`
  }

  lines.unshift(`${TL_CHAR}${H_CHAR.repeat(boxWidth)}${TR_CHAR}`)
  lines.push(`${BL_CHAR}${H_CHAR.repeat(boxWidth)}${BR_CHAR}`)

  return lines.join('\n')
}

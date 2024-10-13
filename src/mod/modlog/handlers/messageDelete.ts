import {
  type AttachmentPayload,
  type Embed,
  EmbedBuilder,
  type GuildMember,
  InteractionType,
  type Message,
  MessageType,
  type PartialMessage,
  type User,
  cleanCodeBlockContent,
  codeBlock,
  escapeInlineCode,
  time,
} from 'discord.js'
import { SleetModule, formatUser } from 'sleetcord'
import { plural } from '../../../util/format.js'
import { addToEmbed } from '../../../util/quoteMessage.js'
import {
  type MessageDeleteAuditLog,
  deleteEvents,
} from '../../messageDeleteAuditLog.js'
import { editStore } from '../../unedit.js'
import {
  ANSI_REGEX,
  BackgroundColor,
  TextColor,
  ansiFormat,
} from '../ansiColors.js'
import { formatLog, formatTime, getValidatedConfigFor } from '../utils.js'

export const logMessageDelete = new SleetModule(
  {
    name: 'logMessageDelete',
  },
  {
    load: () => {
      deleteEvents.on('messageDeleteWithAuditLog', messageDeleteWithAuditLog)
      deleteEvents.registerSingle(needsAuditLog)
    },
    unload: () => {
      deleteEvents.off('messageDeleteWithAuditLog', messageDeleteWithAuditLog)
      deleteEvents.unregisterSingle(needsAuditLog)
    },
  },
)

async function needsAuditLog(message: Message | PartialMessage) {
  if (!message.guild) return false

  const conf = await getValidatedConfigFor(
    message.guild,
    'messageDelete',
    (config) => config.messageDelete,
  )
  if (!conf) return false

  return true
}

export async function messageDeleteWithAuditLog(
  message: Message | PartialMessage,
  auditLog: MessageDeleteAuditLog | null = null,
) {
  if (!message.guild) return

  const conf = await getValidatedConfigFor(
    message.guild,
    'messageDelete',
    (config) => config.messageDelete,
  )
  if (!conf) return

  const { channel } = conf

  if (message.partial) {
    const msg = `(\`${message.id}\`) uncached in ${
      message.channel
    } around ${message.url} sent ${time(message.createdAt, 'f')} `

    await channel.send({
      content: formatLog('🗑️', 'Message deleted', msg),
      allowedMentions: { parse: [] },
    })
    return
  }

  const edits = editStore.get(message.id)?.edits ?? []
  // Set to dedupe identical logs, often just discord editing in link embeds after the message was sent

  const formattedLogs = await Promise.all(
    [...edits.slice(0, -1), message].map((m, i) =>
      messageToLog(m, {
        includeInteraction: i === 0,
        includeReference: i === 0,
        includeUser: i === 0,
        includeTimestamp: i === 0,
        includeAttachments: false,
        includeEmbeds: true,
        includePoll: i === 0,
        includeStickers: false,
      }),
    ),
  )

  const editsLog: string[] = formattedLogs
    .map((v, i, arr) => {
      const keep: string[] = []

      if (i === 0) {
        keep.push(v.header, v.content, v.footer)
      } else {
        if (v.header !== arr[i - 1].header) {
          keep.push(v.header)
        }
        if (v.content !== arr[i - 1].content) {
          keep.push(v.content)
        }
        if (v.footer !== arr[i - 1].footer) {
          keep.push(v.footer)
        }
      }

      return keep
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
        .join('\n')
    })
    .filter((v) => v.length > 0)

  const attachProxy = message.attachments.map((a) =>
    formatEscapedLink(a.name, a.proxyURL),
  )
  const stickers = message.stickers.map((s) => formatEscapedLink(s.name, s.url))

  const messageContent = editsLog.join('\n┈ ┈ ┈\n')

  const { executor, reason } = auditLog ?? {}

  let msg = `(${message.id}) in ${message.channel} around ${message.url} sent ${time(message.createdAt, 'f')}${executor ? ` by ${formatUser(executor)}` : ''}${reason ? ` for "${reason}"` : ''}${editsLog.length > 1 ? `, ${plural('revision', editsLog.length)}` : ''}\n${
    attachProxy.length > 0
      ? `Attachment Proxies: ${attachProxy.join(', ')}\n`
      : ''
  }${stickers.length > 0 ? `Stickers: ${stickers.join(', ')}\n` : ''}`

  // +100 to give us some more headroom
  const deletedMessageLength = messageContent.length + 100

  const files: AttachmentPayload[] = []

  if (deletedMessageLength + msg.length > 2000) {
    files.push({
      name: `deleted-message-by-${message.author.tag}-${message.author.id}.txt`,
      attachment: Buffer.from(
        messageContent.replaceAll(ANSI_REGEX, ''),
        'utf-8',
      ),
      description: `Deleted Message by ${formatUser(message.author, {
        markdown: false,
        escapeMarkdown: false,
      })}`,
    })
  } else {
    msg += codeBlock('ansi', cleanCodeBlockContent(messageContent))
  }

  await channel.send({
    content: formatLog('🗑️', 'Message Deleted', msg),
    files,
    allowedMentions: { parse: [] },
  })
}

function formatLogUser(user: User | GuildMember) {
  return formatUser(user, {
    markdown: false,
    id: true,
    bidirectional: false,
    escapeMarkdown: false,
    format: (part, str) => {
      if (str === null) return null

      switch (part) {
        case 'globalName':
        case 'discriminator':
          return ansiFormat(TextColor.Green, str)
        case 'username':
          return ansiFormat(TextColor.Yellow, str)
        case 'id':
          return ansiFormat(TextColor.Cyan, str)
        default:
          return str
      }
    },
  })
}

interface LogMessageOptions {
  /** Include `╭╼ User [username] (id) used /commandName` */
  includeInteraction?: boolean
  /** Include `╭╼ Reply to User [username] (id): Message content */
  includeReference?: boolean
  /** Include `◯ User [username] (id) [TAG...]` */
  includeUser?: boolean
  /** Include `[TIMESTAMP]`, either appended to user line or alone */
  includeTimestamp?: boolean
  /** Include a text version of the first embed, if any. Additional embeds shown as: `╰╼ + X more embeds` */
  includeEmbeds?: boolean
  /** Include `╰╼ Attachments: fileName.png, fileName.jpg` */
  includeAttachments?: boolean
  /** Include `╰╼ Stickers: sticker, sticker2 */
  includeStickers?: boolean
  /** Include `╰┮ Poll: Question` followed by `├╼ Answer (votes)` */
  includePoll?: boolean
}

interface MessageLogOutput {
  header: string
  content: string
  footer: string
}

const TAG_APP = `[${ansiFormat(TextColor.Pink, 'APP')}] `
const TAG_SYSTEM = `[${ansiFormat(TextColor.Pink, 'SYSTEM')}] `
const TAG_WEBHOOK = `[${ansiFormat(TextColor.Pink, 'WEBHOOK')}] `
const TAG_ACTIVITY = `[${ansiFormat(TextColor.Pink, 'ACTIVITY')}] `
const TAG_THREAD = `[${ansiFormat(TextColor.Pink, 'THREAD')}] `

export async function messageToLog(
  message: Message,
  {
    includeInteraction = true,
    includeReference = true,
    includeUser = true,
    includeTimestamp = true,
    includeEmbeds = true,
    includeAttachments = true,
    includeStickers = true,
    includePoll = true,
  }: LogMessageOptions = {},
): Promise<MessageLogOutput> {
  const lines: string[] = []

  if (includeInteraction && message.interaction) {
    const { interaction } = message

    const commandName =
      (interaction.type === InteractionType.ApplicationCommand ? '/' : '') +
      interaction.commandName

    lines.push(
      `╭╼ ${formatLogUser(interaction.user)} used ${ansiFormat(TextColor.Blue, commandName)}`,
    )
  }

  if (includeReference && message.reference?.messageId) {
    const ref = await message.fetchReference().catch(() => null)

    if (ref) {
      const preview =
        cleanCodeBlockContent(ref.content.replaceAll(/\n/g, ' ').slice(0, 50)) +
        (ref.content.length > 50 ? '…' : '')

      lines.push(
        `╭╼ Reply to ${formatLogUser(ref.author)}: ${ansiFormat(BackgroundColor.FireflyDarkBlue, preview)}`,
      )
    } else {
      lines.push(
        `╭╼ Original message was deleted (${message.reference.messageId})`,
      )
    }
  }

  if (includeUser) {
    const tags =
      (message.author.bot ? TAG_APP : '') +
      (message.system ? TAG_SYSTEM : '') +
      (message.webhookId ? TAG_WEBHOOK : '') +
      (message.activity ? TAG_ACTIVITY : '') +
      (message.hasThread ? TAG_THREAD : '')

    const timestamp = includeTimestamp
      ? `[${ansiFormat(TextColor.Blue, formatTime(message.createdAt))}]`
      : ''

    lines.push(`◯ ${formatLogUser(message.author)} ${tags}${timestamp}`)
  } else if (includeTimestamp) {
    lines.push(`[${ansiFormat(TextColor.Blue, formatTime(message.createdAt))}]`)
  }

  const header = lines.join('\n').trim()
  lines.splice(0, lines.length)

  if (
    ![
      MessageType.Default,
      MessageType.Reply,
      MessageType.ChatInputCommand,
      MessageType.ContextMenuCommand,
    ].includes(message.type)
  ) {
    const embed = new EmbedBuilder()
    await addToEmbed(message, embed)
    if (embed.data.description) {
      lines.push(
        `╞ ${cleanCodeBlockContent(embed.data.description).split('\n').join('\n╞ ')}`,
      )
    }
  } else if (message.content) {
    lines.push(
      `┊ ${cleanCodeBlockContent(message.content).split('\n').join('\n┊ ')}`,
    )
  }

  const content = lines.join('\n').trim()
  lines.splice(0, lines.length)

  if (includeEmbeds && message.embeds.length > 0) {
    lines.push(embedToLog(message.embeds[0], { minimal: true }))

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
        ` ${current === last ? '╰╼' : '├╼'} ${answer.text} (${ansiFormat(TextColor.Cyan, answer.voteCount)})`,
      )
    }
  }

  if (message.editedAt) {
    lines.push(
      `╰╼ Edited [${ansiFormat(TextColor.Blue, formatTime(message.editedAt))}]`,
    )
  }

  const footer = lines.join('\n').trim()

  return {
    header,
    content,
    footer,
  }
}

const TL_CHAR = '╭'
const TR_CHAR = '╮'
const BL_CHAR = '╰'
const BR_CHAR = '╯'
const H_CHAR = '─'
const V_CHAR = '│'

interface ToEmbedOptions {
  minimal?: boolean
}

function embedToLog(
  embed: Embed,
  { minimal = false }: ToEmbedOptions = {},
): string {
  let lines: string[] = []

  if (embed.author) {
    lines.push(`${ansiFormat(TextColor.Green, 'Author:')} ${embed.author.name}`)
  }

  if (embed.title) {
    lines.push(`${ansiFormat(TextColor.Green, 'Title:')} ${embed.title}`)
  }

  if (embed.description) {
    lines.push(
      `${ansiFormat(TextColor.Green, 'Description:')} ${embed.description.replaceAll('\n', '\n┊ ')}`,
    )
  }

  for (const field of embed.fields) {
    lines.push(
      `${ansiFormat(TextColor.Yellow, field.name)}:\n┊ ${field.value.replaceAll('\n', '\n┊ ')}`,
    )
  }

  if (embed.footer) {
    lines.push(`${ansiFormat(TextColor.Green, 'Footer:')} ${embed.footer.text}`)
  }

  if (embed.timestamp) {
    lines.push(
      `${ansiFormat(TextColor.Green, 'Timestamp:')} ${embed.timestamp}`,
    )
  }

  if (embed.image) {
    lines.push(`${ansiFormat(TextColor.Green, 'Image:')} ${embed.image.url}`)
  }

  if (embed.thumbnail) {
    lines.push(
      `${ansiFormat(TextColor.Green, 'Thumbnail:')} ${embed.thumbnail.url}`,
    )
  }

  lines = lines.flatMap((l) => l.split('\n'))

  if (minimal) {
    for (let i = 0; i < lines.length; i++) {
      lines[i] = `${ansiFormat(TextColor.Cyan, V_CHAR)} ${lines[i]}`
    }

    lines.unshift(
      ansiFormat(TextColor.Cyan, `${TL_CHAR}${H_CHAR} Embed ${H_CHAR}`),
    )
    lines.push(ansiFormat(TextColor.Cyan, `${BL_CHAR}${H_CHAR.repeat(9)}`))
  } else {
    const maxLineLength = Math.max(...lines.map((l) => l.length), 0)
    const boxWidth = maxLineLength + 2

    for (let i = 0; i < lines.length; i++) {
      lines[i] = `${V_CHAR} ${lines[i].padEnd(maxLineLength)} ${V_CHAR}`
    }

    lines.unshift(`${TL_CHAR}${H_CHAR.repeat(boxWidth)}${TR_CHAR}`)
    lines.push(`${BL_CHAR}${H_CHAR.repeat(boxWidth)}${BR_CHAR}`)
  }

  return lines.join('\n')
}

function formatEscapedLink(text: string, url: string): string {
  return `[\`${escapeInlineCode(text)}\`](<${url}>)`
}

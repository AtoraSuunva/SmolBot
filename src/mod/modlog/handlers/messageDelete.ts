import { stripVTControlCharacters } from 'node:util'
import {
  ApplicationCommandType,
  type AttachmentPayload,
  ButtonStyle,
  ComponentType,
  cleanCodeBlockContent,
  codeBlock,
  type Embed,
  EmbedBuilder,
  escapeInlineCode,
  InteractionType,
  Message,
  MessageFlags,
  MessageReferenceType,
  type MessageSnapshot,
  MessageType,
  type PartialMessage,
  time,
} from 'discord.js'
import type { APIMessageInteractionMetadata } from 'discord-api-types/v10'
import { formatUser, SleetModule } from 'sleetcord'
import {
  ansiFormat,
  BackgroundColor,
  type Markup,
  TextColor,
} from '../../../helpers/ansiColors.js'
import type { AnyComponent } from '../../../helpers/components.js'
import { plural } from '../../../helpers/format.js'
import { addToEmbed } from '../../../helpers/quoteMessage.js'
import {
  deleteEvents,
  type MessageDeleteAuditLog,
} from '../../messageDeleteAuditLog.js'
import { editStore } from '../../unedit.js'
import {
  formatLog,
  formatTime,
  getModlogTicketQueue,
  getValidatedConfigFor,
} from '../utils.js'
import type { MessageWithRaw } from './messageDeleteBulk.js'

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

  const eventDate = new Date()
  using ticket = getModlogTicketQueue(message.guild).acquireTicket()

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

    await ticket.waitUntilFirst()
    await channel.send({
      content: formatLog('🗑️', 'Message deleted', msg, eventDate),
      allowedMentions: { parse: [] },
    })
    return
  }

  const edits = editStore.get(message.id)?.edits ?? []

  const attachProxy = message.attachments.map((a) =>
    formatEscapedLink(a.name, a.proxyURL),
  )

  const forwardedAttach = message.messageSnapshots
    .values()
    .flatMap((m) => m.attachments.map((a) => formatEscapedLink(a.name, a.url)))
    .toArray()

  const stickers = message.stickers.map((s) => formatEscapedLink(s.name, s.url))

  const messageContent = await messageArrayToLog([
    ...edits.slice(0, -1),
    message,
  ])

  const { executor, reason } = auditLog ?? {}

  let msg = `(${message.id}) in ${message.channel ?? '#deleted-channel'}${message.channel ? ` around ${message.url}` : ''} sent ${time(message.createdAt, 'f')}${executor ? ` by ${formatUser(executor)}` : ''}${reason ? ` for "${reason}"` : ''}${edits.length > 1 ? `, ${plural('revision', edits.length)}` : ''} (uid: \`${message.author.id}\`)\n${
    attachProxy.length > 0
      ? `Attachment Proxies: ${attachProxy.join(', ')}\n`
      : ''
  }${
    forwardedAttach.length > 0
      ? `Forwarded Attachments: ${forwardedAttach.join(', ')}\n`
      : ''
  }${stickers.length > 0 ? `Stickers: ${stickers.join(', ')}\n` : ''}`

  const formatted = codeBlock('ansi', cleanCodeBlockContent(messageContent))
  const files: AttachmentPayload[] = []

  if (formatted.length + msg.length > 1850) {
    files.push({
      name: `deleted-message-by-${message.author.tag}-${message.author.id}.txt`,
      attachment: Buffer.from(
        stripVTControlCharacters(messageContent),
        'utf-8',
      ),
      description: `Deleted Message by ${formatUser(message.author, {
        markdown: false,
        escapeMarkdown: false,
      })}`,
    })
  } else {
    msg += formatted
  }

  await ticket.waitUntilFirst()
  await channel.send({
    content: formatLog('🗑️', 'Message Deleted', msg, eventDate).slice(0, 2000),
    files,
    allowedMentions: { parse: [] },
  })
}

function formatLogUser(user: Parameters<typeof formatUser>[0]) {
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

export async function messageArrayToLog(messages: Message[]): Promise<string> {
  const formattedLogs = await Promise.all(
    messages.map((m, i) =>
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

  return editsLog.join('\n╭┈┄╌\n')
}

interface LogMessageOptions {
  /** Include `╭╼ User [username] (id) used /commandName` */
  includeInteraction?: boolean
  /** Include `╭╼ Reply to User [username] (id): Message content` OR `╭→ Forwarded` */
  includeReference?: boolean
  /** Include `◯ User [username] (id) [TAG...]` */
  includeUser?: boolean
  /** Include `[TIMESTAMP]`, either appended to user line or alone */
  includeTimestamp?: boolean
  /** Include `╰╼ Attachments: fileName.png, fileName.jpg` */
  includeAttachments?: boolean
  /** Include a text version of the first embed, if any. Additional embeds shown as: `╰╼ + X more embeds` */
  includeEmbeds?: boolean
  /** Include `╰┮ Components:` followed by `├╼ [Button] [Button]` */
  includeComponents?: boolean
  /** Include `╰╼ Stickers: sticker, sticker2 */
  includeStickers?: boolean
  /** Include `╰┮ Poll: Question` followed by `├╼ Answer (votes)` */
  includePoll?: boolean
  /** String to use for the left line, default `┊` */
  leftLine?: string
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

interface APIUndocumentedInteractionMetadataExtension {
  command_type: ApplicationCommandType
  name: string
}

type APIUndocumentedInteractionMetadata = APIMessageInteractionMetadata &
  APIUndocumentedInteractionMetadataExtension

function formatCommandName(name: string, type: ApplicationCommandType): string {
  switch (type) {
    case ApplicationCommandType.ChatInput:
      return `/${name}`
    case ApplicationCommandType.User:
      return `${name} › User`
    case ApplicationCommandType.Message:
      return `${name} › Message`
    case ApplicationCommandType.PrimaryEntryPoint:
      return `${name} › Entry Point`
    default:
      return name
  }
}

export async function messageToLog(
  message: Message | MessageSnapshot,
  {
    includeInteraction = true,
    includeReference = true,
    includeUser = true,
    includeTimestamp = true,
    includeAttachments = true,
    includeEmbeds = true,
    includeComponents = true,
    includeStickers = true,
    includePoll = true,
    leftLine = '┊',
  }: LogMessageOptions = {},
): Promise<MessageLogOutput> {
  const lines: string[] = []
  let hasUpper = false
  let messageCommand = false
  let isFollowUp = false

  if (includeInteraction && message.interactionMetadata) {
    const { interactionMetadata } = message
    // witness the beauty of working with undocumented properties, thank you discord
    const raw = (message as unknown as MessageWithRaw).rawData
    const rawIM =
      raw?.interaction_metadata as unknown as APIUndocumentedInteractionMetadata

    messageCommand = rawIM.command_type === ApplicationCommandType.Message
    isFollowUp = !!rawIM.original_response_message_id

    const commandName = formatCommandName(rawIM.name, rawIM.command_type)

    lines.push(
      `╭╼ ${formatLogUser(interactionMetadata.user)} used ${ansiFormat(TextColor.Blue, commandName)}`,
    )
    hasUpper = true

    if (rawIM && rawIM.type === InteractionType.ApplicationCommand) {
      if (rawIM.target_user) {
        lines.push(`├╼ On user ${formatLogUser(rawIM.target_user)}`)
      }
    }
  }

  const earlyContent: string[] = []

  if (includeReference && message.reference) {
    switch (message.reference.type) {
      case MessageReferenceType.Default: {
        const ref = await message.fetchReference?.().catch(() => null)

        if (!ref) {
          lines.push(
            `${hasUpper ? '├' : '╭'}╼ Original message was deleted${isFollowUp ? ' or ephemeral' : ''} (${message.reference.messageId})`,
          )
          hasUpper = true
          break
        }

        const preview =
          cleanCodeBlockContent(
            ref.content.replaceAll(/\n/g, ' ').slice(0, 50),
          ) + (ref.content.length > 50 ? '…' : '')

        lines.push(
          `${hasUpper ? '├' : '╭'}╼ ${messageCommand ? 'On message' : 'Reply to'} ${formatLogUser(ref.author)}: ${ansiFormat(BackgroundColor.FireflyDarkBlue, preview)}`,
        )
        hasUpper = true
        break
      }

      case MessageReferenceType.Forward: {
        earlyContent.push(`╭→ ${ansiFormat(TextColor.Gray, 'Forwarded')}`)
        const snapshot = message.messageSnapshots?.first()

        if (!snapshot) {
          earlyContent.push(
            ansiFormat(TextColor.Red, 'Forward was missing message snapshot'),
          )
          break
        }

        const formattedForward = await messageToLog(snapshot, {
          includeInteraction: false,
          includeReference: false,
          includeTimestamp: false,
          includeUser: false,
          leftLine: '│',
        })

        const channel = await message.guild?.channels
          .fetch(message.reference.channelId)
          .catch(() => null)

        const context = channel
          ? `│ ${ansiFormat(TextColor.Gray, `#${channel.name} (${channel.id}) • ${formatTime(snapshot.createdAt)}`)}`
          : ''

        const content =
          `${formattedForward.header}\n${formattedForward.content || '│'}\n${context}`.trim()
        earlyContent.push(`${content}\n${formattedForward.footer}`.trim())
        break
      }
    }
  }

  if (includeUser && message.author) {
    const tags =
      (message.author?.bot ? TAG_APP : '') +
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

  const IsComponentsV2 = message.flags.has(MessageFlags.IsComponentsV2)
  const componentsV2Render = IsComponentsV2
    ? message.components.map(componentToLog)
    : []

  if (
    ![
      MessageType.Default,
      MessageType.Reply,
      MessageType.ChatInputCommand,
      MessageType.ContextMenuCommand,
    ].includes(message.type) &&
    message instanceof Message
  ) {
    const embed = new EmbedBuilder()
    await addToEmbed(message, embed)
    if (embed.data.description) {
      lines.push(
        `╞ ${cleanCodeBlockContent(embed.data.description).split('\n').join('\n╞ ')}`,
      )
    }
  } else if (
    message.content ||
    earlyContent.length > 0 ||
    componentsV2Render.length > 0
  ) {
    const toRender = [
      ...(message.content ? message.content.split('\n') : []),
      ...earlyContent.flatMap((l) => l.split('\n')),
      ...componentsV2Render.flatMap((l) => l.split('\n')),
    ]

    lines.push(
      `${leftLine} ${cleanCodeBlockContent(toRender.join(`\n${leftLine} `))}`,
    )
  }

  const content = lines.join('\n').trim()
  lines.splice(0, lines.length)

  if (includeAttachments && message.attachments.size > 0) {
    lines.push(
      `╰╼ Attachments: ${message.attachments.map((a) => a.name).join(', ')}`,
    )
  }

  if (includeEmbeds && message.embeds.length > 0) {
    lines.push(embedToLog(message.embeds[0], { minimal: true }))

    if (message.embeds.length > 1) {
      lines.push(
        `╰╼ +${plural('embed', message.embeds.length - 1, { boldNumber: false })} omitted`,
      )
    }
  }

  // Renders components for components v1
  if (includeComponents && message.components.length > 0 && !IsComponentsV2) {
    lines.push('╰┮ Components:')

    const length = message.components.length
    const last = length - 1

    const formatted = message.components.map(
      (v, i) => ` ${i === last ? '╰╼' : '├╼'} ${componentToLog(v)}`,
    )

    lines.push(...formatted)
  }

  if (includeStickers && message.stickers.size > 0) {
    lines.push(`╰╼ Stickers: ${message.stickers.map((s) => s.name).join(', ')}`)
  }

  if (includePoll && message.poll) {
    lines.push(`╰┮ Poll: ${message.poll.question.text}`)

    const last = message.poll.answers.lastKey()

    for (const [key, answer] of message.poll.answers) {
      lines.push(
        ` ${key === last ? '╰╼' : '├╼'} ${answer.text} (${ansiFormat(TextColor.Cyan, answer.voteCount)})`,
      )
    }
  }

  if (message.editedAt) {
    lines.push(
      `╰╼ Edited [${ansiFormat(TextColor.Blue, formatTime(message.editedAt))}]`,
    )
  }

  const hasMultipleFooter = lines.filter((l) => l.startsWith('╰')).length > 1

  if (hasMultipleFooter) {
    for (let i = 0; i < lines.length - 1; i++) {
      lines[i] = lines[i].replace(/^╰/, '├')
    }
  }

  const footer = lines.join('\n').trim()

  return {
    header,
    content,
    footer,
  }
}

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
      lines[i] = `┊ ${ansiFormat(TextColor.Cyan, '│')} ${lines[i]}`
    }

    lines.unshift(`┊ ${ansiFormat(TextColor.Cyan, '╭─ Embed ┈┄╌')}`)
    lines.push(`┊ ${ansiFormat(TextColor.Cyan, '╰────────┈┄╌')}`)
  } else {
    const maxLineLength = Math.max(...lines.map((l) => l.length), 0)
    const boxWidth = maxLineLength + 2

    for (let i = 0; i < lines.length; i++) {
      lines[i] = `┊ │ ${lines[i].padEnd(maxLineLength)} │`
    }

    lines.unshift(`┊ ╭${'─'.repeat(boxWidth)}╮`)
    lines.push(`┊ ╰${'─'.repeat(boxWidth)}╯`)
  }

  return lines.join('\n')
}

const buttonStyleColor: Record<ButtonStyle, Markup | Markup[]> = {
  [ButtonStyle.Primary]: [BackgroundColor.Indigo, TextColor.White],
  [ButtonStyle.Secondary]: [BackgroundColor.MarbleBlue, TextColor.White],
  [ButtonStyle.Success]: TextColor.Green,
  [ButtonStyle.Danger]: [BackgroundColor.Orange, TextColor.White],
  [ButtonStyle.Link]: [BackgroundColor.MarbleBlue, TextColor.White],
  [ButtonStyle.Premium]: [BackgroundColor.Indigo, TextColor.White],
}

function componentToLog(component: AnyComponent): string {
  switch (component.type) {
    case ComponentType.ActionRow:
      // <Component/> <Component/> <Component/>
      return component.components.map((c) => componentToLog(c)).join(' ')

    case ComponentType.Button:
      // [💀 Button!] [Second!]
      return ansiFormat(
        buttonStyleColor[component.style],
        `[${component.emoji?.name && !component.emoji.id ? `${component.emoji.name} ` : ''}${component.label}]`,
      )

    case ComponentType.StringSelect:
    case ComponentType.UserSelect:
    case ComponentType.RoleSelect:
    case ComponentType.MentionableSelect:
    case ComponentType.ChannelSelect:
      // [Select Placeholder ∨]
      return ansiFormat(
        [BackgroundColor.FireflyDarkBlue, TextColor.White],
        `[${component.placeholder ?? component.customId} ∨]`,
      )

    case ComponentType.Section: {
      // ╭─ Section ┈┄╌
      // ├╼ <Accessory/>
      // │ <Text/>
      // │ <Button/> <Button/>
      // ╰──────────┈┄╌
      const components = component.components.map(componentToLog).join('\n│ ')

      return `╭─ Section ┈┄╌\n├╼ ${ansiFormat(TextColor.Green, componentToLog(component.accessory))}\n│ ${components}\n╰──────────┈┄╌`
    }

    case ComponentType.TextDisplay:
      // <Text/>
      return component.data.content

    case ComponentType.Thumbnail:
      // [Thumbnail] <url/>
      return `[Thumbnail] ${ansiFormat(TextColor.Gray, component.media.url)}`

    case ComponentType.MediaGallery:
      // [Media] <url/> [Media] <url/> [Media] <url/>
      return component.items
        .map((i) => `[Media] ${ansiFormat(TextColor.Gray, i.media.url)}`)
        .join(' ')

    case ComponentType.File:
      // [File] <url/>
      return `[File] ${ansiFormat(TextColor.Gray, component.file.data.url)}`

    case ComponentType.Separator:
      // ──────────
      return ansiFormat(TextColor.Gray, '──────────')

    case ComponentType.Container: {
      // ╭─ Container ┈┄╌
      // │ <Button/> <Button/>
      // │ <Text/>
      // ╰────────────┈┄╌
      const components = component.components.map(componentToLog).join('\n│ ')

      return `╭─ Container ┈┄╌\n│ ${components}\n╰────────────┈┄╌`
    }

    default:
      return ansiFormat(TextColor.Red, '[Unknown Component]')
  }
}

function formatEscapedLink(text: string, url: string): string {
  return `[\`${escapeInlineCode(text)}\`](<${url}>)`
}

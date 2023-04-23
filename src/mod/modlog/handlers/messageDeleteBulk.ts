import {
  AttachmentPayload,
  Channel,
  Collection,
  Message,
  PartialMessage,
  User,
  MessageMentions,
} from 'discord.js'
import { SleetModule, formatUser } from 'sleetcord'
import { formatLog, getValidatedConfigFor } from '../utils.js'
import { notNullish } from '../../../util/format.js'
import { messageToLog } from './messageDelete.js'

export const logMessageDeleteBulk = new SleetModule(
  {
    name: 'logMessageDeleteBulk',
  },
  {
    messageDeleteBulk: handleMessageDeleteBulk,
  },
)

async function handleMessageDeleteBulk(
  messages: Collection<string, Message | PartialMessage>,
) {
  const firstMessage = messages.first()
  if (!firstMessage) return
  if (!firstMessage.guild) return

  const conf = await getValidatedConfigFor(firstMessage.guild)
  if (!conf) return

  const { config, channel } = conf
  if (!config.messageDeleteBulk) return

  const sortedMessages = messages.sort(
    (a, b) => a.createdTimestamp - b.createdTimestamp,
  )
  const users = new Set(sortedMessages.map((m) => m.author))
  const messagesPerUser = new Map<User, number>()

  for (const message of sortedMessages.values()) {
    if (message.author === null) continue
    const count = messagesPerUser.get(message.author) ?? 0
    messagesPerUser.set(message.author, count + 1)
  }

  const userList = Array.from(users)
    .map((u) =>
      u
        ? `${formatUser(u, {
            mention: false,
          })} \`[${messagesPerUser.get(u)}]\``
        : 'Unknown User',
    )
    .join(', ')
    .substring(0, 1024)

  const logMessage = `${firstMessage.channel}, **${messages.size}** messages\n${userList}`
  const messageContent = messageLog(messages)
  const files: AttachmentPayload[] = [
    {
      name: FILENAME,
      attachment: Buffer.from(messageContent),
      description: 'Log of bulk-deleted messages',
    },
  ]

  const sentMessage = await channel.send({
    content: formatLog('🔥', 'Channel Purged', logMessage),
    files,
  })

  const attachmentUrl = sentMessage.attachments.first()?.url

  if (attachmentUrl) {
    const [channelId, attachmentId] = attachmentUrl.split('/').slice(-3)

    sentMessage.edit({
      content: `${sentMessage.content}\n<${generateArchiveUrl(
        channelId,
        attachmentId,
      )}>`,
      files,
    })
  }
}

function messageLog(
  messages: Collection<string, Message | PartialMessage>,
): string {
  const firstMessage = messages.first()
  if (!firstMessage) return ''

  const authors = new Set(messages.map((m) => m.author).filter(notNullish))
  const channels = extractMentions(messages, 'channels')
  const roles = extractMentions(messages, 'roles')
  const users = extractMentions(messages, 'users')

  const header =
    `[${firstMessage.guild ? firstMessage.guild.name : 'DM'} (${
      firstMessage.guild ? firstMessage.guild.id : firstMessage.channel.id
    }); ` +
    ('name' in firstMessage.channel
      ? `#${firstMessage.channel.name} (${firstMessage.channel.id})`
      : `@${firstMessage.channel.recipient?.tag} (${firstMessage.channel.recipient?.id})`) +
    ']\n' +
    mentionArray(authors, 'tag') +
    mentionArray(users, 'tag') +
    channelMentions(channels) +
    mentionArray(roles, 'name') +
    '\n'

  const messageContent = messages
    .filter((m): m is Message => !m.partial)
    .map((m) =>
      messageToLog(m, {
        id: true,
        username: true,
        includeAttachments: true,
        includeEmbed: true,
      }),
    )
    .join('\n')

  return `${header}${messageContent}`
}

type KeysOfType<T, KT> = {
  [K in keyof T]: T[K] extends KT ? K : never
}[keyof T]

type GetMapValue<M extends Map<unknown, unknown>> = M extends Map<
  unknown,
  infer V
>
  ? V
  : never

function extractMentions<
  K extends KeysOfType<MessageMentions, Collection<string, unknown>>,
  R extends MessageMentions[K],
  V extends GetMapValue<R>,
>(messages: Collection<string, Message | PartialMessage>, key: K): Set<V> {
  // casts since typescript apparently can correctly resolve K, R, and V completely fine, but
  // then believes that flatMap HAS to return a Collection<string, User | Channel | Role...> and possibly nothing else
  // even AFTER it goddamn inferred EXACTLY what `m.mentions[key]` should return
  return new Set(
    messages
      .flatMap((m): Collection<string, unknown> => m.mentions[key])
      .values() as IterableIterator<V>,
  )
}

function mentionArray<V extends { id: string }, N extends keyof V>(
  set: Set<V>,
  key: N,
): string {
  return `[${Array.from(set)
    .map((s) => `${s[key]} (${s.id})`)
    .join('; ')}]\n`
}

function channelMentions(set: Set<Channel>): string {
  return `[${Array.from(set)
    .map((s) => `${'name' in s ? s.name : s.recipient?.tag} (${s.id})`)
    .join('; ')}]\n`
}

const archiveViewer = 'https://giraffeduck.com/api/log/'
const FILENAME = 'archive.dlog.txt'
const generateArchiveUrl = (channelId: string, attachmentId: string) =>
  `${archiveViewer}${channelId}-${attachmentId}`

import {
  APIChannel,
  APIGuild,
  APIGuildMember,
  APIMessage,
  APIRole,
  APIUser,
  AttachmentPayload,
  ChannelType,
  GuildTextBasedChannel,
  Message,
  PartialMessage,
  ReadonlyCollection,
  User,
} from 'discord.js'
import { SleetModule, formatUser } from 'sleetcord'
import { notNullish } from 'sleetcord-common'
import { formatLog, getValidatedConfigFor } from '../utils.js'

export const logMessageDeleteBulk = new SleetModule(
  {
    name: 'logMessageDeleteBulk',
  },
  {
    messageDeleteBulk: handleMessageDeleteBulk,
  },
)

const ARCHIVE_VIEWER = 'https://log.atora.dev/'
const FILENAME = 'archive.json'
const generateArchiveUrl = (channelId: string, attachmentId: string) =>
  `${ARCHIVE_VIEWER}${channelId}/${attachmentId}/${FILENAME}`

async function handleMessageDeleteBulk(
  messages: ReadonlyCollection<string, Message | PartialMessage>,
  fromChannel: GuildTextBasedChannel,
) {
  const conf = await getValidatedConfigFor(fromChannel.guild)
  if (!conf) return

  const { config, channel } = conf
  if (!config.messageDeleteBulk) return

  const sortedMessages = messages.sorted(
    (a, b) => a.createdTimestamp - b.createdTimestamp,
  )
  const users = new Set(sortedMessages.map((m) => m.author))
  const messagesPerUser = new Map<User, number>()

  const body: AttachmentBodyV1 = {
    version: 1,
    data: {
      messages: sortedMessages
        .map((m) => {
          const data = structuredClone(
            (m as unknown as MessageWithRaw).rawData,
          ) as APIMessage | undefined
          if (!data) return null

          if ('mentions' in data) {
            for (const mention of data.mentions) {
              if ('member' in mention) {
                delete mention.member
              }
            }
          }

          return data
        })
        .filter(notNullish),
      guild: {
        id: fromChannel.guild.id,
        name: fromChannel.guild.name,
        icon: fromChannel.guild.icon,
      },
      channel: {
        id: fromChannel.id,
        name: fromChannel.name,
        type: fromChannel.type,
        guild_id: fromChannel.guild.id,
      },
      channels: {},
      roles: {},
      users: {},
      members: {},
    },
  }

  for (const message of sortedMessages.values()) {
    // For every mentioned channel, user, or role, add them to the body so they resolve

    for (const [id, channel] of message.mentions.channels) {
      body.data.channels[id] = {
        id: channel.id,
        name: 'name' in channel ? channel.name : null,
        type: channel.type,
      }

      if ('guildId' in channel) {
        body.data.channels[id].guild_id = channel.guildId
      }
    }

    for (const [id, channel] of message.mentions.crosspostedChannels) {
      body.data.channels[id] = {
        id: channel.channelId,
        name: channel.name,
        type: channel.type,
      }
    }

    for (const [id, role] of message.mentions.roles) {
      body.data.roles[id] = {
        id: role.id,
        name: role.name,
        color: role.color,
        icon: role.icon,
        unicode_emoji: role.unicodeEmoji,
      }
    }

    const rp = message.mentions.repliedUser
    if (rp) {
      body.data.users[rp.id] = {
        id: rp.id,
        avatar: rp.avatar,
        discriminator: rp.discriminator,
        global_name: rp.globalName,
        username: rp.username,
      }
    }

    for (const [id, user] of message.mentions.users) {
      body.data.users[id] = {
        id: user.id,
        avatar: user.avatar,
        discriminator: user.discriminator,
        global_name: user.globalName,
        username: user.username,
      }
    }

    if (message.member) {
      body.data.members[message.member.id] = {
        roles: message.member.roles.cache.map((r) => r.id),
      }

      for (const [id, role] of message.member.roles.cache) {
        body.data.roles[id] = {
          id: role.id,
          name: role.name,
          color: role.color,
          icon: role.icon,
          unicode_emoji: role.unicodeEmoji,
        }
      }
    }

    if (message.interaction) {
      const { interaction } = message

      body.data.users[interaction.user.id] = {
        id: interaction.user.id,
        avatar: interaction.user.avatar,
        discriminator: interaction.user.discriminator,
        global_name: interaction.user.globalName,
        username: interaction.user.username,
      }
    }

    if (message.author === null) continue
    const count = messagesPerUser.get(message.author) ?? 0
    messagesPerUser.set(message.author, count + 1)
  }

  const userList = Array.from(users)
    .map((u) =>
      u
        ? `${formatUser(u, {
            mention: false,
          })} \`[${messagesPerUser.get(u) ?? 0}]\``
        : 'Unknown User',
    )
    .join(', ')
    .substring(0, 1024)

  const logMessage = `${fromChannel}, **${messages.size}** messages\n${userList}`

  const files: AttachmentPayload[] = [
    {
      name: FILENAME,
      attachment: Buffer.from(JSON.stringify(body)),
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

    await sentMessage.edit({
      content: `${sentMessage.content}\n<${generateArchiveUrl(
        channelId,
        attachmentId,
      )}>`,
    })
  }
}

type MinimalGuild = Pick<APIGuild, 'id' | 'name' | 'icon'>
type MinimalChannel = Pick<APIChannel, 'id' | 'name'> & {
  type: ChannelType
  guild_id?: string
}
type MinimalRole = Pick<
  APIRole,
  'id' | 'name' | 'color' | 'icon' | 'unicode_emoji'
>
type MinimalUser = Pick<
  APIUser,
  'id' | 'avatar' | 'discriminator' | 'global_name' | 'username'
>
type MinimalGuildMember = Pick<APIGuildMember, 'roles'>

interface AttachmentBodyV1 {
  version: 1
  data: {
    messages: APIMessage[]
    guild: MinimalGuild
    channel: MinimalChannel
    members: Record<string, MinimalGuildMember>
    roles: Record<string, MinimalRole>
    channels: Record<string, MinimalChannel>
    users: Record<string, MinimalUser>
  }
}

/* eslint-disable @typescript-eslint/dot-notation */
// A glorious and ugly hack
// Caching the data ourselves means d.js may or may not emit the right events depending on the cache
// If d.js disposes of the message for some reason (hitting cache limits...) then we're storing extra data that won't be in message delete bulk events
// If we just attach it to the message... then we know it'll be there on every message and when we see message delete bulk events :)
// The alternative is either storing data and listening to raw events ourselves (effort) or converting messages to APIMessages (effort)
interface MessageWithRaw {
  rawData: APIMessage
}

const oldPatch = Message.prototype['_patch']

Message.prototype['_patch'] = function (data: APIMessage) {
  oldPatch.call(this, data)
  ;(this as unknown as MessageWithRaw).rawData = {
    ...(this as unknown as MessageWithRaw).rawData,
    ...data,
  }
}
/* eslint-enable @typescript-eslint/dot-notation */

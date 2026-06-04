import { stripVTControlCharacters } from 'node:util'

import {
  ApplicationIntegrationType,
  type AttachmentPayload,
  ChannelType,
  codeBlock,
  type GuildMember,
  type GuildTextBasedChannel,
  InteractionContextType,
  type Message,
  type PartialGuildMember,
} from 'discord.js'
import { formatUser, SleetSlashCommand, tryFetchMember } from 'sleetcord'

import type { WelcomeSettings } from '../../generated/prisma/client.js'
import { prisma } from '../../helpers/db.js'
import { KeyedMutex } from '../../helpers/mutex.js'
import { messageToLog } from '../modlog/handlers/messageDelete.js'
import { sendToModlog } from '../modlog/sendToModlog.js'
import { formatLog, getModlogTicketQueue, getValidatedConfigFor } from '../modlog/utils.js'
import { welcomeCache } from './cache.js'
import { config } from './config.js'
import { deleteCommand } from './delete.js'
import { fields } from './fields.js'
import { mark_joined } from './mark_joined.js'
import { formatMessage, message } from './message.js'

export const welcome = new SleetSlashCommand(
  {
    name: 'welcome',
    description: 'Manage the welcome message',
    contexts: [InteractionContextType.Guild],
    integration_types: [ApplicationIntegrationType.GuildInstall],
    default_member_permissions: ['ManageGuild'],
    options: [fields, message, deleteCommand, config, mark_joined],
  },
  {
    guildMemberAdd: handleGuildMemberAdd,
    guildMemberUpdate: handleGuildMemberUpdate,
    messageCreate: handleMessageCreate,
  },
)

/** Guild ID -> Set of member IDs */
const newMembers = new Set<GuildMember>()

async function handleGuildMemberAdd(member: GuildMember) {
  if (member.user.bot) return
  if (member.pending) return

  return handleJoin(member)
}

async function handleGuildMemberUpdate(
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember,
) {
  if (oldMember.pending && !newMember.pending) {
    return handleJoin(newMember)
  }
}

async function handleMessageCreate(message: Message) {
  if (message.author.bot || !message.inGuild() || message.system) return

  const member = message.member ?? (await tryFetchMember(message.guild, message.author.id))

  if (member === null) {
    return // Failed to fetch member
  }

  // Check if this member is new before trying to welcome them
  // We can't just rely on welcome joins since someone might want to welcome rejoins but only when
  // they send a message, but someone leaving doesn't clear the welcome joins.
  // We need to know who is "new" (including rejoins) and we should try to welcome on message
  // This could be another table for persistence (ie. someone joins, bot dies, bot comes back,
  // they send a message), but for now, meh, it's fine, and I'd need to cache it anyway.
  if (!newMembers.has(member)) return

  return handleJoin(member, message.channel, message)
}

const joiningMembers = new KeyedMutex<GuildMember>()

async function handleJoin(member: GuildMember, channel?: GuildTextBasedChannel, message?: Message) {
  if (member.user.bot) return

  using lock = joiningMembers.tryAcquire(member)

  if (!lock) {
    // Prevent multiple simultaneous welcomes for the same member
    return
  }

  const eventDate = new Date()
  using ticket = getModlogTicketQueue(member.guild).acquireTicket()

  const welcomeSettings = await getSettingsFor(member.guild.id)

  // No settings for this guild
  if (welcomeSettings === null) {
    return
  }

  const config = await getValidatedConfigFor(
    member.guild,
    'memberWelcome',
    (config) => config.memberWelcome,
  )

  if (!config || !config.channel) {
    // We don't need to hold the modlog ticket if we don't have a config or there's no log channel
    ticket.removeFromQueue()
  }

  const {
    rejoins,
    ignoreRoles,
    channel: welcomeChannel,
    message: welcomeMessage,
    instant,
    reactWith,
  } = welcomeSettings

  // Don't instantly welcome people and the user didn't post a message
  // Instead note down the join for later
  if (!instant && !channel) {
    newMembers.add(member)
    return
  }

  // Don't welcome users who sent a message in a private thread
  if (channel?.type === ChannelType.PrivateThread) {
    return
  }

  // probably should auto do this somewhere lol
  const roleIDs = ignoreRoles.split(',')

  // Ignore them because of their roles
  if (member.roles.cache.some((r) => roleIDs.includes(r.id))) {
    return
  }

  // Ignore them because they've joined before
  if (!rejoins && (await hasJoinedBefore(member.guild.id, member.id))) {
    return
  }

  const sendChannel =
    (welcomeChannel ? await member.guild.channels.fetch(welcomeChannel).catch(() => null) : null) ??
    channel

  let sentMessage: Message | null = null

  if (sendChannel?.isTextBased()) {
    const msg = formatMessage(welcomeMessage, {
      member,
      origin: channel,
      welcome: sendChannel,
      message,
    })

    sentMessage = await sendChannel.send(msg)
  }

  await addJoin(member.guild.id, member.id)
  newMembers.delete(member)

  if (reactWith && message) {
    message.react(reactWith).catch(() => {
      /* ignore */
    })
  }

  if (config) {
    const firstMessage = message ? ` first message at ${message.url}` : ''
    const messagePreview = message
      ? await messageToLog(message, {
          includeAttachments: true,
          includeEmbeds: true,
          includeInteraction: true,
          includePoll: true,
          includeReference: true,
          includeStickers: true,
          includeTimestamp: true,
          includeUser: true,
        })
      : ''

    const logMessage = formatLog(
      '👋',
      'Member Welcome',
      `${formatUser(member)}${sentMessage ? ` at ${sentMessage.url}` : ''}${firstMessage}`,
      eventDate,
    )

    let content = logMessage
    const files: AttachmentPayload[] = []

    if (messagePreview) {
      const formattedPreview = `${messagePreview.header}\n${messagePreview.content || '┊'}\n${messagePreview.footer}`

      // 1850 to give us some headroom
      if (formattedPreview.length + logMessage.length <= 1850) {
        content = `${logMessage}\n${codeBlock('ansi', formattedPreview)}`
      } else {
        files.push({
          name: 'first_message.txt',
          attachment: Buffer.from(stripVTControlCharacters(formattedPreview), 'utf-8'),
        })
      }
    }

    const { channel } = config
    if (channel) {
      await ticket.waitUntilFirst()

      await sendToModlog(channel, {
        content,
        files,
        allowedMentions: { parse: [] },
      })
    }
  }
}

async function addJoin(guildID: string, userID: string) {
  return await prisma.welcomeJoins.upsert({
    where: {
      guildID_userID: {
        guildID,
        userID,
      },
    },
    create: {
      guildID,
      userID,
    },
    update: {
      guildID,
    },
  })
}

async function hasJoinedBefore(guildID: string, userID: string): Promise<boolean> {
  return await prisma.welcomeJoins
    .findFirst({
      where: {
        guildID,
        userID,
      },
      select: { userID: true },
    })
    .then((row) => row !== null)
}

async function getSettingsFor(guildID: string): Promise<WelcomeSettings | null> {
  const settings = welcomeCache.get(guildID)

  // null means they don't exist
  if (settings === null) return null
  if (settings !== undefined) return settings

  // undefined means not cached
  const dbSettings = await prisma.welcomeSettings.findUnique({
    where: {
      guildID,
    },
  })

  welcomeCache.set(guildID, dbSettings)
  return dbSettings
}

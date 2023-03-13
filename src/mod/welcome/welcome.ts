import { WelcomeSettings } from '@prisma/client'
import {
  Guild,
  GuildMember,
  GuildTextBasedChannel,
  Message,
  PartialGuildMember,
} from 'discord.js'
import { SleetSlashCommand, tryFetchMember } from 'sleetcord'
import { prisma } from '../../util/db.js'
import { welcomeCache } from './cache.js'
import { config } from './config.js'
import { deleteCommand } from './delete.js'
import { fields } from './fields.js'
import { formatMessage, message } from './message.js'

export const welcome = new SleetSlashCommand(
  {
    name: 'welcome',
    description: 'Manage the welcome message',
    dm_permission: false,
    default_member_permissions: ['ManageGuild'],
    options: [fields, message, deleteCommand, config],
  },
  {
    guildMemberAdd: handleGuildMemberAdd,
    guildMemberUpdate: handleGuildMemberUpdate,
    messageCreate: handleMessageCreate,
  },
)

/** Guild ID -> Set of member IDs */
const newMembers = new Map<string, Set<string>>()

async function handleGuildMemberAdd(member: GuildMember) {
  if (member.user.bot) return
  if (member.pending) return

  handleJoin(member)
}

async function handleGuildMemberUpdate(
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember,
) {
  if (oldMember.pending && !newMember.pending) {
    handleJoin(newMember)
  }
}

async function handleMessageCreate(message: Message) {
  if (message.author.bot || !message.inGuild() || message.system) return

  const member =
    message.member ?? (await tryFetchMember(message.guild, message.author.id))

  if (member === null) {
    return // Failed to fetch member
  }

  const newJoins = newMembers.get(member.guild.id)

  // Check if this member is new before trying to welcome them
  // We can't just rely on welcome joins since someone might want to welcome rejoins but only when
  // they send a message, but someone leaving doesn't clear the welcome joins.
  // We need to know who is "new" (including rejoins) and we should try to welcome on message
  // This could be another table for persistance (ie. someone joins, bot dies, bot comes back,
  // they send a message), but for now, meh, it's fine, and I'd need to cache it anyway.
  if (!newJoins || !newJoins.has(member.id)) return

  handleJoin(member, message.channel, message)
}

async function handleJoin(
  member: GuildMember,
  channel?: GuildTextBasedChannel,
  message?: Message,
) {
  if (member.user.bot) return

  const welcomeSettings = await getSettingsFor(member.guild.id)

  // No settings for this guild
  if (welcomeSettings === null) return

  const {
    rejoins,
    ignoreRoles,
    channel: welcomeChannel,
    message: welcomeMessage,
    instant,
    reactWith,
  } = welcomeSettings

  if (!instant && !channel) {
    // Don't instantly welcome people and the user didn't post a message
    // Instead note down the join for later
    const set = newMembers.get(member.guild.id) ?? new Set()
    set.add(member.id)
    newMembers.set(member.guild.id, set)
    return
  }

  // probably should auto do this somewhere lol
  const roleIDs = ignoreRoles.split(',')

  if (member.roles.cache.some((r) => roleIDs.includes(r.id))) {
    return // Ignore them because of their roles
  }

  if (!rejoins && (await hasJoinedBefore(member.guild.id, member.id))) {
    // Ignore them because they've joined before
    return
  }

  const sendChannel =
    (welcomeChannel
      ? await resolveTextBasedChannel(member.guild, welcomeChannel)
      : null) ?? channel

  if (sendChannel) {
    const msg = formatMessage(welcomeMessage, {
      member,
      origin: channel,
      welcome: sendChannel,
    })
    sendChannel.send(msg)
  }

  if (reactWith && message) {
    // ignore errors, not my problem really
    message.react(reactWith).catch(() => void 0)
  }

  addJoin(member.guild.id, member.id)
}

async function resolveTextBasedChannel(
  guild: Guild,
  channelID: string,
): Promise<GuildTextBasedChannel | null> {
  const cachedChannel = guild.channels.cache.get(channelID)

  if (cachedChannel && cachedChannel.isTextBased()) {
    return cachedChannel
  }

  const channel = await guild.channels.fetch(channelID)

  if (channel && channel.isTextBased()) {
    return channel
  }

  return null
}

async function addJoin(guildID: string, userID: string) {
  const set = newMembers.get(guildID) ?? new Set()
  set.delete(userID)
  newMembers.set(guildID, set)

  return await prisma.welcomeJoins.create({
    data: {
      guildID,
      userID,
    },
  })
}

async function hasJoinedBefore(
  guildID: string,
  userID: string,
): Promise<boolean> {
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

async function getSettingsFor(
  guildID: string,
): Promise<WelcomeSettings | null> {
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

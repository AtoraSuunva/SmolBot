import { WelcomeSettings } from '@prisma/client'
import { Guild, GuildMember, GuildTextBasedChannel, Message } from 'discord.js'
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
    messageCreate: handleMessageCreate,
  },
)

async function handleGuildMemberAdd(member: GuildMember) {
  if (member.user.bot) return

  handleJoin(member)
}

async function handleMessageCreate(message: Message) {
  if (message.author.bot || !message.inGuild() || message.system) return

  const member =
    message.member ?? (await tryFetchMember(message.guild, message.author.id))

  if (member === null) {
    return // Failed to fetch member
  }

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
    // Don't instantly welcome people and
    // the user didn't post a message
    return
  }

  // probably should auto do this somewhere lol
  const roleIDs = ignoreRoles.split(',')

  if (member.roles.cache.some((r) => roleIDs.includes(r.id))) {
    return // Ignore them because of their roles
  }

  if (rejoins !== true) {
    const joins = await getJoinsFor(member.guild.id)
    if (joins.includes(member.id)) return // Ignore them because they've joined before
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

const joinCache = new Map<string, string[]>()

function addJoin(guildID: string, userID: string) {
  joinCache.set(guildID, [...(joinCache.get(guildID) ?? []), userID])

  return prisma.welcomeJoins.create({
    data: {
      guildID,
      userID,
    },
  })
}

async function getJoinsFor(guildID: string): Promise<string[]> {
  if (joinCache.has(guildID)) return joinCache.get(guildID) ?? []

  return prisma.welcomeJoins
    .findMany({
      where: {
        guildID,
      },
      select: { userID: true },
    })
    .then((joins) => joins.map((j) => j.userID))
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

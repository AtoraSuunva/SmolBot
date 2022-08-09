import { WelcomeSettings } from '@prisma/client'
import { Message } from 'discord.js'
import { SleetSlashCommand, tryFetchMember } from 'sleetcord'
import { prisma } from '../../util/db.js'
import { welcomeCache } from './cache.js'
import { config } from './config.js'
import { deleteCommand } from './delete.js'
import { fields } from './fields.js'
import { message } from './message.js'

export const welcome = new SleetSlashCommand(
  {
    name: 'welcome',
    description: 'Manage the welcome message',
    dm_permission: false,
    default_member_permissions: ['ManageGuild'],
    options: [fields, message, deleteCommand, config],
  },
  {
    messageCreate: handleMessageCreate,
  },
)

// TODO: the actual welcome
// considerations:
//   - cache db ✅
//   - invalidate cache on delete/edit ✅
//   - ignore people
//   - check rejoins (+cache joins)

async function handleMessageCreate(message: Message) {
  if (message.author.bot || !message.inGuild()) return

  const welcomeSettings = await getSettingsFor(message.guild.id)

  // No settings for this guild
  if (welcomeSettings === null) return

  const member =
    message.member ?? (await tryFetchMember(message.guild, message.author.id))

  if (member === null) {
    return // Failed to fetch member
  }

  // message: string
  // channel: string | null
  // instant: boolean
  // reactWith: string | null
  const { rejoins, ignoreRoles } = welcomeSettings

  // probably should auto do this somewhere lol
  const roleIDs = ignoreRoles.split(',')

  if (member.roles.cache.some(r => roleIDs.includes(r.id))) {
    return // Ignore them because of their roles
  }

  if (rejoins !== true) {
    const joins = await getJoinsFor(message.guild.id)
    if (joins.includes(member.id)) return // Ignore them because they've joined before
  }

  addJoin(message.guild.id, member.id)
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
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  if (joinCache.has(guildID)) return joinCache.get(guildID)!

  return prisma.welcomeJoins
    .findMany({
      where: {
        guildID,
      },
      select: { userID: true },
    })
    .then(joins => joins.map(j => j.userID))
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
import type { Prisma } from '@prisma/client'
import { InteractionContextType } from 'discord-api-types/v10'
import {
  type APIRole,
  ApplicationCommandOptionType,
  AuditLogEvent,
  type ChatInputCommandInteraction,
  type CommandInteraction,
  type Guild,
  type GuildAuditLogsEntry,
  GuildMember,
  type PartialGuildMember,
  type Role,
  type TextBasedChannel,
  type UserContextMenuCommandInteraction,
} from 'discord.js'
import {
  SleetSlashCommand,
  SleetUserCommand,
  botHasPermissionsGuard,
  formatUser,
  getGuild,
  getMembers,
  inGuildGuard,
} from 'sleetcord'
import { SECOND, baseLogger } from 'sleetcord-common'
import { prisma } from '../../util/db.js'

const mutedRoles = [
  'muted',
  'mute',
  'foreboden',
  'roleban',
  'rolebanned',
  'jail',
  'jailed',
]

const muteLogger = baseLogger.child({ module: 'mute' })

export const mute = new SleetSlashCommand(
  {
    name: 'mute',
    description: 'Mutes a user',
    default_member_permissions: ['ManageRoles'],
    contexts: [InteractionContextType.Guild],
    options: [
      {
        name: 'members',
        type: ApplicationCommandOptionType.String,
        description: 'The members to mute',
        required: true,
      },
      {
        name: 'reason',
        type: ApplicationCommandOptionType.String,
        description: 'The reason for the mute',
      },
      {
        name: 'ephemeral',
        type: ApplicationCommandOptionType.Boolean,
        description: 'Only show the result to you (default: False)',
      },
    ],
  },
  {
    run: (i) => handleChatInput(i, 'mute'),
    guildMemberUpdate: handleGuildMemberUpdate,
  },
)

export const mute_menu = new SleetUserCommand(
  {
    name: 'Mute',
    default_member_permissions: ['ManageRoles'],
    contexts: [InteractionContextType.Guild],
  },
  {
    run: (i) => handleUserCommand(i, 'mute'),
  },
)

export const unmute = new SleetSlashCommand(
  {
    name: 'unmute',
    description: 'Unmutes a user',
    default_member_permissions: ['ManageRoles'],
    contexts: [InteractionContextType.Guild],
    options: [
      {
        name: 'members',
        type: ApplicationCommandOptionType.String,
        description: 'The members to mute',
        required: true,
      },
      {
        name: 'reason',
        type: ApplicationCommandOptionType.String,
        description: 'The reason for the mute',
      },
      {
        name: 'ephemeral',
        type: ApplicationCommandOptionType.Boolean,
        description: 'Only show the result to you (default: False)',
      },
    ],
  },
  {
    run: (i) => handleChatInput(i, 'unmute'),
  },
)

export const unmute_menu = new SleetUserCommand(
  {
    name: 'Unmute',
    default_member_permissions: ['ManageRoles'],
    contexts: [InteractionContextType.Guild],
  },
  {
    run: (i) => handleUserCommand(i, 'unmute'),
  },
)

export const muteCommands = [mute, mute_menu, unmute, unmute_menu]

type MuteAction = 'mute' | 'unmute'

interface MuteSuccess {
  member: GuildMember
  roles?: Role[]
}

interface MuteFail extends MuteSuccess {
  reason: string
}

interface ActionResult {
  succeeded: MuteSuccess[]
  failed: MuteFail[]
}

async function handleChatInput(
  interaction: ChatInputCommandInteraction,
  action: MuteAction,
) {
  inGuildGuard(interaction)
  const members = await getMembers(interaction, 'members', true)
  const reason = interaction.options.getString('reason') ?? 'No reason given'
  const ephemeral = interaction.options.getBoolean('ephemeral') ?? false

  return runMute(interaction, action, members, reason, ephemeral)
}

async function handleUserCommand(
  interaction: UserContextMenuCommandInteraction,
  action: MuteAction,
) {
  inGuildGuard(interaction)
  const guild = await getGuild(interaction, true)
  const target = interaction.targetMember

  const members = [
    target instanceof GuildMember
      ? target
      : await guild.members.fetch(interaction.targetId),
  ]
  const reason = 'Context menu mute'
  const ephemeral = false

  return runMute(interaction, action, members, reason, ephemeral)
}

async function runMute(
  interaction: CommandInteraction,
  action: MuteAction,
  members: GuildMember[],
  reason: string,
  ephemeral: boolean,
): Promise<unknown> {
  inGuildGuard(interaction)
  const guild = await getGuild(interaction, true)

  await botHasPermissionsGuard(interaction, ['ManageRoles'])

  const deferReply = await interaction.deferReply({
    ephemeral,
    fetchReply: true,
  })
  const capitalAction = action === 'mute' ? 'Muted' : 'Unmuted'

  const config: Prisma.MuteConfigGetPayload<true> =
    (await prisma.muteConfig.findUnique({
      where: {
        guildID: guild.id,
      },
    })) ?? {
      guildID: guild.id,
      logChannelID: null,
      roleID: null,
    }

  const interactionMember = await guild.members.fetch(interaction.user.id)
  const me = await guild.members.fetchMe()
  const userHighestRole = interactionMember.roles.highest
  const myHighestRole = me.roles.highest
  const mutedRole = findMutedRole(guild, config.roleID)

  if (!mutedRole) {
    return interaction.editReply({
      content: `No muted role found, specify a role using \`/mute_manage\` or set up a role with one of the following names: \`${mutedRoles.join(
        '`, `',
      )}\``,
    })
  }

  const isOwner = interactionMember.id === guild.ownerId
  if (!isOwner && mutedRole.comparePositionTo(userHighestRole) > 0) {
    return interaction.editReply({
      content: `Your highest role needs to be higher than ${mutedRole} to ${action}`,
    })
  }

  const toAction: GuildMember[] = []
  const earlyFailed: MuteFail[] = []

  for (const member of members) {
    const hasMutedRole = member.roles.cache.get(mutedRole.id)
    const shouldHaveRole = action === 'unmute'

    if (member.id === me.user.id) {
      earlyFailed.push({ member, reason: 'This is me.' })
    } else if (member.id === interaction.user.id) {
      earlyFailed.push({ member, reason: `You cannot ${action} yourself.` })
    } else if (
      !isOwner &&
      member.roles.highest.position >= userHighestRole.position
    ) {
      earlyFailed.push({
        member,
        reason: `You cannot ${action} someone with a higher or equal role to you.`,
      })
    } else if (member.roles.highest.position >= myHighestRole.position) {
      earlyFailed.push({
        member,
        reason: `I cannot ${action} someone with a higher or equal role to me.`,
      })
    } else if (hasMutedRole && !shouldHaveRole) {
      const userHasStoredRoles = await hasStoredRoles(member)

      if (userHasStoredRoles) {
        toAction.push(member)
      } else {
        earlyFailed.push({ member, reason: 'Already muted.' })
      }
    } else if (!hasMutedRole && shouldHaveRole) {
      earlyFailed.push({ member, reason: 'Not muted.' })
    } else {
      toAction.push(member)
    }
  }

  if (toAction.length === 0) {
    return interaction.editReply({
      content: `No valid users to ${action}.\n${formatFails(earlyFailed)}`,
    })
  }

  const formattedReason = `${capitalAction} by ${interactionMember.displayName} for "${reason}"`

  const { succeeded, failed } = await (action === 'mute'
    ? muteAction(toAction, mutedRole, formattedReason)
    : unmuteAction(toAction, mutedRole, formattedReason))

  const totalFails = [...earlyFailed, ...failed]
  const succ =
    succeeded.length > 0
      ? `\n${formatSuccesses(succeeded, action)}`
      : ' Nobody!'
  const fail =
    totalFails.length > 0 ? `\n**Failed:**\n${formatFails(totalFails)}` : ''

  const content = `**${capitalAction}:**${succ}${fail}`

  const byLine = `By ${formatUser(interactionMember)} in ${deferReply.url}${ephemeral ? ' (ephemeral)' : ''}`

  await sendToLogChannel(guild, config.logChannelID, {
    content: `${content}\n${byLine}`,
    allowedMentions: { parse: [] },
  })

  return interaction.editReply({
    content,
    allowedMentions: { parse: [] },
  })
}

/**
 * Handle someone else (like a mod or a bot) removing the user's muted role.
 *
 * If we muted the user (and have roles stored for them), we'll restore their roles so that it works out in the end
 */
async function handleGuildMemberUpdate(
  _oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember,
) {
  const { guild } = newMember

  const config: Prisma.MuteConfigGetPayload<true> =
    (await prisma.muteConfig.findUnique({
      where: {
        guildID: guild.id,
      },
    })) ?? {
      guildID: guild.id,
      logChannelID: null,
      roleID: null,
    }

  const mutedRole = findMutedRole(guild, config.roleID)

  // If we can't find the muted role then guild isn't configured
  if (!mutedRole) return
  // If the user has the muted role then we shouldn't restore anything
  if (newMember.roles.cache.get(mutedRole.id)) return

  if (!hasStoredRoles(newMember)) return

  const entry = await findUserResponsibleForRemovingMute(
    newMember,
    mutedRole.id,
  )

  const restoredRoles = await restoreRoles(
    newMember,
    mutedRole,
    `${entry?.executor?.username ?? '<unknown user>'} removed the muted role`,
  )

  if (restoredRoles.length === 0) return

  const content = formatSuccesses(
    [{ member: newMember, roles: restoredRoles }],
    'unmute',
  )
  const byLine = entry
    ? `By ${entry.executor ? formatUser(entry.executor) : '<unknown user>'} for ${entry.reason ? `"${entry.reason}"` : '<No reason given>'}`
    : 'By <unknown user>'

  await sendToLogChannel(guild, config.logChannelID, {
    content: `Muted Role removed, restored previous roles:\n${content}\n${byLine}`,
    allowedMentions: { parse: [] },
  })
}

const WITHIN_TIME = 5 * SECOND

async function findUserResponsibleForRemovingMute(
  member: GuildMember,
  mutedRoleId: string,
): Promise<GuildAuditLogsEntry<AuditLogEvent.MemberRoleUpdate> | null> {
  const { guild } = member
  const me = await guild.members.fetchMe()

  if (!me.permissions.has('ViewAuditLog')) return null

  const auditLogs = await guild.fetchAuditLogs({
    type: AuditLogEvent.MemberRoleUpdate,
  })

  const now = Date.now()
  const timeLimit = now - WITHIN_TIME

  const entry = auditLogs.entries.find((entry) => {
    return (
      // Created within the last 5 seconds
      entry.createdTimestamp > timeLimit &&
      // Modified our member
      entry.targetId === member.id &&
      // Removed the muted role
      entry.changes.some(
        (change) =>
          change.key === '$remove' &&
          (change.new as APIRole[])?.some((r) => r.id === mutedRoleId),
      )
    )
  })

  return entry ?? null
}

function sendToLogChannel(
  guild: Guild,
  logChannelID: string | null,
  payload: Parameters<TextBasedChannel['send']>[0],
) {
  if (!logChannelID) return Promise.resolve()

  const logChannel = guild.channels.cache.get(logChannelID)

  if (logChannel?.isTextBased()) {
    return logChannel.send(payload)
  }

  return Promise.resolve()
}

function muteAction(
  members: GuildMember[],
  mutedRole: Role,
  reason: string,
): Promise<ActionResult> {
  const succeeded: MuteSuccess[] = []
  const failed: MuteFail[] = []

  const actions = members.map(async (member) => {
    try {
      const previousRoles = await storeRoles(member)
      const keepRoles = member.roles.cache.filter((r) => r.managed).toJSON()
      await member.roles.set([...keepRoles, mutedRole], reason)
      succeeded.push({ member, roles: previousRoles })
    } catch (e) {
      muteLogger.error(e, 'Failed to mute user %s', member.id)
      failed.push({ member, reason: String(e) })
    }
  })

  return Promise.all(actions).then(() => ({ succeeded, failed }))
}

function unmuteAction(
  members: GuildMember[],
  mutedRole: Role,
  reason: string,
): Promise<ActionResult> {
  const succeeded: MuteSuccess[] = []
  const failed: MuteFail[] = []

  const actions = members.map(async (member) => {
    try {
      const restoredRoles = await restoreRoles(member, mutedRole, reason)
      succeeded.push({ member, roles: restoredRoles })
    } catch (e) {
      muteLogger.error(e, 'Failed to unmute user %s', member.id)
      failed.push({ member, reason: String(e) })
    }
  })

  return Promise.all(actions).then(() => ({ succeeded, failed }))
}

async function storeRoles(member: GuildMember): Promise<Role[]> {
  const { guild } = member
  const previous = (await fetchStoredRoles(member)) ?? []
  const roles = member.roles.cache
    .filter((r) => validRole(r, guild))
    .map((r) => r.id)
  await setStoredRoles(member, [...previous, ...roles])
  return member.roles.cache.toJSON()
}

/**
 * Technically a mutex if you squint and also barely know what a mutex is
 *
 * The process of restoring a mute causes a guild member update, but if the bot tries to restore again
 * while the first restore is still happening it causes bad things. There is no point in queueing them
 * (since on success we'd just find out we have nothing to restore, and on failure conditions probably aren't
 * gonna magically align instantly after aside from API one-offs)
 */
const userBeingRestored = new Set<string>()

async function restoreRoles(
  member: GuildMember,
  mutedRole: Role,
  reason?: string,
): Promise<Role[]> {
  const key = `${member.guild.id}:${member.id}`
  if (userBeingRestored.has(key)) {
    return []
  }

  userBeingRestored.add(key)

  try {
    const roles = await fetchStoredRoles(member)

    if (!roles) return []

    // Resolve all the roles in case one of them has since been deleted or something
    const resolvedStoredRoles = await Promise.all(
      roles.map(async (r) => member.guild.roles.fetch(r).catch(() => null)),
    )

    const { guild } = member

    const applyRoles = resolvedStoredRoles
      .filter(isDefined)
      .filter((r) => validRole(r, guild) && r.id !== mutedRole.id)

    await member.roles.remove(mutedRole, reason)
    muteLogger.info(
      'Restoring roles for %s; %o; %o',
      member.id,
      roles,
      applyRoles,
    )
    await member.roles.add(applyRoles, reason)
    await deleteStoredRoles(member)
    return applyRoles
  } finally {
    userBeingRestored.delete(key)
  }
}

function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null
}

function validRole(role: Role, guild: Guild): boolean {
  if (role.id === guild.id) return false
  if (role.managed) return false
  return true
}

function formatSuccesses(succeeded: MuteSuccess[], action: MuteAction): string {
  return (
    succeeded
      .map((success) => {
        const { member, roles } = success
        const { guild } = member
        const act = action === 'mute' ? 'Removed' : 'Restored'

        const validRoles = (roles ?? []).filter((r) => validRole(r, guild))

        const restored =
          validRoles.length > 0
            ? `**${act}:** ${formatRoles(validRoles)}`
            : `No roles ${act.toLowerCase()}`

        return `> ${formatUser(member, { mention: true })}\n> -# ${restored}`
      })
      .join('\n') || 'Nobody'
  )
}

function formatFails(failed: MuteFail[]): string {
  return failed
    .map(
      (fail) =>
        `> ${formatUser(fail.member, { mention: true })}\n> -# ${fail.reason}`,
    )
    .join('\n')
}

function formatRoles(roles: Role[]): string {
  if (roles.length === 0) return 'None'

  return roles
    .sort((a, b) => b.position - a.position)
    .map((r) => r.toString())
    .join(', ')
}

const ROLE_SEPARATOR = ' '

async function fetchStoredRoles(member: GuildMember): Promise<string[] | null> {
  const ids = await prisma.memberMutes.findUnique({
    select: {
      previousRoles: true,
    },
    where: {
      guildID_userID: {
        guildID: member.guild.id,
        userID: member.user.id,
      },
    },
  })

  return (
    ids?.previousRoles.split(ROLE_SEPARATOR).filter((v) => v.trim() !== '') ??
    null
  )
}

function hasStoredRoles(member: GuildMember): Promise<boolean> {
  return prisma.memberMutes
    .count({
      where: {
        guildID: member.guild.id,
        userID: member.user.id,
      },
    })
    .then((count) => count > 0)
}

function setStoredRoles(member: GuildMember, roles: string[]) {
  const previousRoles = roles.join(ROLE_SEPARATOR)

  return prisma.memberMutes.upsert({
    where: {
      guildID_userID: {
        guildID: member.guild.id,
        userID: member.user.id,
      },
    },
    create: {
      guildID: member.guild.id,
      userID: member.user.id,
      previousRoles,
    },
    update: {
      previousRoles,
    },
  })
}

function deleteStoredRoles(member: GuildMember) {
  return prisma.memberMutes.deleteMany({
    where: {
      guildID: member.guild.id,
      userID: member.user.id,
    },
  })
}

function findMutedRole(guild: Guild, roleID: string | null): Role | null {
  return (
    guild.roles.cache.find((r) => roleID === r.id) ??
    guild.roles.cache.find((r) => mutedRoles.includes(r.name.toLowerCase())) ??
    null
  )
}

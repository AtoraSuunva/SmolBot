import { ApplicationCommandOptionType } from 'discord-api-types/v10'
import { CommandInteraction, GuildMember, Role } from 'discord.js'
import { inGuild, SleetSlashCommand, getMembers, formatUser } from 'sleetcord'

const mutedRoles = [
  'muted',
  'mute',
  'foreboden',
  'roleban',
  'rolebanned',
  'jail',
  'jailed',
]

export const mute = new SleetSlashCommand(
  {
    name: 'mute',
    description: 'Mutes a user',
    default_member_permissions: ['MANAGE_ROLES'],
    dm_permission: false,
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
        description: 'Ephemeral mute (default: false)',
      },
    ],
  },
  {
    run: i => runMute(i, 'unmute'),
  },
)

export const unmute = new SleetSlashCommand(
  {
    name: 'unmute',
    description: 'Unmutes a user',
    default_member_permissions: ['MANAGE_ROLES'],
    dm_permission: false,
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
        description: 'Ephemeral mute (default: false)',
      },
    ],
  },
  {
    run: i => runMute(i, 'unmute'),
  },
)

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

async function runMute(
  interaction: CommandInteraction,
  action: MuteAction,
): Promise<unknown> {
  inGuild(interaction)

  const capitalAction = action === 'mute' ? 'Mute' : 'Unmute'

  const members = await getMembers(interaction, 'members', true)
  const reason = interaction.options.getString('reason')
  const ephemeral = interaction.options.getBoolean('ephemeral') ?? false

  const interactionMember = interaction.member as GuildMember
  const userHighestRole = interactionMember.roles.highest
  const myHighestRole = interactionMember.guild.me?.roles.highest
  const mutedRole = interactionMember.guild.roles.cache.find(r =>
    mutedRoles.includes(r.name.toLowerCase()),
  )

  if (!myHighestRole) {
    return interaction.reply({
      content: 'Somehow I am not cached in this guild',
      ephemeral: true,
    })
  }

  if (!mutedRole) {
    return interaction.reply({
      content: `No muted role found, set up a role with one of the following names: \`${mutedRoles.join(
        '`, `',
      )}\``,
      ephemeral: true,
    })
  }

  if (mutedRole.comparePositionTo(userHighestRole) > 0) {
    return interaction.reply({
      content: `Your highest role needs to be higher than ${mutedRole} to ${action}`,
      ephemeral: true,
    })
  }

  const toMute: GuildMember[] = []
  const earlyFailed: MuteFail[] = []

  for (const member of members) {
    const hasMutedRole = member.roles.cache.get(mutedRole.id)
    const shouldHaveRole = action === 'unmute'

    if (member.id === interaction.client.user?.id) {
      earlyFailed.push({ member, reason: 'This is me.' })
    } else if (member.id === interaction.user.id) {
      earlyFailed.push({ member, reason: `You cannot ${action} yourself.` })
    } else if (member.roles.highest.position >= userHighestRole.position) {
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
      earlyFailed.push({ member, reason: 'Already muted.' })
    } else if (!hasMutedRole && shouldHaveRole) {
      earlyFailed.push({ member, reason: 'Not muted.' })
    } else {
      toMute.push(member)
    }
  }

  if (toMute.length === 0) {
    return interaction.reply({
      content: `No valid users to ${action}.\n${formatFails(earlyFailed)}`,
      ephemeral: true,
    })
  }

  const formattedReason = `${capitalAction} by ${interactionMember.displayName} for "${reason}"`

  const { succeeded, failed } = await (action === 'mute'
    ? muteAction(toMute, mutedRole, formattedReason)
    : unmuteAction(toMute, formattedReason))

  await interaction.deferReply({ ephemeral })

  const totalFails = [...earlyFailed, ...failed]
  const succ =
    succeeded.length > 0
      ? `\n${formatSuccesses(succeeded, action)}`
      : ' Nobody!'
  const fail =
    totalFails.length > 0 ? `\n**Failed:**\n${formatFails(totalFails)}` : ''

  return interaction.editReply(`**${capitalAction}:**${succ}${fail}`)
}

function muteAction(
  members: GuildMember[],
  mutedRole: Role,
  reason: string,
): Promise<ActionResult> {
  const succeeded: MuteSuccess[] = []
  const failed: MuteFail[] = []

  const actions = members.map(async member => {
    try {
      const previousRoles = await storeRoles(member)
      const keepRoles = member.roles.cache.filter(r => r.managed).toJSON()
      await member.roles.set([...keepRoles, mutedRole], reason)
      succeeded.push({ member, roles: previousRoles })
    } catch (e) {
      failed.push({ member, reason: String(e) })
    }
  })

  return Promise.all(actions).then(() => ({ succeeded, failed }))
}

function unmuteAction(
  members: GuildMember[],
  reason: string,
): Promise<ActionResult> {
  const succeeded: MuteSuccess[] = []
  const failed: MuteFail[] = []

  const actions = members.map(async member => {
    try {
      const restoredRoles = await restoreRoles(member, reason)
      succeeded.push({ member, roles: restoredRoles })
    } catch (e) {
      failed.push({ member, reason: String(e) })
    }
  })

  return Promise.all(actions).then(() => ({ succeeded, failed }))
}

const storedMutes = new Map<string, string[]>()

async function storeRoles(member: GuildMember): Promise<Role[]> {
  const previous = storedMutes.get(member.id) ?? []
  const roles = member.roles.cache.filter(validRole).map(r => r.id)
  storedMutes.set(member.id, [...previous, ...roles])
  return member.roles.cache.toJSON()
}

async function restoreRoles(
  member: GuildMember,
  reason?: string,
): Promise<Role[]> {
  const roles = storedMutes.get(member.id)
  if (!roles || roles.length === 0) return []

  const applyRoles = (
    await Promise.all(
      roles.map(async r => {
        const role = member.guild.roles.cache.get(r)
        if (role) return role
        return await member.guild.roles.fetch(r)
      }),
    )
  ).filter(isDefined)

  await member.roles.set(applyRoles, reason)
  storedMutes.delete(member.id)
  return applyRoles
}

function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null
}

function validRole(role: Role): boolean {
  if (role.id === role.guild.id) return false
  if (role.managed) return false
  return true
}

function formatSuccesses(succeeded: MuteSuccess[], action: MuteAction): string {
  return (
    succeeded
      .map(success => {
        const { member, roles } = success
        const act = action === 'mute' ? 'Previous Roles' : 'Restored'

        const restored =
          roles && roles.length > 0
            ? ` - **${act}:** ${formatRoles(roles)}`
            : ''

        return `> ${formatUser(member)}${restored}`
      })
      .join('\n') || 'nobody'
  )
}

function formatFails(failed: MuteFail[]): string {
  return failed
    .map(fail => `> ${formatUser(fail.member)} - ${fail.reason}`)
    .join('\n')
}

function formatRoles(roles: Role[]): string {
  return roles
    .filter(validRole)
    .map(r => r.toString())
    .join(', ')
}

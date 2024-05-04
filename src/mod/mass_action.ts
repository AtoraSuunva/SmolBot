import {
  APIApplicationCommandOption,
  ApplicationCommandOptionType,
  AttachmentPayload,
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  User,
  codeBlock,
} from 'discord.js'
import {
  SleetSlashCommand,
  formatUser,
  getAllIDs,
  getGuild,
  inGuildGuard,
  isLikelyID,
  partitionArray,
} from 'sleetcord'
import { DAY } from 'sleetcord-common'
import { capitalize, plural } from '../util/format.js'

const commonOptions: APIApplicationCommandOption[] = [
  {
    name: 'users',
    description: 'The users to action, space-separated user IDs or mentions',
    type: ApplicationCommandOptionType.String,
  },
  {
    name: 'users_file',
    description:
      'A text file containing a list of user IDs to action, newline- and/or space-separated',
    type: ApplicationCommandOptionType.Attachment,
  },
  {
    name: 'id_only',
    description:
      "Output only user IDs, don't include resolved display names/usernames (default: false)",
    type: ApplicationCommandOptionType.Boolean,
  },
]

const reasonOption: APIApplicationCommandOption = {
  name: 'reason',
  description: 'The reason for the action',
  type: ApplicationCommandOptionType.String,
}

export const mass_ban = new SleetSlashCommand(
  {
    name: 'mass_ban',
    description:
      'Mass ban a list of users, can ban only users in-guild or ban everyone on the list',
    default_member_permissions: ['BanMembers'],
    dm_permission: false,
    options: [
      ...commonOptions,
      reasonOption,
      {
        name: 'delete_days',
        description: 'The number of days of messages to delete (default: 0)',
        type: ApplicationCommandOptionType.Integer,
        min_value: 0,
        max_value: 7,
      },
      {
        name: 'force_ban',
        description:
          'Force ban users even if they are not in the guild (default: false)',
        type: ApplicationCommandOptionType.Boolean,
      },
    ],
  },
  {
    run: runMassBan,
  },
)

export const mass_kick = new SleetSlashCommand(
  {
    name: 'mass_kick',
    description: 'Mass kick a list of users',
    default_member_permissions: ['KickMembers'],
    dm_permission: false,
    options: [...commonOptions, reasonOption],
  },
  {
    run: runMassKick,
  },
)

export const mass_find = new SleetSlashCommand(
  {
    name: 'mass_find',
    description: 'Check which users in a list are members of this guild',
    default_member_permissions: ['ModerateMembers'],
    dm_permission: false,
    options: commonOptions,
  },
  {
    run: runMassFind,
  },
)

export const mass_unban = new SleetSlashCommand(
  {
    name: 'mass_unban',
    description: 'Mass unban a list of users',
    default_member_permissions: ['BanMembers'],
    dm_permission: false,
    options: [...commonOptions, reasonOption],
  },
  {
    run: runMassUnban,
  },
)

export const mass_softban = new SleetSlashCommand(
  {
    name: 'mass_softban',
    description:
      'Softbans a user (ban + unban). Unbans + bans already-banned users. Useful to purge messages.',
    default_member_permissions: ['BanMembers'],
    dm_permission: false,
    options: [
      ...commonOptions,
      reasonOption,
      {
        name: 'delete_days',
        description: 'The number of days of messages to delete (default: 1)',
        type: ApplicationCommandOptionType.Integer,
        min_value: 0,
        max_value: 7,
      },
    ],
  },
  {
    run: runMassSoftban,
  },
)

/** Instead of outputting as a message, instead output as a file after this many successes/fails */
const OUTPUT_LIMIT = 15

type UserOrId = User | string

interface ActionFail {
  user: UserOrId
  reason: string
}

type ActionUser = (
  guild: Guild,
  user: User | string,
  reason: string,
) => Promise<string | User | GuildMember | undefined | null>

interface BulkActionResult {
  success: UserOrId[]
  failure: ActionFail[]
}

type BulkActionUsers = (
  guild: Guild,
  users: UserOrId[],
  reason: string,
) => Promise<BulkActionResult>

type CheckMember = (member: GuildMember) => boolean

async function runMassBan(interaction: ChatInputCommandInteraction) {
  const deleteDays = interaction.options.getInteger('delete_days') ?? 0
  const forceBan = interaction.options.getBoolean('force_ban') ?? false

  const deleteMessageSeconds = (deleteDays * DAY) / 1000

  await runMassAction({
    interaction,
    action: 'ban',
    actioned: 'banned',
    actionUser: (g, u, reason) =>
      g.bans.create(typeof u === 'string' ? u : u.id, {
        reason,
        deleteMessageSeconds,
      }),
    // TODO: on d.js v14.15.0 release bulkCreate is added so we can use that instead
    // bulkActionUsers: async (g, users, reason) => {},
    checkMember: (m) => m.bannable,
    actionUserType: forceBan ? UserType.Everyone : UserType.MembersOnly,
  })
}

async function runMassKick(interaction: ChatInputCommandInteraction) {
  await runMassAction({
    interaction,
    action: 'kick',
    actioned: 'kicked',
    actionUser: (g, u, reason) =>
      g.members.kick(typeof u === 'string' ? u : u.id, reason),
    checkMember: (m) => m.kickable,
    actionUserType: UserType.MembersOnly,
  })
}

async function runMassFind(interaction: ChatInputCommandInteraction) {
  await runMassAction({
    interaction,
    action: 'find',
    actioned: 'found',
    actionUser: async () => Promise.resolve(undefined),
    checkMember: () => true,
    actionUserType: UserType.MembersOnly,
    checkRoleHierarchy: false,
  })
}

async function runMassUnban(interaction: ChatInputCommandInteraction) {
  await runMassAction({
    interaction,
    action: 'unban',
    actioned: 'unbanned',
    actionUser: (g, u, reason) => g.members.unban(u, reason),
    checkMember: () => true,
    actionUserType: UserType.NonMembersOnly,
  })
}

async function runMassSoftban(interaction: ChatInputCommandInteraction) {
  const deleteDays = interaction.options.getInteger('delete_days') ?? 1
  const deleteMessageSeconds = (deleteDays * DAY) / 1000

  await runMassAction({
    interaction,
    action: 'softban',
    actioned: 'softbanned',
    actionUser: async (g, u, reason) => {
      try {
        await g.members.unban(u, reason)
        // Success = they were banned before, just re-ban them
        return g.members.ban(u, {
          reason,
          deleteMessageSeconds,
        })
      } catch {
        // Failure = they weren't banned before, ban then unban them
        await g.members.ban(u, {
          reason,
          deleteMessageSeconds,
        })

        return g.members.unban(u, reason)
      }
    },
    checkMember: (m) => m.bannable,
    actionUserType: UserType.Everyone,
  })
}

enum UserType {
  Everyone,
  MembersOnly,
  NonMembersOnly,
}

interface RunMassActionOptions {
  interaction: ChatInputCommandInteraction
  /** Verb to describe the action: "Mass {action} by..." */
  action: string
  /** Past tense of the verb: "{actioned} user for" */
  actioned: string
  /** Function to apply the action on the user */
  actionUser: ActionUser
  /**
   * Optional function to bulk action users, if given it'll be used instead of action user for batches of users
   *
   * Useful for cases where Discord accepts bulk actions, like bans
   */
  bulkActionUsers?: BulkActionUsers
  /**
   * Check if the member can be actioned by the bot
   */
  checkMember: CheckMember
  /**
   * The type of users that should be actioned, can be everyone, members-only, or non-members only
   */
  actionUserType: UserType
  /**
   * If user roles should be checked, meaning that the actioned user must have a lower role than the interaction user
   *
   * @default true
   */
  checkRoleHierarchy?: boolean
}

async function runMassAction({
  interaction,
  action,
  actioned,
  actionUser,
  bulkActionUsers,
  checkMember,
  actionUserType,
  checkRoleHierarchy = true,
}: RunMassActionOptions) {
  inGuildGuard(interaction)

  const guild = await getGuild(interaction, true)
  const userReason =
    interaction.options.getString('reason') ?? 'No reason provided'
  const reason = `Mass ${action} by ${formatUser(interaction.user, {
    markdown: false,
  })}: ${userReason}`
  const idOnly = interaction.options.getBoolean('id_only') ?? false
  const users = interaction.options.getString('users')
  const usersFile = interaction.options.getAttachment('users_file')

  if (!users && !usersFile) {
    await interaction.reply(
      'You must provide either a list of users or a file of user IDs',
    )
    return
  }

  await interaction.deferReply()

  const userList: string[] = []

  if (users) {
    // There's an optimization here to use resolved members to avoid needing to fetch them
    // But it's a lot of added code complexity and fetching in batches of 100 is fast enough
    // If you absolutely push the limit you get around ~220 members that fit into a single string option
    // (This also lags your client if you paste it in)
    // Which is a perfectly workable amount of users to batch fetch in groups of 100 imo

    const rawIds = getAllIDs(users)
    const resolvedDataUsers =
      interaction.options.resolved?.users
        ?.filter((u) => users.includes(u.id) && !rawIds.includes(u.id))
        .map((u) => u.id) ?? []

    userList.push(...rawIds, ...resolvedDataUsers)
  }

  if (usersFile) {
    if (!usersFile.contentType?.startsWith('text/plain')) {
      await interaction.editReply('User ID file must be a text file!')
      return
    }

    const req = await fetch(usersFile.url)

    if (!req.ok) {
      await interaction.editReply('Failed to download user ID file')
      return
    }

    const text = await req.text()
    const userIds = text.split(/\n\r?|\s+/)
    for (const id of userIds) {
      const trimmed = id.trim()
      if (isLikelyID(trimmed)) {
        userList.push(trimmed)
      }
    }
  }

  // Dedupe the list
  const uniqueUsers = Array.from(new Set(userList))

  if (uniqueUsers.length === 0) {
    await interaction.editReply('Found no valid users to action')
    return
  }

  let progress = 0
  const total = userList.length
  const success: UserOrId[] = []
  const failure: ActionFail[] = []

  const interactionMember = await guild.members.fetch(interaction.user.id)
  const isOwner = interactionMember.id === guild.ownerId
  // Make sure I'm fetched
  await guild.members.fetchMe()
  const userHighestRole = interactionMember.roles.highest

  await interaction.editReply(
    `Checking user ${progress.toLocaleString()}/${total.toLocaleString()} (0%)\n${capitalize(
      actioned,
    )} 0 users so far...`,
  )

  // Then handle it in batches of 100
  for await (const batch of partitionArray(uniqueUsers, 100)) {
    const members = await guild.members.fetch({ user: batch })

    const bulkActionBatch: UserOrId[] = []

    if (
      actionUserType === UserType.Everyone ||
      actionUserType === UserType.MembersOnly
    ) {
      for (const [, member] of members) {
        let fail: string | null = null

        if (!checkMember(member)) {
          fail = `I'm missing permissions to ${action} this user or they have a role higher or equal to me`
        } else if (
          checkRoleHierarchy &&
          !isOwner &&
          member.roles.highest.position >= userHighestRole.position
        ) {
          fail = `You cannot ${action} someone with a higher or equal role to you`
        }

        if (fail) {
          failure.push({
            user: member.user,
            reason: fail,
          })
          continue
        }

        if (bulkActionUsers) {
          bulkActionBatch.push(member.user)
          continue
        }

        try {
          await actionUser(guild, member.user, reason)
          success.push(member.user)
        } catch (e: unknown) {
          failure.push({
            user: member.user,
            reason: String(e),
          })
        }
      }
    }

    if (
      actionUserType === UserType.Everyone ||
      actionUserType === UserType.NonMembersOnly
    ) {
      // Check which users are left in the list that aren't members
      const remaining = batch.filter((id) => !members.has(id))

      if (bulkActionUsers) {
        bulkActionBatch.push(...remaining)
      } else {
        for (const id of remaining) {
          try {
            const possibleUser = await actionUser(guild, id, reason)
            success.push(actionResultToUserOrId(possibleUser) ?? id)
          } catch (e: unknown) {
            failure.push({
              user: id,
              reason: String(e),
            })
          }
        }
      }
    }

    if (bulkActionUsers && bulkActionBatch.length > 0) {
      const { success: bulkSuccess, failure: bulkFailure } =
        await bulkActionUsers(guild, bulkActionBatch, reason)

      success.push(...bulkSuccess)
      failure.push(...bulkFailure)
    }

    progress += batch.length

    await interaction.editReply(
      `Checking user ${progress.toLocaleString()}/${total.toLocaleString()} (${(
        (progress / total) *
        100
      ).toFixed(
        2,
      )}%)\n${capitalize(actioned)} ${plural('user', success.length)} so far...`,
    )
  }

  const formattedSuccess = success
    .map((user) => formatUserOrId(idOnly, user))
    .join('\n')

  const formattedFailure = failure
    .map((fail) => `${formatUserOrId(idOnly, fail.user)}: ${fail.reason}`)
    .join('\n')

  const content: string[] = []
  const files: AttachmentPayload[] = []

  if (success.length > 0) {
    content.push(`Successfully ${actioned} ${plural('user', success.length)}:`)

    if (success.length > OUTPUT_LIMIT) {
      files.push({
        name: `mass_${action}.txt`,
        attachment: Buffer.from(formattedSuccess, 'utf8'),
      })
    } else {
      content.push(codeBlock(formattedSuccess))
    }
  }

  if (failure.length > 0) {
    content.push(`Failed to ${action} ${plural('user', failure.length)}:`)

    if (failure.length > OUTPUT_LIMIT) {
      files.push({
        name: `mass_failed_${action}.txt`,
        attachment: Buffer.from(formattedFailure, 'utf8'),
      })
    } else {
      content.push(codeBlock(formattedFailure))
    }
  }

  if (content.length === 0) {
    content.push(`Successfully ${actioned} no users, and no errors happened.`)
  }

  await interaction.editReply({
    content: content.join('\n'),
    files,
  })
}

function formatUserOrId(idOnly: boolean, user: UserOrId): string {
  return typeof user === 'string'
    ? user
    : idOnly
      ? user.id
      : formatUser(user, { markdown: false })
}

function actionResultToUserOrId(
  result: Awaited<ReturnType<ActionUser>>,
): UserOrId | undefined | null {
  return result instanceof GuildMember
    ? result.user
    : result instanceof User
      ? result
      : result
}

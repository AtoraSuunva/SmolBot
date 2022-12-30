import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
  Guild,
  GuildBan,
  GuildMember,
  User,
} from 'discord.js'
import {
  botHasPermissionsGuard,
  formatUser,
  getGuild,
  getUsers,
  SleetSlashCommand,
  tryFetchMember,
} from 'sleetcord'

export const softban = new SleetSlashCommand(
  {
    name: 'softban',
    description:
      'Softbans a user (ban + unban). Unbans + bans already-banned users. Useful to purge messages.',
    default_member_permissions: ['BanMembers'],
    dm_permission: false,
    options: [
      {
        name: 'users',
        type: ApplicationCommandOptionType.String,
        description: 'The users to softban',
        required: true,
      },
      {
        name: 'delete_messages',
        type: ApplicationCommandOptionType.Integer,
        description: 'The number of days of messages to delete (default: 1)',
        min_value: 0,
        max_value: 7,
      },
      {
        name: 'reason',
        type: ApplicationCommandOptionType.String,
        description: 'The reason for the softban (default: none)',
      },
      {
        name: 'ephemeral',
        type: ApplicationCommandOptionType.Boolean,
        description: 'Ephemeral softban (default: false)',
      },
    ],
  },
  {
    run: runSoftban,
  },
)

interface SoftbanActionSuccess {
  user: User
}

interface SoftbanActionFail extends SoftbanActionSuccess {
  reason: string
}

type SoftbanAction = SoftbanActionSuccess | SoftbanActionFail

interface ActionResult {
  succeeded: SoftbanActionSuccess[]
  failed: SoftbanActionFail[]
}

async function runSoftban(interaction: ChatInputCommandInteraction) {
  await botHasPermissionsGuard(interaction, ['BanMembers'])

  const users = await getUsers(interaction, 'users', true)
  const deleteMessages = interaction.options.getInteger('delete_messages') ?? 1
  const reason = interaction.options.getString('reason') ?? 'No reason provided'
  const formattedReason = `Softban by ${interaction.user.tag} for: ${reason}`
  const ephemeral = interaction.options.getBoolean('ephemeral') ?? false

  const guild = await getGuild(interaction, true)
  const me = await guild.members.fetchMe()
  const interactionMember = interaction.member as GuildMember
  const userHighestRole = interactionMember.roles.highest
  const myHighestRole = me.roles.highest

  const toBan: User[] = []
  const earlyFailed: SoftbanActionFail[] = []

  for (const user of users) {
    const member = await tryFetchMember(guild, user.id)

    if (user.id === me.user.id) {
      earlyFailed.push({ user, reason: 'This is me.' })
    } else if (user.id === interaction.user.id) {
      earlyFailed.push({ user, reason: 'You cannot softban yourself.' })
    } else if (
      member &&
      member.roles.highest.position >= userHighestRole.position
    ) {
      earlyFailed.push({
        user,
        reason:
          'You cannot softban someone with a higher or equal role to you.',
      })
    } else if (
      member &&
      member.roles.highest.position >= myHighestRole.position
    ) {
      earlyFailed.push({
        user,
        reason: 'I cannot softban someone with a higher or equal role to me.',
      })
    } else {
      toBan.push(user)
    }
  }

  if (toBan.length === 0) {
    return interaction.reply({
      ephemeral: true,
      content: `No valid users to softban.\n${formatFails(earlyFailed)}`,
    })
  }

  await interaction.deferReply({ ephemeral })

  const context: BanContext = {
    guild,
    delete_messages: deleteMessages,
    reason: formattedReason,
  }

  const actionResults = await softbanUsers(toBan, context)

  const succeeded = actionResults.succeeded
  const failed = actionResults.failed

  const totalFails = [...earlyFailed, ...failed]
  const succ =
    succeeded.length > 0 ? `\n${formatSuccesses(succeeded)}` : ' Nobody!'
  const fail =
    totalFails.length > 0 ? `\n**Failed:**\n${formatFails(totalFails)}` : ''

  return interaction.editReply(`**Softbanned**${succ}${fail}`)
}

/**
 * Provides some "context" to softban the user correctly, in the right guild
 */
interface BanContext {
  guild: Guild
  delete_messages: number
  reason: string
}

async function softbanUsers(
  users: User[],
  context: BanContext,
): Promise<ActionResult> {
  const results = await Promise.all(users.map((m) => softbanUser(m, context)))

  const succeeded: SoftbanActionSuccess[] = []
  const failed: SoftbanActionFail[] = []

  for (const result of results) {
    if ('reason' in result) {
      failed.push(result)
    } else {
      succeeded.push(result)
    }
  }

  return { succeeded, failed }
}

async function softbanUser(
  user: User,
  { delete_messages, reason, guild }: BanContext,
): Promise<SoftbanAction> {
  try {
    const isAlreadyBanned = await tryFetchBan(guild, user)

    if (isAlreadyBanned) {
      await guild.bans.remove(user, 'Softban')
    }

    await guild.bans.create(user, {
      reason,
      deleteMessageDays: delete_messages,
    })

    if (!isAlreadyBanned) {
      await guild.bans.remove(user, 'Softban')
    }

    return { user }
  } catch (e) {
    return { user, reason: e instanceof Error ? e.message : String(e) }
  }
}

async function tryFetchBan(guild: Guild, user: User): Promise<GuildBan | null> {
  try {
    return await guild.bans.fetch(user)
  } catch {
    return null
  }
}

function formatSuccesses(success: SoftbanActionSuccess[]): string {
  return success.map((succ) => `> ${formatUser(succ.user)}`).join('\n')
}

function formatFails(failed: SoftbanActionFail[]): string {
  return failed
    .map((fail) => `> ${formatUser(fail.user)} - ${fail.reason}`)
    .join('\n')
}

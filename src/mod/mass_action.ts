import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  User,
} from 'discord.js'
import {
  getUsers,
  inGuildGuard,
  SleetSlashCommand,
  getGuild,
  tryFetchMember,
  formatUser,
} from 'sleetcord'

export const mass_ban = new SleetSlashCommand(
  {
    name: 'mass_ban',
    description: 'Mass ban users',
    default_member_permissions: ['BanMembers'],
    dm_permission: false,
    options: [
      {
        name: 'users',
        description: 'The users to ban',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: 'reason',
        description: 'The reason for the ban',
        type: ApplicationCommandOptionType.String,
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
    description: 'Mass kick users',
    default_member_permissions: ['KickMembers'],
    dm_permission: false,
    options: [
      {
        name: 'users',
        description: 'The users to kick',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: 'reason',
        description: 'The reason for the kick',
        type: ApplicationCommandOptionType.String,
      },
    ],
  },
  {
    run: runMassKick,
  },
)

/** Instead of outputting as a message, instead output as a file after this many successes/fails */
const OUTPUT_LIMIT = 15

interface ActionFail {
  user: User
  reason: string
}

type ActionUser = (guild: Guild, user: User, reason: string) => Promise<unknown>
type CheckMember = (member: GuildMember) => boolean

async function runMassBan(interaction: ChatInputCommandInteraction) {
  await runMassAction(
    interaction,
    'ban',
    'banned',
    (g, u, reason) => g.bans.create(u.id, { reason }),
    (m) => m.bannable,
  )
}

async function runMassKick(interaction: ChatInputCommandInteraction) {
  await runMassAction(
    interaction,
    'kick',
    'kicked',
    (g, u, reason) => g.members.kick(u.id, reason),
    (m) => m.kickable,
    true,
  )
}

async function runMassAction(
  interaction: ChatInputCommandInteraction,
  action: string,
  actioned: string,
  actionUser: ActionUser,
  checkMember: CheckMember,
  mustBeInGuild = false,
) {
  inGuildGuard(interaction)
  const guild = await getGuild(interaction, true)
  const users = await getUsers(interaction, 'users', true)
  const userReason =
    interaction.options.getString('reason') ?? 'No reason provided'
  const reason = `Mass ${action} by ${interaction.user.tag}: ${userReason}`

  const interactionMember = await guild.members.fetch(interaction.user.id)
  const isOwner = interactionMember.id === guild.ownerId
  const me = await guild.members.fetchMe()
  const userHighestRole = interactionMember.roles.highest
  const myHighestRole = me.roles.highest

  const success: User[] = []
  const failure: ActionFail[] = []

  for (const user of users) {
    const member = await tryFetchMember(guild, user.id)
    let fail: string | null = null

    if (member) {
      if (!checkMember(member)) {
        fail = `I cannot ${action} this user`
      } else if (
        !isOwner &&
        member.roles.highest.position >= userHighestRole.position
      ) {
        fail = `You cannot ${action} someone with a higher or equal role to you`
      } else if (member.roles.highest.position >= myHighestRole.position) {
        fail = `I cannot ${action} someone with a higher or equal role to me`
      }
    } else if (mustBeInGuild) {
      fail = `User is not in this guild`
    }

    if (fail) {
      failure.push({
        user,
        reason: fail,
      })
      continue
    }

    try {
      await actionUser(guild, user, reason)
      success.push(user)
    } catch (e: unknown) {
      failure.push({
        user,
        reason: String(e),
      })
    }
  }

  const formattedSuccess = success
    .map((user) => `> ${formatUser(user)}`)
    .join('\n')
  const formattedFailure = failure
    .map((fail) => `> ${formatUser(fail.user)} <${fail.reason}>`)
    .join('\n')

  const output: string[] = []

  if (success.length > 0) {
    output.push(
      `Successfully ${actioned} ${success.length} ${plural(
        'user',
        success.length,
      )}:`,
    )
    output.push(formattedSuccess)
  }

  if (failure.length > 0) {
    output.push(
      `Failed to ${action} ${failure.length} ${plural(
        'user',
        failure.length,
      )}:`,
    )
    output.push(formattedFailure)
  }

  const ephemeral = success.length === 0

  if (success.length + failure.length > OUTPUT_LIMIT) {
    await interaction.reply({
      content: `See output file for info (Success: ${success.length}, Failure: ${failure.length})`,
      files: [
        {
          name: `mass_${action}.txt`,
          attachment: Buffer.from(output.join('\n')),
        },
      ],
      ephemeral,
    })
  } else {
    await interaction.reply({
      content: output.join('\n'),
      ephemeral,
    })
  }
}

function plural(word: string, count: number): string {
  return `${word}${count === 1 ? '' : 's'}`
}

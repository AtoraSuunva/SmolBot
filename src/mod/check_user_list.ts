import {
  ApplicationCommandOptionType,
  AttachmentBuilder,
  ChatInputCommandInteraction,
} from 'discord.js'
import {
  SleetSlashCommand,
  formatUser,
  getGuild,
  inGuildGuard,
  makeChoices,
} from 'sleetcord'
import { HOUR } from 'sleetcord-common'
import { plural } from '../util/format.js'

const actionChoices = makeChoices(['none', 'timeout', 'kick', 'ban'])

export const check_user_list = new SleetSlashCommand(
  {
    name: 'check_user_list',
    description:
      'Check if any users in a list are on the server, and optionally action them',
    dm_permission: false,
    options: [
      {
        name: 'users',
        description: 'A list of user IDs to check, separated by spaces',
        type: ApplicationCommandOptionType.String,
      },
      {
        name: 'user_file',
        description:
          'A text file containing a list of user IDs to check, one per line',
        type: ApplicationCommandOptionType.Attachment,
      },
      {
        name: 'action',
        description: 'The action to take if the user is found',
        type: ApplicationCommandOptionType.String,
        choices: actionChoices,
      },
      {
        name: 'mass_ban',
        description:
          'Skip checking if the user is on the server and try immediately banning them instead',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'reason',
        description: 'The reason for the action',
        type: ApplicationCommandOptionType.String,
      },
    ],
  },
  {
    run: runCheckUserList,
  },
)

const idLike = /^\d{1,20}$/

async function runCheckUserList(interaction: ChatInputCommandInteraction) {
  inGuildGuard(interaction)

  const users = interaction.options.getString('users')
  const userFile = interaction.options.getAttachment('user_file')
  const action = interaction.options.getString('action')
  const massBan = interaction.options.getBoolean('mass_ban')
  const reason =
    (interaction.options.getString('reason') ?? 'No reason provided') +
    ` by ${formatUser(interaction.user, {
      markdown: false,
    })}`

  await interaction.deferReply()
  const guild = await getGuild(interaction)

  if (!guild) {
    return interaction.editReply('Failed to get server info')
  }

  if (!users && !userFile) {
    return interaction.editReply(
      'You must provide a list or a file of user IDs to check',
    )
  }

  const toCheck: string[] = []

  if (users) {
    const userList = users.split(' ')
    for (const id of userList) {
      if (idLike.test(id)) {
        toCheck.push(id)
      }
    }
  }

  if (userFile) {
    if (!userFile.contentType?.startsWith('text/plain')) {
      return interaction.editReply('User ID file must be a text file!')
    }

    const req = await fetch(userFile.url)

    if (!req.ok) {
      return interaction.editReply('Failed to download user ID file')
    }

    const text = await req.text()
    const userList = text.split('\n')
    for (const id of userList) {
      const trimmed = id.trim()
      if (idLike.test(trimmed)) {
        toCheck.push(trimmed)
      }
    }
  }

  if (toCheck.length === 0) {
    return interaction.editReply('No valid user IDs found in input')
  }

  const found: string[] = []
  const actionResult: string[] = []
  let actionFail = 0

  for (const id of toCheck) {
    if (massBan) {
      try {
        await guild.members.ban(id, { reason })
        actionResult.push(`Banned ${id}`)
        continue
      } catch (e) {
        actionResult.push(`Failed: mass ban - ${id} - ${e}`)
        actionFail++
      }
    } else {
      const user = await guild.members.fetch(id).catch(() => null)
      if (user) {
        found.push(user.id)

        try {
          switch (action) {
            case 'timeout':
              await user.timeout(24 * HOUR, reason)
              actionResult.push(`Timed out ${user.id}`)
              break
            case 'kick':
              await user.kick(reason)
              actionResult.push(`Kicked ${user.id}`)
              break
            case 'ban':
              await user.ban({ reason })
              actionResult.push(`Banned ${user.id}`)
              break
          }
        } catch (e) {
          actionResult.push(`Failed: ${action} - ${user.id} - ${e}`)
          actionFail++
        }
      }
    }
  }

  if (found.length === 0) {
    return interaction.editReply('No users found on the server')
  }

  const actionSuccess = actionResult.length - actionFail
  const actionReply = action
    ? ` and ${action} ${plural('member', actionSuccess)}${actionFail > 0 ? ` (${actionFail} failed)` : ''}`
    : ''
  const reply = `Found ${plural('user', found.length)} on the server${actionReply}:`

  const files: AttachmentBuilder[] = [
    new AttachmentBuilder(Buffer.from(found.join('\n')), {
      name: 'found_users.txt',
      description: 'List of users found on the server',
    }),
  ]

  if (action && actionResult.length > 0) {
    files.push(
      new AttachmentBuilder(Buffer.from(action), {
        name: 'action.txt',
        description: 'List of actions taken on users',
      }),
    )
  }

  return interaction.editReply({
    content: reply,
    files,
  })
}

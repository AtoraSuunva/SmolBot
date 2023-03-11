import { Prisma } from '@prisma/client'
import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
} from 'discord.js'
import { formatUser, SleetSlashSubcommand } from 'sleetcord'
import { respondWithPaginatedWarnings, WarningFetcher } from './pagination.js'
import { fetchPaginatedWarnings } from './utils.js'

export const warningsSearch = new SleetSlashSubcommand(
  {
    name: 'search',
    description: 'Search for warnings',
    options: [
      {
        name: 'user',
        description: 'Filter warnings for this user',
        type: ApplicationCommandOptionType.User,
      },
      {
        name: 'reason',
        description: 'Filter warnings containing this in the reason',
        type: ApplicationCommandOptionType.String,
      },
      {
        name: 'mod_note',
        description: 'Filter warnings containing this in the mod note',
        type: ApplicationCommandOptionType.String,
      },
      {
        name: 'permanent',
        description: 'Filter warnings that are permanent or not',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'void',
        description: 'Filter warnings that are void or not',
        type: ApplicationCommandOptionType.Boolean,
      },
    ],
  },
  {
    run: warningsViewRun,
  },
)

function warningsViewRun(interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser('user')
  const reason = interaction.options.getString('reason')
  const modNote = interaction.options.getString('mod_note')
  const permanent = interaction.options.getBoolean('permanent')
  const voidWarning = interaction.options.getBoolean('void')

  const filters = {
    ...(user ? { userID: user.id } : {}),
    ...(reason ? { reason: { contains: reason } } : {}),
    ...(modNote ? { modNote: { contains: modNote } } : {}),
    ...(permanent !== null ? { permanent } : {}),
    ...(voidWarning !== null ? { void: voidWarning } : {}),
  } satisfies Prisma.WarningWhereInput

  const fetchWarnings: WarningFetcher = (guildID, config, currentPage) =>
    fetchPaginatedWarnings(guildID, config, currentPage, filters)

  const formattedUser = user
    ? {
        name: formatUser(user, { markdown: false }),
        iconURL: user.displayAvatarURL(),
      }
    : null

  respondWithPaginatedWarnings(interaction, fetchWarnings, {
    formatAuthor: () => formattedUser,
    showUserOnWarning: !user,
    modView: true,
  })
}

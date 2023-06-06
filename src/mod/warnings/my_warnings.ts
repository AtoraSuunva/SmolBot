import { Prisma } from '@prisma/client'
import { ChatInputCommandInteraction } from 'discord.js'
import { formatUser, SleetSlashCommand } from 'sleetcord'
import { respondWithPaginatedWarnings, WarningFetcher } from './pagination.js'
import { fetchPaginatedWarnings } from './utils.js'

export const myWarnings = new SleetSlashCommand(
  {
    name: 'my_warnings',
    description: 'View your warnings',
  },
  {
    run: myWarningsRun,
  },
)

async function myWarningsRun(interaction: ChatInputCommandInteraction) {
  const user = interaction.user

  const filters = {
    userID: user.id,
  } satisfies Prisma.WarningWhereInput

  const fetchWarnings: WarningFetcher = (guildID, config, currentPage) =>
    fetchPaginatedWarnings(guildID, config, currentPage, filters)

  const formattedUser = {
    name: formatUser(user, { markdown: false }),
    iconURL: user.displayAvatarURL(),
  }

  await respondWithPaginatedWarnings(interaction, fetchWarnings, {
    formatAuthor: () => formattedUser,
    modView: false,
    ephemeral: true,
  })
}

import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
} from 'discord.js'
import { formatUser, getGuild, SleetSlashSubcommand } from 'sleetcord'
import { prisma } from '../../util/db.js'
import { respondWithPaginatedWarnings, WarningFetcher } from './pagination.js'
import { fetchPaginatedWarningHistory } from './utils.js'

export const warningsHistory = new SleetSlashSubcommand(
  {
    name: 'history',
    description: 'View the history of a warning',
    options: [
      {
        name: 'warning_id',
        description: 'The ID of the warning to view',
        type: ApplicationCommandOptionType.Integer,
        required: true,
      },
    ],
  },
  {
    run: warningHistoryRun,
  },
)

async function warningHistoryRun(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)
  const warningID = interaction.options.getInteger('warning_id', true)

  const warningHistory = await prisma.warning.findFirst({
    where: {
      guildID: guild.id,
      warningID,
      validUntil: null,
    },
  })

  if (!warningHistory) {
    await interaction.reply({
      content: `Warning #${warningID} not found`,
      ephemeral: true,
    })
    return
  }

  const user = await interaction.client.users.fetch(warningHistory.userID)

  const fetchWarnings: WarningFetcher = (guildID, _config, currentPage) =>
    fetchPaginatedWarningHistory(guildID, warningID, currentPage)

  const formattedUser = {
    name: formatUser(user, { markdown: false }),
    iconURL: user.displayAvatarURL(),
  }

  respondWithPaginatedWarnings(interaction, fetchWarnings, {
    formatAuthor: () => formattedUser,
    formatTitle: () => `Warning #${warningID} history`,
    formatDescription: () => null,
    modView: true,
  })
}

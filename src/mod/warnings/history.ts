import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
} from 'discord.js'
import { getGuild, SleetSlashSubcommand } from 'sleetcord'
import { prisma } from '../../util/db.js'
import { formatUserWarningsToEmbed, getConfigForGuild } from './utils.js'

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
  const config = await getConfigForGuild(guild.id, true)

  const warningHistory = await prisma.warning.findMany({
    where: {
      guildID: guild.id,
      warningID,
    },
  })

  if (warningHistory.length === 0) {
    interaction.reply({
      content: `No history found for warning #${warningID}`,
      ephemeral: true,
    })
    return
  }

  const user = await interaction.client.users.fetch(warningHistory[0].userID)
  const embed = formatUserWarningsToEmbed(user, warningHistory, config, {
    showModNote: true,
    showResponsibleMod: true,
    showVersion: true,
  })

  await interaction.reply({
    embeds: [embed],
  })
}

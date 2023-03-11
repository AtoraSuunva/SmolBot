import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
} from 'discord.js'
import { getGuild, SleetSlashSubcommand } from 'sleetcord'
import {
  formatUserWarningsToEmbed,
  getConfigForGuild,
  getWarningsForUser,
} from './utils.js'

export const warningsSearch = new SleetSlashSubcommand(
  {
    name: 'search',
    description: 'Search for warnings',
    options: [
      {
        name: 'user',
        description: 'The user to view warnings for',
        type: ApplicationCommandOptionType.User,
        required: true,
      },
    ],
  },
  {
    run: warningsViewRun,
  },
)

async function warningsViewRun(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)
  const user = interaction.options.getUser('user', true)
  const config = await getConfigForGuild(guild.id, true)

  const allWarnings = await getWarningsForUser(guild.id, user.id)
  const embed = formatUserWarningsToEmbed(user, allWarnings, config, {
    showModNote: true,
    showResponsibleMod: true,
    showVersion: true,
  })

  await interaction.reply({
    embeds: [embed],
  })
}

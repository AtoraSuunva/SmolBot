import { ChatInputCommandInteraction } from 'discord.js'
import { getGuild, SleetSlashSubcommand } from 'sleetcord'
import { prisma } from '../../../util/db.js'
import { channelFormatter, formatConfig } from '../../../util/format.js'

export const warningsConfigView = new SleetSlashSubcommand(
  {
    name: 'view',
    description: 'View the warnings configuration',
  },
  {
    run: runWarningsConfigView,
  },
)

async function runWarningsConfigView(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)

  const config = await prisma.warningConfig.findUnique({
    where: {
      guildID: guild.id,
    },
  })

  if (!config) {
    await interaction.reply({
      content: 'No configuration found',
    })
  } else {
    await interaction.reply({
      content: `Current configuration:\n${formatConfig({
        config,
        guild,
        formatters: {
          archiveChannel: channelFormatter,
        },
      })}`,
    })
  }
}

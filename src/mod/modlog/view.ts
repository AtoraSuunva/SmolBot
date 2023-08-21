import { ChatInputCommandInteraction } from 'discord.js'
import { getGuild, SleetSlashSubcommand } from 'sleetcord'
import { prisma } from '../../util/db.js'
import { formatConfig } from '../../util/format.js'

export const view = new SleetSlashSubcommand(
  {
    name: 'view',
    description: 'View the modlog',
  },
  {
    run: handleView,
  },
)

async function handleView(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)

  const config = await prisma.modLogConfig.findFirst({
    where: {
      guildID: guild.id,
    },
  })

  if (!config) {
    await interaction.reply({
      content: 'No modlog settings found',
      ephemeral: true,
    })
    return
  }

  const formattedConfig = formatConfig({ config, guild })
  await interaction.reply({
    content: formattedConfig,
  })
}

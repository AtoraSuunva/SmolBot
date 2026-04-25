import { ApplicationCommandOptionType, ChatInputCommandInteraction } from 'discord.js'
import { inGuildGuard, SleetSlashSubcommand } from 'sleetcord'

import { plural } from '../../../helpers/format.js'
import { formatRules, getRulesMany } from '../utils.js'

export const automod_view = new SleetSlashSubcommand(
  {
    name: 'view',
    description: 'View the automod rules',
    options: [
      {
        name: 'name',
        description: 'Search rules by name',
        type: ApplicationCommandOptionType.String,
      },
      {
        name: 'type',
        description: 'Search rules by type',
        type: ApplicationCommandOptionType.String,
      },
    ],
  },
  {
    run: runAutomodView,
  },
)

async function runAutomodView(interaction: ChatInputCommandInteraction) {
  inGuildGuard(interaction)

  const name = interaction.options.getString('name')
  const type = interaction.options.getString('type')

  const rules = await getRulesMany({ guildID: interaction.guildId, name, type })

  if (rules.length === 0) {
    await interaction.reply('No rules found')
    return
  }

  const formattedRules = formatRules(rules)

  await interaction.reply(`Found ${plural('rule', rules.length)}:\n${formattedRules}`)
}

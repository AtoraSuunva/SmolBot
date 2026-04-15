import { ApplicationCommandOptionType, ChatInputCommandInteraction } from 'discord.js'
import { escapeAllMarkdown, inGuildGuard, SleetSlashSubcommand } from 'sleetcord'

import { prisma } from '../../../helpers/db.js'
import { formatRules, getRuleFirst, ruleAutocomplete } from './utils.js'

export const automod_remove = new SleetSlashSubcommand(
  {
    name: 'remove',
    description: 'Remove a rule from automod',
    options: [
      {
        name: 'rule',
        description: 'The rule to remove',
        type: ApplicationCommandOptionType.String,
        required: true,
        autocomplete: ruleAutocomplete,
      },
    ],
  },
  {
    run: runAutomodRemove,
  },
)

async function runAutomodRemove(interaction: ChatInputCommandInteraction) {
  inGuildGuard(interaction)
  await interaction.deferReply()

  const ruleName = interaction.options.getString('rule', true)

  const rule = await getRuleFirst({ guildId: interaction.guildId, name: ruleName })

  if (!rule) {
    await interaction.editReply(`No rule found with name "${escapeAllMarkdown(ruleName)}"`)
    return
  }

  await prisma.automodRule.delete({
    where: {
      ruleID: rule.ruleID,
    },
  })

  const formattedRule = formatRules([rule])

  await interaction.editReply(`Removed rule:\n${formattedRule}`)
}

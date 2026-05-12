import { ApplicationCommandOptionType, ChatInputCommandInteraction } from 'discord.js'
import { escapeAllMarkdown, inGuildGuard, SleetSlashSubcommand } from 'sleetcord'

import { prisma } from '../../../helpers/db.js'
import { formatRules } from '../utils.js'
import { getRuleFirst, ruleAutocomplete } from '../utils.js'

export const automod_delete = new SleetSlashSubcommand(
  {
    name: 'delete',
    description: 'Delete a rule from automod',
    options: [
      {
        name: 'rule',
        description: 'The rule to delete',
        type: ApplicationCommandOptionType.String,
        required: true,
        autocomplete: ruleAutocomplete,
      },
    ],
  },
  {
    run: runAutomodDelete,
  },
)

async function runAutomodDelete(interaction: ChatInputCommandInteraction) {
  inGuildGuard(interaction)
  await interaction.deferReply()

  const ruleID = interaction.options.getString('rule', true)

  const rule = await getRuleFirst({ guildID: interaction.guildId, ruleID })

  if (!rule) {
    await interaction.editReply(`No rule found with ID "${escapeAllMarkdown(ruleID)}"`)
    return
  }

  const oldRule = await prisma.automodRule.delete({
    where: {
      ruleID: rule.ruleID,
    },
  })

  await interaction.editReply(
    `Removed rule "${oldRule.name}" from automod:\n${formatRules([oldRule])}`,
  )
}

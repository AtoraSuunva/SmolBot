import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  MessageFlags,
} from 'discord.js'
import { escapeAllMarkdown, inGuildGuard, SleetSlashSubcommand } from 'sleetcord'

import { findFirstRule, formatRuleDetails, ruleAutocomplete } from '../utils.js'

export const automod_details = new SleetSlashSubcommand(
  {
    name: 'details',
    description: 'View details about an automod rule',
    options: [
      {
        name: 'rule_id',
        description: 'The ID of the rule to view',
        type: ApplicationCommandOptionType.String,
        autocomplete: ruleAutocomplete,
        required: true,
      },
    ],
  },
  {
    run: runAutomodDetails,
  },
)

async function runAutomodDetails(interaction: ChatInputCommandInteraction) {
  inGuildGuard(interaction)

  const ruleID = interaction.options.getString('rule_id', true)

  await interaction.deferReply()

  const rule = await findFirstRule({ guildID: interaction.guildId, ruleID })

  if (!rule) {
    await interaction.editReply({
      content: `No rule found with ID "${escapeAllMarkdown(ruleID)}"`,
    })
    return
  }

  const container = formatRuleDetails(rule)

  await interaction.editReply({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  })
}

// automod:details:{ruleID}
export async function handleDetailsInteraction(
  interaction: MessageComponentInteraction<'cached' | 'raw'>,
  params: string[],
) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const [ruleID] = params
  const rules = await findFirstRule({ guildID: interaction.guildId, ruleID })

  if (!rules) {
    await interaction.editReply(`Rule "${ruleID}" not found`)
    return
  }

  const ruleComponent = formatRuleDetails(rules)

  await interaction.editReply({
    components: [ruleComponent],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  })
}

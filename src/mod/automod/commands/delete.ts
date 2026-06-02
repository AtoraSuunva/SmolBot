import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
  Colors,
  MessageComponentInteraction,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js'
import { escapeAllMarkdown, formatUser, inGuildGuard, SleetSlashSubcommand } from 'sleetcord'

import { deleteAutomodRule, formatRuleDetails } from '../utils.js'
import { findFirstAutomodRule, ruleAutocomplete } from '../utils.js'

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
  const ruleID = interaction.options.getString('rule', true)

  return deleteAndReply(interaction, ruleID)
}

export async function handleDeleteInteraction(
  interaction: MessageComponentInteraction<'cached' | 'raw'>,
  params: string[],
) {
  const ruleID = params[0]

  return deleteAndReply(interaction, ruleID)
}

async function deleteAndReply(
  interaction:
    | ChatInputCommandInteraction<'cached' | 'raw'>
    | MessageComponentInteraction<'cached' | 'raw'>,
  ruleID: string,
) {
  const rule = await findFirstAutomodRule({ where: { guildID: interaction.guildId, ruleID } })

  if (!rule) {
    await interaction.reply({
      content: `No rule found with ID "${escapeAllMarkdown(ruleID)}"`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    })
    return
  }

  await interaction.deferReply()

  const oldRule = await deleteAutomodRule({
    where: {
      ruleID: rule.ruleID,
    },
  })

  const header = new TextDisplayBuilder({
    content: `${formatUser(interaction.user)} deleted rule "${escapeAllMarkdown(oldRule.name)}" (${oldRule.ruleID})`,
  })
  const container = formatRuleDetails(oldRule, { showButtons: false, accentColor: Colors.Red })

  await interaction.editReply({
    components: [header, container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  })
}

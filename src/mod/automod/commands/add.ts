import {
  ApplicationCommandOptionType,
  Colors,
  MessageComponentInteraction,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js'
import { escapeAllMarkdown, formatUser, inGuildGuard, SleetSlashSubcommandBody } from 'sleetcord'
import { DAY } from 'sleetcord-common'

import { Prisma } from '../../../generated/prisma/client.js'
import { prisma } from '../../../helpers/db.js'
import { automodActionCommandOptionChoices } from '../actions.js'
import { AutomodRuleGroup } from '../modules/AutomodRuleGroup.js'
import { rules } from '../rules/index.js'
import { formatRule, formatRuleDetails } from '../utils.js'

export const addOptions: NonNullable<SleetSlashSubcommandBody['options']> = [
  {
    name: 'name',
    description: 'Name of the rule (for your reference, not shown to members)',
    type: ApplicationCommandOptionType.String,
    required: true,
    max_length: 100,
  },
  {
    name: 'action',
    description: 'Action to take when the rule is triggered',
    type: ApplicationCommandOptionType.String,
    required: true,
    choices: automodActionCommandOptionChoices,
  },
  {
    name: 'message',
    description:
      'Message to show to members when the rule is triggered (use "-" for a silent rule, default: "-")',
    type: ApplicationCommandOptionType.String,
    max_length: 1500,
  },
  {
    name: 'duration',
    description: 'Duration of the punishment in seconds for timeouts (default: 30s)',
    type: ApplicationCommandOptionType.Integer,
    min_value: 1,
    max_value: (7 * DAY) / 1000,
  },
]

export const automod_add = new AutomodRuleGroup(
  {
    name: 'add',
    description: 'Add a new rule to automod',
    requireParams: true,
    options: rules.map((opt) => opt.withBodyOptions(addOptions)),
  },
  {
    async runResult(interaction, rule, params) {
      inGuildGuard(interaction)
      await interaction.deferReply()

      const name = interaction.options.getString('name', true)
      const action = interaction.options.getString('action', true)
      const message = interaction.options.getString('message')
      const duration = interaction.options.getInteger('duration')

      const newRule = await prisma.automodRule.create({
        data: {
          ruleID: crypto.randomUUID().split('-')[0],
          guildID: interaction.guildId,
          name,
          action,
          type: rule.name,
          message: message ? (message === '-' ? null : message) : null,
          duration: duration ?? 30,
          parameters: params,
        },
      })

      const newHeader = new TextDisplayBuilder({
        content: `Added rule "${escapeAllMarkdown(name)}" to automod:`,
      })
      const newRuleComponent = formatRule(newRule, { accentColor: Colors.Green })

      await interaction.editReply({
        components: [newHeader, newRuleComponent],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      })
    },
  },
)

export async function handleCopyInteraction(
  interaction: MessageComponentInteraction<'cached' | 'raw'>,
  params: string[],
) {
  const [ruleID] = params
  const rule = await prisma.automodRule.findFirst({
    where: {
      guildID: interaction.guildId,
      ruleID,
    },
  })

  if (!rule) {
    await interaction.reply({
      content: `Rule "${ruleID}" not found`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await interaction.deferReply()

  const newRule = await prisma.automodRule.create({
    data: {
      ruleID: crypto.randomUUID().split('-')[0],
      guildID: interaction.guildId,
      name: `${rule.name} (Copy)`,
      action: rule.action,
      type: rule.type,
      message: rule.message,
      duration: rule.duration,
      parameters: rule.parameters ?? Prisma.JsonNull,
    },
  })

  const newHeader = new TextDisplayBuilder({
    content: `${formatUser(interaction.user)} copied rule "${escapeAllMarkdown(rule.name)}" to a new rule:`,
  })
  const newRuleComponent = formatRuleDetails(newRule, { accentColor: Colors.Green })

  await interaction.editReply({
    components: [newHeader, newRuleComponent],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  })
}

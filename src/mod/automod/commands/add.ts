import { ApplicationCommandOptionType } from 'discord.js'
import { inGuildGuard, SleetSlashSubcommandBody } from 'sleetcord'
import { DAY } from 'sleetcord-common'

import { prisma } from '../../../helpers/db.js'
import { automodActionChoices } from '../actions.js'
import { AutomodRuleGroup } from '../modules/AutomodRuleGroup.js'
import { rules } from '../rules/index.js'
import { formatRule } from '../utils.js'

export const addOptions: NonNullable<SleetSlashSubcommandBody['options']> = [
  {
    name: 'name',
    description: 'Name of the rule (for your reference, not shown to users)',
    type: ApplicationCommandOptionType.String,
    required: true,
  },
  {
    name: 'action',
    description: 'Action to take when the rule is triggered',
    type: ApplicationCommandOptionType.String,
    required: true,
    choices: automodActionChoices,
  },
  {
    name: 'message',
    description:
      'Message to show when the rule is triggered (use "-" for a silent rule, default: "-")',
    type: ApplicationCommandOptionType.String,
    max_length: 1900,
  },
  {
    name: 'duration',
    description: 'Duration of the punishment in seconds (for timeout)',
    type: ApplicationCommandOptionType.Integer,
    min_value: 1,
    max_value: (7 * DAY) / 1000,
  },
]

export const automod_add = new AutomodRuleGroup(
  {
    name: 'add',
    description: 'Add a new rule to automod',
    requireParams: false,
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
          duration,
          parameters: params,
        },
      })

      await interaction.editReply(`Added rule "${name}" to automod:\n${formatRule(newRule)}`)
    },
  },
)

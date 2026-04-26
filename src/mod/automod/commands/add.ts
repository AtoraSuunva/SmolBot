import { ApplicationCommandOptionType } from 'discord-api-types/v9'
import { inGuildGuard, SleetSlashSubcommandBody } from 'sleetcord'
import { DAY } from 'sleetcord-common'

import { prisma } from '../../../helpers/db.js'
import { automodActionChoices } from '../actions.js'
import { AutomodRuleGroup } from '../modules/AutomodRuleGroup.js'
import { messageRepeatsRule } from '../rules/MessageRepeats.js'
import { formatRule } from '../utils.js'
import { Prisma } from '../../../generated/prisma/client.js'

export const addOptions: NonNullable<SleetSlashSubcommandBody['options']> = [
  {
    name: 'name',
    description: 'The name of the rule (for your reference, not shown to users)',
    type: ApplicationCommandOptionType.String,
    required: true,
  },
  {
    name: 'action',
    description: 'The action to take when the rule is triggered',
    type: ApplicationCommandOptionType.String,
    required: true,
    choices: automodActionChoices,
  },
  {
    name: 'message',
    description:
      'The message to show when the rule is triggered (optional, leave blank for a silent rule)',
    type: ApplicationCommandOptionType.String,
    max_length: 1900,
  },
  {
    name: 'duration',
    description: 'The duration of the punishment in seconds (for timeout)',
    type: ApplicationCommandOptionType.Integer,
    min_value: 1,
    max_value: (7 * DAY) / 1000,
  },
  {
    name: 'delete',
    description: 'Whether to delete the message/reaction/etc that triggered the rule',
    type: ApplicationCommandOptionType.Boolean,
  },
]

export const automod_add = new AutomodRuleGroup(
  {
    name: 'add',
    description: 'Add a new rule to automod',
    requireParams: false,
    options: [messageRepeatsRule].map((opt) => opt.withBodyOptions(addOptions)),
  },
  {
    async runResult(interaction, rule, params) {
      inGuildGuard(interaction)
      await interaction.deferReply()

      const name = interaction.options.getString('name', true)
      const action = interaction.options.getString('action', true)
      const message = interaction.options.getString('message')
      const duration = interaction.options.getInteger('duration')
      const deleteTarget = interaction.options.getBoolean('delete')

      const newRule = await prisma.automodRule.create({
        data: {
          ruleID: crypto.randomUUID().split('-')[0],
          guildID: interaction.guildId,
          name,
          action,
          type: rule.name,
          message,
          duration,
          deleteTarget: deleteTarget ?? Prisma.skip,
          parameters: params,
        },
      })

      await interaction.editReply(`Added rule "${name}" to automod:\n${formatRule(newRule)}`)
    },
  },
)

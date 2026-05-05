import { InputJsonValue, JsonValue } from '@prisma/client/runtime/client'
import { ApplicationCommandOptionType } from 'discord.js'
import { inGuildGuard, SleetSlashSubcommandBody } from 'sleetcord'

import { Prisma } from '../../../generated/prisma/client.js'
import { prisma } from '../../../helpers/db.js'
import { AutomodRuleGroup } from '../modules/AutomodRuleGroup.js'
import { rules } from '../rules/index.js'
import { formatRule, ruleAutocomplete } from '../utils.js'
import { addOptions } from './add.js'

// oxlint-disable-next-line oxc/no-map-spread: we want to copy the options to avoid mutating the add options
const addOpts = addOptions.map((opt) => {
  return {
    ...opt,
    required: false,
  }
})

const editOptions: NonNullable<SleetSlashSubcommandBody['options']> = [
  {
    name: 'rule',
    description: 'The rule to edit',
    type: ApplicationCommandOptionType.String,
    required: true,
    autocomplete: ruleAutocomplete,
  },
  ...addOpts,
]

function assignDefined(
  target: object,
  ...sources: Array<Record<string, unknown> | InputJsonValue | NonNullable<JsonValue>>
) {
  return Object.assign(
    target,
    ...sources.map((source) => {
      return Object.fromEntries(
        Object.entries(source).filter(([, value]) => value !== undefined && value !== null),
      )
    }),
  )
}

export const automod_edit = new AutomodRuleGroup(
  {
    name: 'edit',
    description: 'Edit an existing automod rule',
    requireParams: false,
    options: rules.map((opt) => opt.withBodyOptions(editOptions, true)),
  },
  {
    async runResult(interaction, _rule, params) {
      inGuildGuard(interaction)
      await interaction.deferReply()

      const ruleID = interaction.options.getString('rule', true)

      const oldRule = await prisma.automodRule.findFirst({
        where: {
          ruleID,
        },
      })

      if (!oldRule) {
        await interaction.editReply(`There is no rule with ID "${ruleID}"`)
        return
      }

      const name = interaction.options.getString('name')
      const action = interaction.options.getString('action')
      const message = interaction.options.getString('message')
      const duration = interaction.options.getInteger('duration')

      const newRule = await prisma.automodRule.update({
        where: {
          ruleID: oldRule.ruleID,
        },
        data: {
          name: name ?? Prisma.skip,
          action: action ?? Prisma.skip,
          message: message ? (message === '-' ? null : message) : Prisma.skip,
          duration: duration ?? Prisma.skip,
          parameters: assignDefined({}, oldRule.parameters ?? {}, params),
        },
      })

      await interaction.editReply(
        `Edited rule "${oldRule.ruleID}" in automod, old -> new:\n${formatRule(newRule, oldRule)}`,
      )
    },
  },
)

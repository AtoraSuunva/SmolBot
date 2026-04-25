import { InputJsonValue, JsonValue } from '@prisma/client/runtime/client'
import { inGuildGuard } from 'sleetcord'

import { Prisma } from '../../../generated/prisma/client.js'
import { prisma } from '../../../helpers/db.js'
import { AutomodRuleGroup } from '../modules/AutomodRuleGroup.js'
import { messageRepeatsRule } from '../rules/MessageRepeats.js'
import { formatRules } from '../utils.js'
import { addOptions } from './add.js'

// oxlint-disable-next-line oxc/no-map-spread: we want to copy the options to avoid mutating the add options
const editOptions = addOptions.map((opt) => {
  return {
    ...opt,
    required: false,
  }
})

function assignDefined(
  target: object,
  ...sources: Array<Record<string, unknown> | InputJsonValue | NonNullable<JsonValue>>
) {
  return Object.assign(
    target,
    ...sources.map((source) => {
      return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined))
    }),
  )
}

export const automod_edit = new AutomodRuleGroup(
  {
    name: 'edit',
    description: 'Edit an existing automod rule',
    requireParams: false,
    options: [messageRepeatsRule].map((opt) => opt.withBodyOptions(editOptions)),
  },
  {
    async runResult(interaction, _rule, params) {
      inGuildGuard(interaction)
      await interaction.deferReply()

      const ruleID = interaction.options.getString('ruleID', true)

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
      const deleteMessage = interaction.options.getBoolean('delete')

      const newRule = await prisma.automodRule.update({
        where: {
          ruleID: oldRule.ruleID,
        },
        data: {
          name: name ?? Prisma.skip,
          action: action ?? Prisma.skip,
          message: message ?? Prisma.skip,
          duration: duration ?? Prisma.skip,
          deleteMessage: deleteMessage ?? Prisma.skip,
          parameters: assignDefined({}, oldRule.parameters ?? {}, params),
        },
      })

      await interaction.editReply(
        `Edited rule "${oldRule.ruleID}" in automod, old -> new:\n${formatRules([oldRule, newRule])}`,
      )
    },
  },
)

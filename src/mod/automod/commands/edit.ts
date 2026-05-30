import { InputJsonValue, JsonValue } from '@prisma/client/runtime/client'
import {
  ApplicationCommandOptionType,
  Colors,
  Interaction,
  MessageComponentInteraction,
  MessageFlags,
  TextDisplayBuilder,
  type ModalBuilder,
} from 'discord.js'
import { escapeAllMarkdown, formatUser, inGuildGuard, SleetSlashSubcommandBody } from 'sleetcord'
import { MINUTE } from 'sleetcord-common'

import { Prisma } from '../../../generated/prisma/client.js'
import { prisma } from '../../../helpers/db.js'
import type { PrismaAutomodRule } from '../automodMiddleware.js'
import { AutomodRuleGroup } from '../modules/AutomodRuleGroup.js'
import { rules } from '../rules/index.js'
import { formatRuleDetails, ruleAutocomplete } from '../utils.js'
import { addOptions } from './add.js'

// we want to copy the options to avoid mutating the add options
// oxlint-disable-next-line oxc/no-map-spread
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
    options: rules.map((opt) =>
      // add addOpts as non-required options and then add editOptions as-is
      opt
        .withBody({ options: addOpts }, { options: { required: false } })
        .withBody({ options: editOptions }),
    ),
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
        await interaction.editReply(`There is no rule with ID "${escapeAllMarkdown(ruleID)}"`)
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

      const newHeader = new TextDisplayBuilder({
        content: `Edited rule "${escapeAllMarkdown(oldRule.ruleID)}" in automod, new rule:`,
      })
      const newRuleComponent = formatRuleDetails(newRule, { accentColor: Colors.Blurple })
      const oldHeader = new TextDisplayBuilder({
        content: `Old rule:`,
      })
      const oldRuleComponent = formatRuleDetails(oldRule, {
        showButtons: false,
        accentColor: Colors.DarkBlue,
      })

      await interaction.editReply({
        components: [newHeader, newRuleComponent, oldHeader, oldRuleComponent],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      })
    },
  },
)

export async function handleEditInteraction(
  interaction: MessageComponentInteraction<'cached' | 'raw'>,
  params: string[],
) {
  const ruleID = params[0]

  const oldRule = await prisma.automodRule.findFirst({
    where: {
      ruleID,
    },
  })

  if (!oldRule) {
    await interaction.reply(`There is no rule with ID "${ruleID}"`)
    return
  }

  // edit modal will have to just be name, action, message, duration for now since modals only support up to 5 components, so we can't fit the rule params in there :(
  // the rule params -> modal code still exists in case discord ever increases the component limit :(

  const modal = createEditModal(oldRule)

  modal.setCustomId(`automod:edit:${ruleID}:${Date.now()}`)

  await interaction.showModal(modal)

  const filter = (i: Interaction) =>
    i.isModalSubmit() && i.user.id === interaction.user.id && i.customId === modal.data.custom_id

  const int = await interaction.awaitModalSubmit({ time: 10 * MINUTE, filter }).catch(() => {
    /* ignore */
  })

  if (!int) return

  await int.deferReply()

  const name = int.fields.getTextInputValue('name')
  const action = int.fields.getStringSelectValues('action')[0]
  const message = int.fields.getTextInputValue('message')
  const inDuration = int.fields.getTextInputValue('duration')

  const duration = inDuration ? parseInt(inDuration, 10) : undefined

  if (!duration) {
    await int.editReply('Duration must be a valid number of seconds')
    return
  }

  const newRule = await prisma.automodRule.update({
    where: {
      ruleID: oldRule.ruleID,
    },
    data: {
      name: name,
      action: action,
      message: message && message !== '-' ? message : null,
      duration: duration,
      // parameters: assignDefined({}, oldRule.parameters ?? {}, params),
    },
  })

  const newHeader = new TextDisplayBuilder({
    content: `${formatUser(interaction.user)} edited rule "${escapeAllMarkdown(oldRule.ruleID)}" in automod, new rule:`,
  })
  const newRuleComponent = formatRuleDetails(newRule, { accentColor: Colors.Blurple })
  const oldHeader = new TextDisplayBuilder({
    content: `Old rule:`,
  })
  const oldRuleComponent = formatRuleDetails(oldRule, {
    showButtons: false,
    accentColor: Colors.DarkBlue,
  })

  await int.editReply({
    components: [newHeader, newRuleComponent, oldHeader, oldRuleComponent],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  })
}

function createEditModal(ruleInfo: PrismaAutomodRule): ModalBuilder {
  const rule = rules.find((r) => r.name === ruleInfo.type)

  if (!rule) {
    throw new Error(`No rule found for type "${ruleInfo.type}"`)
  }

  return rule.asDetailEditModal(ruleInfo)
}

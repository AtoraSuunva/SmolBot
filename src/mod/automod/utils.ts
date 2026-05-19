import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  codeBlock,
  ComponentType,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
} from 'discord.js'
import { AutocompleteHandler, escapeAllMarkdown, makeChoices } from 'sleetcord'

import { Prisma } from '../../generated/prisma/client.js'
import type { Prisma as PrismaType } from '../../generated/prisma/client.js'
import { prisma } from '../../helpers/db.js'
import { formatConfig } from '../../helpers/format.js'
import { rules } from './rules/index.js'

export const automodTypes = rules.map((rule) => rule.name)
export const automodChoices = makeChoices(automodTypes)

/**
 * Create an autocomplete handler for automod rules. This will match for rule type if the autocomplete is for a subcommand in a group
 *
 * Returns { name: 'rule-id:rule-name', value: 'rule-id' }[]
 */
export const ruleAutocomplete: AutocompleteHandler<string> = async ({ interaction, value }) => {
  if (!interaction.inGuild()) {
    return []
  }

  const group = interaction.options.getSubcommandGroup()
  const subcommand = interaction.options.getSubcommand()

  const rules = await prisma.automodRule.findMany({
    where: {
      guildID: interaction.guildId,
      ...(group ? { type: subcommand } : {}),
      OR: [
        {
          name: { contains: value },
        },
        {
          ruleID: { contains: value },
        },
      ],
    },
    take: 25,
    orderBy: {
      name: 'asc',
    },
  })

  return rules.map((rule) => ({
    name: `${rule.ruleID}: ${rule.name}`,
    value: rule.ruleID,
  }))
}

export type FindAutomodRulesParams = {
  guildID: string
  name?: string | null
  type?: string | null
  action?: string | null
  message?: string | null
  duration?: number | null
  parameter_value?: string | null
}

interface GetAutomodRulesPaginatedResult {
  rules: RuleInfo[]
  count: number
  page: number
  pageSize: number
  pageCount: number
}

export async function findRulesPaginated(
  { guildID, name, type, action, message, duration, parameter_value }: FindAutomodRulesParams,
  page: number,
  pageSize = 5,
): Promise<GetAutomodRulesPaginatedResult> {
  if (page < 1) {
    throw new Error('Page number must be at least 1')
  }

  if (pageSize < 1) {
    throw new Error('Page size must be at least 1')
  }

  const whereClause: PrismaType.AutomodRuleWhereInput = {
    guildID,
    name: name ? { contains: name } : Prisma.skip,
    type: type ? { equals: type } : Prisma.skip,
    action: action ? { equals: action } : Prisma.skip,
    message: message ? (message === '-' ? null : { contains: message }) : Prisma.skip,
    duration: duration ? { equals: duration } : Prisma.skip,
    parameters: parameter_value
      ? {
          string_contains: parameter_value,
        }
      : Prisma.skip,
  }

  const [rules, count] = await prisma.$transaction([
    prisma.automodRule.findMany({
      where: whereClause,
      skip: pageSize * (page - 1),
      take: pageSize,
      orderBy: {
        createdAt: 'asc',
      },
    }),
    prisma.automodRule.count({
      where: whereClause,
    }),
  ])

  return {
    rules,
    count,
    page,
    pageSize,
    pageCount: Math.ceil(count / pageSize),
  }
}

export interface GetAutomodRuleParams {
  guildID: string
  ruleID: string
}

export async function findFirstRule({ guildID, ruleID }: GetAutomodRuleParams) {
  return prisma.automodRule.findFirst({
    where: {
      guildID,
      ruleID,
    },
  })
}

export type RuleInfo = Prisma.AutomodRuleGetPayload<true>

export interface FormatRuleOptions {
  showButtons?: boolean
  accentColor?: Parameters<ContainerBuilder['setAccentColor']>[0]
}

// -----------------------------------------------------------------
// | ### 9d13a5ac: My reaction rule                                |
// | Type: `reaction-filter`                                       |
// | Action: `timeout` (15s)                                       |
// | Message:                                                      |
// | > No eggplant emoji allowed >:(                               |
// |---------------------------------------------------------------|
// | Parameters:                                                   |
// | ```ini                                                        |
// | emoji: 🍆                                                     |
// | ```                                                           |
// |---------------------------------------------------------------|
// | [Edit Rule] [Copy Rule] [Delete Rule]                         |
// -----------------------------------------------------------------
export function formatRuleDetails(
  rule: RuleInfo,
  { showButtons = true, accentColor }: FormatRuleOptions = {},
): ContainerBuilder {
  const container = new ContainerBuilder()

  if (accentColor) {
    container.setAccentColor(accentColor)
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder({
      content: `### ${rule.ruleID}: ${escapeAllMarkdown(rule.name)}`,
    }),
    new TextDisplayBuilder({
      content: `Type: \`${rule.type}\``,
    }),
    new TextDisplayBuilder({
      content: `Action: \`${rule.action}${rule.action === 'timeout' ? ` (${rule.duration}s)` : ''}\``,
    }),
    new TextDisplayBuilder({
      content: `Message:\n> ${rule.message ?? '*No Message*'}`,
    }),
  )

  container.addSeparatorComponents({
    type: ComponentType.Separator,
  })

  const formattedParameters =
    typeof rule.parameters === 'object' && !Array.isArray(rule.parameters)
      ? formatConfig({
          config: rule.parameters ?? {},
        })
      : JSON.stringify(rule.parameters, null, 2)

  container.addTextDisplayComponents(
    new TextDisplayBuilder({
      content: `Parameters:\n${formattedParameters}`,
    }),
  )

  if (showButtons) {
    container.addSeparatorComponents({
      type: ComponentType.Separator,
    })

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder({
        customId: `automod:edit:${rule.ruleID}`,
        label: 'Edit Rule',
        style: ButtonStyle.Primary,
      }),
      new ButtonBuilder({
        customId: `automod:copy:${rule.ruleID}`,
        label: 'Copy Rule',
        style: ButtonStyle.Success,
      }),
      new ButtonBuilder({
        customId: `automod:delete:${rule.ruleID}`,
        label: 'Delete Rule',
        style: ButtonStyle.Danger,
      }),
    )

    container.addActionRowComponents(actionRow)
  }

  return container
}

// -----------------------------------------------------------------
// | ID: Name                                        |             |
// | type - action [for timeout: duration] - message | [View Rule] |
// | parameters (json preview)                       |             |
// -----------------------------------------------------------------
export function formatRule(
  rule: RuleInfo,
  { showButtons = true, accentColor }: FormatRuleOptions = {},
): ContainerBuilder {
  const container = new ContainerBuilder()

  if (accentColor) {
    container.setAccentColor(accentColor)
  }

  const messagePreview = rule.message
    ? `${rule.message.slice(0, 100)}${rule.message.length > 100 ? '…' : ''}`
    : '*No message*'
  const stringParameters = JSON.stringify(rule.parameters).slice(0, 50)
  const parametersPreview =
    stringParameters.length === 50 ? `${stringParameters}…` : stringParameters

  const section = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder({
      content: `### ${rule.ruleID}: ${escapeAllMarkdown(rule.name)}`,
    }),
    new TextDisplayBuilder({
      content: `\`${rule.type}\` - \`${rule.action}${rule.action === 'timeout' ? ` (${rule.duration}s)` : ''}\` - ${messagePreview}`,
    }),
    new TextDisplayBuilder({
      content: codeBlock('json', parametersPreview),
    }),
  )

  if (showButtons) {
    section.setButtonAccessory(
      new ButtonBuilder({
        customId: `automod:details:${rule.ruleID}`,
        label: 'Rule Details',
        style: ButtonStyle.Primary,
      }),
    )
  }

  container.addSectionComponents(section)
  return container
}

export function formatRules(rules: RuleInfo[]): ContainerBuilder {
  const container = new ContainerBuilder()

  let first = true
  for (const rule of rules) {
    if (!first) {
      container.addSeparatorComponents({
        type: ComponentType.Separator,
      })
    }

    const section = formatRule(rule)
    container.addSectionComponents(section.components as SectionBuilder[])

    first = false
  }

  return container
}

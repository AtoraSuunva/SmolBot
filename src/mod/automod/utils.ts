import { cleanCodeBlockContent, codeBlock } from 'discord.js'
import { AutocompleteHandler } from 'sleetcord'

import { Prisma } from '../../generated/prisma/client.js'
import { prisma } from '../../helpers/db.js'
import { formatConfig, tableFormat } from '../../helpers/format.js'

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

export interface GetAutomodRulesParams {
  guildID: string
  name: string | null
  type: string | null
}

export async function getRulesMany({ guildID, name, type }: GetAutomodRulesParams) {
  return prisma.automodRule.findMany({
    where: {
      guildID,
      name: name ? { contains: name, mode: 'insensitive' } : Prisma.skip,
      type: type ? { equals: type, mode: 'insensitive' } : Prisma.skip,
    },
  })
}

export interface GetAutomodRuleParams {
  guildID: string
  ruleID: string
}

export async function getRuleFirst({ guildID, ruleID }: GetAutomodRuleParams) {
  return prisma.automodRule.findFirst({
    where: {
      guildID,
      ruleID,
    },
  })
}

type Rule = Prisma.AutomodRuleGetPayload<true>

export function formatRule(rule: Rule, oldRule: Rule | null = null): string {
  return formatConfig({
        config: rule,
        oldConfig: oldRule,
        omit: ['guildID'],
        mapKeys: {
          ruleID: 'Rule ID',
          type: 'Type',
          name: 'Name',
          message: 'Message',
          action: 'Action',
          duration: 'Duration',
          deleteTarget: 'Delete',
          parameters: 'Parameters',
        },
        formatters: {
          parameters: (params) => JSON.stringify(params),
        }
      })
}

export function formatRules(rules: Rule[]): string {
  return codeBlock(
    'm',
    cleanCodeBlockContent(
      tableFormat(rules, {
        keys: ['ruleID', 'type', 'name', 'message', 'action', 'duration', 'deleteTarget', 'parameters'],
        columnNames: {
          ruleID: 'Rule ID',
          type: 'Type',
          name: 'Name',
          message: 'Message',
          action: 'Action',
          duration: 'Duration',
          deleteTarget: 'Delete',
          parameters: 'Parameters',
        },
        formatters: {
          parameters: (params) => JSON.stringify(params),
        },
      }),
    ),
  )
}

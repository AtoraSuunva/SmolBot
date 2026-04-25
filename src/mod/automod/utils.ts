import { cleanCodeBlockContent, codeBlock } from 'discord.js'
import { AutocompleteHandler } from 'sleetcord'

import { Prisma } from '../../generated/prisma/client.js'
import { prisma } from '../../helpers/db.js'
import { tableFormat } from '../../helpers/format.js'

export const ruleAutocomplete: AutocompleteHandler<string> = async ({ interaction, value }) => {
  if (!interaction.inGuild()) {
    return []
  }

  const rules = await prisma.automodRule.findMany({
    where: {
      guildID: interaction.guildId,
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

export function formatRules(rules: Prisma.AutomodRuleGetPayload<true>[]): string {
  return codeBlock(
    'm',
    cleanCodeBlockContent(
      tableFormat(rules, {
        keys: ['ruleID', 'type', 'name', 'message', 'parameters'],
        columnNames: {
          ruleID: 'Rule ID',
          type: 'Type',
          name: 'Name',
          message: 'Message',
          parameters: 'Parameters',
        },
        formatters: {
          parameters: (params) => JSON.stringify(params),
        },
      }),
    ),
  )
}

import { AutocompleteHandler } from 'sleetcord'

import { Prisma } from '../../../generated/prisma/client.js'
import { prisma } from '../../../helpers/db.js'
import { tableFormat } from '../../../helpers/format.js'

export const ruleAutocomplete: AutocompleteHandler<string> = async ({ interaction, value }) => {
  if (!interaction.inGuild()) {
    return []
  }

  const rules = await prisma.automodRule.findMany({
    where: {
      guildId: interaction.guildId,
      name: { contains: value, mode: 'insensitive' },
    },
    take: 25,
  })

  return rules.map((rule) => ({
    name: rule.name,
    value: rule.name,
  }))
}

export interface GetAutomodRulesParams {
  guildId: string
  name: string | null
  type: string | null
}

export async function getRulesMany({ guildId, name, type }: GetAutomodRulesParams) {
  return prisma.automodRule.findMany({
    where: {
      guildId,
      name: name ? { contains: name, mode: 'insensitive' } : Prisma.skip,
      type: type ? { equals: type, mode: 'insensitive' } : Prisma.skip,
    },
  })
}

export interface GetAutomodRuleParams {
  guildId: string
  name: string
}

export async function getRuleFirst({ guildId, name }: GetAutomodRuleParams) {
  return prisma.automodRule.findFirst({
    where: {
      guildId,
      name,
    },
  })
}

export function formatRules(rules: Prisma.AutomodRuleGetPayload<true>[]): string {
  return tableFormat(rules)
}

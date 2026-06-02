import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  codeBlock,
  ComponentType,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  type GuildTextBasedChannel,
  type Message,
} from 'discord.js'
import { AutocompleteHandler, escapeAllMarkdown } from 'sleetcord'

import { Prisma } from '../../generated/prisma/client.js'
import type { Prisma as PrismaType } from '../../generated/prisma/client.js'
import { prisma } from '../../helpers/db.js'
import { formatConfig } from '../../helpers/format.js'
import type { PrismaAutomodRule } from './automodMiddleware.js'

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
  rules: PrismaAutomodRule[]
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

/**
 * Wrapper around prisma.automodRule.findFirst in case I add custom logic later
 *
 * @param payload The same payload as prisma.automodRule.findFirst
 * @returns The first automod rule that matches the payload, or null if no rules match
 */
export async function findFirstAutomodRule(
  payload: Prisma.AutomodRuleFindFirstArgs,
): Promise<PrismaAutomodRule | null> {
  return prisma.automodRule.findFirst(payload)
}

/**
 * Wrapper around prisma.automodRule.create that invalidates the automod rules cache after creation
 *
 * @param payload The same payload as prisma.automodRule.create
 * @returns The created automod rule
 */
export async function createAutomodRule(
  payload: Prisma.AutomodRuleCreateArgs,
): Promise<PrismaAutomodRule> {
  const newRule = await prisma.automodRule.create(payload)

  invalidateAutomodRulesCache(newRule.guildID, newRule.type)

  return newRule
}

/**
 * Wrapper around prisma.automodRule.update that invalidates the automod rules cache after update
 *
 * @param payload The same payload as prisma.automodRule.update
 * @returns The updated automod rule
 */
export async function updateAutomodRule(
  payload: Prisma.AutomodRuleUpdateArgs,
): Promise<PrismaAutomodRule> {
  const updatedRule = await prisma.automodRule.update(payload)

  invalidateAutomodRulesCache(updatedRule.guildID, updatedRule.type)

  return updatedRule
}

/**
 * Wrapper around prisma.automodRule.delete that invalidates the automod rules cache after deletion
 *
 * @param payload The same payload as prisma.automodRule.delete
 * @returns The deleted automod rule
 */
export async function deleteAutomodRule(
  payload: Prisma.AutomodRuleDeleteArgs,
): Promise<PrismaAutomodRule> {
  const deletedRule = await prisma.automodRule.delete(payload)

  invalidateAutomodRulesCache(deletedRule.guildID, deletedRule.type)

  return deletedRule
}

export interface FormatRuleOptions {
  showButtons?: boolean
  accentColor?: Parameters<ContainerBuilder['setAccentColor']>[0]
}

// -----------------------------------------------------------------
// | ### 9d13a5ac: My reaction rule                                |
// | Type: `reaction-filter`                                       |
// | Action: `timeout (15s)`                                       |
// | Message:                                                      |
// | > No eggplant emoji allowed >:(                               |
// |---------------------------------------------------------------|
// | Parameters:                                                   |
// | ```ini                                                        |
// | emoji = 🍆                                                    |
// | ```                                                           |
// |---------------------------------------------------------------|
// | [Edit Rule] [Copy Rule] [Delete Rule]                         |
// -----------------------------------------------------------------
export function formatRuleDetails(
  rule: PrismaAutomodRule,
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
  rule: PrismaAutomodRule,
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

export function formatRules(rules: PrismaAutomodRule[]): ContainerBuilder {
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

export type AutomodConfig = Prisma.AutomodConfigGetPayload<true>

const configCache = new Map<string, AutomodConfig>()

/**
 * Get the automod config for a guild, using a cache to reduce database queries. If the config does not exist, it will be created with default values
 *
 * This provides measurable performance improvements for automod middleware (cutting config + rule loading from 10-20ms down to 5-10ms)
 *
 * @param guildID The ID of the guild to get the config for
 * @returns The automod config for the guild
 */
export async function getAutomodConfigCached(guildID: string): Promise<AutomodConfig> {
  const cachedConfig = configCache.get(guildID)
  if (cachedConfig) {
    return cachedConfig
  }

  const config = await prisma.automodConfig.upsert({
    where: {
      guildID,
    },
    update: {},
    create: {
      guildID,
    },
  })

  configCache.set(guildID, config)
  return config
}

/**
 * Invalidate the automod config cache for a guild, should be called after updating the config to ensure the cache is not stale
 *
 * The cache will automatically be filled next time it's needed
 *
 * @param guildID The ID of the guild to invalidate the cache for
 */
export function invalidateAutomodConfigCache(guildID: string) {
  configCache.delete(guildID)
}

export type AutomodRule = Prisma.AutomodRuleGetPayload<true>

const ruleCache = new Map<string, AutomodRule[]>()

/**
 * Get the automod rules for a guild and type, using a cache to reduce database queries. If there are no rules, an empty array is returned
 *
 * @param guildID The ID of the guild to get the rules for
 * @param type The type of rules to get
 * @returns The automod rules for the guild and type
 */
export async function getAutomodRulesCached(
  guildID: string,
  type: string,
): Promise<PrismaAutomodRule[]> {
  const key = `${guildID}:${type}`
  const cachedRules = ruleCache.get(key)
  if (cachedRules) {
    return cachedRules
  }

  const rules = await prisma.automodRule.findMany({
    where: {
      guildID,
      type,
    },
  })

  ruleCache.set(key, rules)
  return rules
}

/**
 * Invalidate the automod rules cache for a guild and type, should be called after updating the rules to ensure the cache is not stale
 *
 * The cache will automatically be filled next time it's needed
 *
 * @param guildID The ID of the guild to invalidate the cache for
 * @param type The type of rules to invalidate the cache for
 */
export function invalidateAutomodRulesCache(guildID: string, type: string) {
  const key = `${guildID}:${type}`
  ruleCache.delete(key)
}

/**
 * Delete messages, groups messages into bulk deletions where possible, and falls back to individual deletions if not (e.g. for messages in different channels)
 *
 * @param messages The messages to delete
 */
export async function deleteMessages(messages: Message[]) {
  const channelToMessages = new Map<GuildTextBasedChannel, Message[]>()

  for (const message of messages) {
    const channel = message.channel as GuildTextBasedChannel
    const channelMessages = channelToMessages.get(channel) ?? []
    channelMessages.push(message)
    channelToMessages.set(channel, channelMessages)
  }

  for (const [channel, messages] of channelToMessages.entries()) {
    if (messages.length > 1) {
      await channel.bulkDelete(messages).catch(() => {})
    } else {
      await messages[0].delete().catch(() => {})
    }
  }
}

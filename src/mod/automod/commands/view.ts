import {
  ActionRowBuilder,
  APIMessageTopLevelComponent,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  CommandInteraction,
  ComponentType,
  JSONEncodable,
  MessageComponentInteraction,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js'
import { escapeAllMarkdown, inGuildGuard, SleetSlashSubcommand } from 'sleetcord'

import { getComponentsOfType } from '../../../helpers/components.js'
import { formatConfig, parseConfig } from '../../../helpers/format.js'
import { automodActionCommandOptionChoices } from '../actions.js'
import { automodChoices } from '../constants.js'
import { formatRules, FindAutomodRulesParams, findRulesPaginated } from '../utils.js'

const FILTERS_ID = 999

export const automod_view = new SleetSlashSubcommand(
  {
    name: 'view',
    description: 'View the automod rules',
    options: [
      {
        name: 'page',
        description: 'The page number to start at (default: 1)',
        type: ApplicationCommandOptionType.Integer,
        min_value: 1,
      },
      {
        name: 'name',
        description: 'Search rules by name (partial match)',
        type: ApplicationCommandOptionType.String,
        max_length: 100,
      },
      {
        name: 'type',
        description: 'Search rules by type',
        type: ApplicationCommandOptionType.String,
        choices: automodChoices,
      },
      {
        name: 'action',
        description: 'Search rules by action',
        type: ApplicationCommandOptionType.String,
        choices: automodActionCommandOptionChoices,
      },
      {
        name: 'message',
        description: 'Search rules by message content (partial match, "-" to match silent rules)',
        type: ApplicationCommandOptionType.String,
        max_length: 100,
      },
      {
        name: 'duration',
        description: 'Search rules by duration (exact match, in seconds)',
        type: ApplicationCommandOptionType.Integer,
        min_value: 1,
      },
      {
        name: 'parameter_value',
        description: 'Search rules by parameter value (partial match)',
        type: ApplicationCommandOptionType.String,
        max_length: 100,
      },
    ],
  },
  {
    run: runAutomodView,
  },
)

async function runAutomodView(interaction: ChatInputCommandInteraction) {
  inGuildGuard(interaction)

  const page = interaction.options.getInteger('page') ?? 1
  const name = interaction.options.getString('name')
  const type = interaction.options.getString('type')
  const action = interaction.options.getString('action')
  const message = interaction.options.getString('message')
  const duration = interaction.options.getInteger('duration')
  const parameter_value = interaction.options.getString('parameter_value')

  await interaction.deferReply()

  await replyWithPaginatedRules(
    interaction,
    {
      guildID: interaction.guildId,
      name,
      type,
      action,
      message,
      duration,
      parameter_value,
    },
    page,
  )
}

// automod:view:{pageNumber}
export async function handleViewInteraction(
  interaction: MessageComponentInteraction<'cached' | 'raw'>,
  params: string[],
) {
  const [pageStr] = params
  const page = parseInt(pageStr, 10)

  if (isNaN(page) || page < 1) {
    await interaction.reply({
      content: `Invalid page number: "${escapeAllMarkdown(pageStr)}"`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await interaction.deferUpdate()

  const configComponent = getComponentsOfType(
    interaction.message.components,
    ComponentType.TextDisplay,
  ).find((component) => component.id === FILTERS_ID)

  const config = configComponent ? parseConfig(configComponent.content) : {}

  const name = config['name'] || null
  const type = config['type'] || null
  const action = config['action'] || null
  const message = config['message'] || null
  const duration = config['duration'] ? parseInt(config['duration'], 10) : null
  const parameter_value = config['parameter_value'] || null

  await replyWithPaginatedRules(
    interaction,
    { guildID: interaction.guildId, name, type, action, message, duration, parameter_value },
    page,
  )
}

async function replyWithPaginatedRules(
  interaction: CommandInteraction | MessageComponentInteraction,
  params: FindAutomodRulesParams,
  page: number,
) {
  const results = await findRulesPaginated(params, page)

  const reply =
    interaction.replied || interaction.deferred
      ? interaction.editReply.bind(interaction)
      : interaction.reply.bind(interaction)

  if (results.count === 0) {
    await reply("You don't have any automod rules yet! Use `/automod add` to add some!")
    return
  }

  if (page > results.pageCount) {
    // Go to last page if page number is too high
    await replyWithPaginatedRules(interaction, params, results.pageCount)
    return
  }

  const firstRule = results.pageSize * (page - 1) + 1
  const lastRule = Math.min(firstRule + results.pageSize - 1, results.count)
  const components: JSONEncodable<APIMessageTopLevelComponent>[] = []

  const header = new TextDisplayBuilder({
    content: `Rules ${firstRule}-${lastRule} of ${results.count}. Page ${results.page}/${results.pageCount}`,
  })

  components.push(header)

  // guildID is required but we don't want to show it as a filter, so we omit it from the config display
  // If there's 2+ filter params then that means an optional filter was used and we should show the filters in the message
  if (Object.values(params).filter((v) => v).length > 1) {
    const filters = new TextDisplayBuilder({
      id: FILTERS_ID,
      content: formatConfig({ config: params, omitNullOrUndefined: true }),
    })

    components.push(filters)
  }

  const ruleComponents = formatRules(results.rules)
  components.push(ruleComponents)

  if (results.pageCount > 1) {
    const pageButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder({
        customId: `automod:view:${page - 1}`,
        label: '🡸 Previous Page',
        style: ButtonStyle.Primary,
        disabled: page <= 1,
      }),
      new ButtonBuilder({
        customId: `automod:view:${page}`,
        label: `Page: ${page}`,
        style: ButtonStyle.Secondary,
        disabled: true,
      }),
      new ButtonBuilder({
        customId: `automod:view:${page + 1}`,
        label: 'Next Page 🡺',
        style: ButtonStyle.Primary,
        disabled: page >= results.pageCount,
      }),
    )

    components.push(pageButtons)
  }

  await reply({
    components,
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  })
}

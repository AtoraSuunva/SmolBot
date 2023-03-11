import { WarningConfig } from '@prisma/client'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CommandInteraction,
  ComponentType,
  EmbedAuthorOptions,
  EmbedBuilder,
  InteractionEditReplyOptions,
} from 'discord.js'
import { getGuild } from 'sleetcord'
import { MINUTE } from '../../util/constants.js'
import {
  formatWarningToField,
  fetchWarningConfigFor,
  MAX_PER_PAGE,
  PaginatedWarnings,
} from './utils.js'

export type WarningFetcher = (
  guildID: string,
  config: WarningConfig,
  currentPage: number,
) => Promise<PaginatedWarnings>

export type FormatAuthor = (
  result: PaginatedWarnings,
) => EmbedAuthorOptions | null
export type FormatTitle = (result: PaginatedWarnings) => string | null
export type FormatDescription = (result: PaginatedWarnings) => string | null

export interface RespondWithPaginationOptions {
  formatAuthor?: FormatAuthor
  formatTitle?: FormatTitle
  formatDescription?: FormatDescription
  modView?: boolean
  showUserOnWarning?: boolean
}

function defaultFormatAuthor(): EmbedAuthorOptions | null {
  return null
}

function defaultFormatTitle(result: PaginatedWarnings): string | null {
  return `${result.counts.total} warnings, ${result.counts.expired} expired`
}

function defaultFormatDescription(): string | null {
  return null
}

export async function respondWithPaginatedWarnings(
  interaction: CommandInteraction,
  fetchWarnings: WarningFetcher,
  options: RespondWithPaginationOptions = {},
) {
  const {
    formatAuthor = defaultFormatAuthor,
    formatTitle = defaultFormatTitle,
    formatDescription = defaultFormatDescription,
    modView = false,
    showUserOnWarning = false,
  } = options

  const defer = !interaction.deferred
    ? interaction.deferReply()
    : Promise.resolve()

  const guild = await getGuild(interaction, true)
  const config = await fetchWarningConfigFor(guild.id, true)
  let currentPage = 1

  async function searchPages(
    page: number,
  ): Promise<InteractionEditReplyOptions> {
    const res = await fetchWarnings(guild.id, config, currentPage)
    const totalPages = Math.ceil(res.counts.total / MAX_PER_PAGE)

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents([
      new ButtonBuilder()
        .setCustomId('warnings:paginated:prev')
        .setLabel('Prev')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 1),
      new ButtonBuilder()
        .setCustomId('warnings:paginated:next')
        .setLabel('Next')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === totalPages),
    ])

    const embed = new EmbedBuilder()
      .setAuthor(formatAuthor(res))
      .setTitle(formatTitle(res))
      .setDescription(formatDescription(res))
      .addFields(
        res.warnings.map((w) =>
          formatWarningToField(w, config, {
            showUserOnWarning,
            showModNote: modView,
            showResponsibleMod: modView,
            showVersion: modView,
          }),
        ),
      )
      .setFooter({
        text: totalPages > 0 ? `Page ${page} of ${totalPages}` : 'No results',
      })

    return {
      embeds: [embed],
      components: totalPages > 1 ? [row] : [],
    }
  }

  const reply = await searchPages(currentPage)
  await defer
  const message = await interaction.editReply(reply)

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: MINUTE * 20, // Always stop after 20 minutes
    idle: MINUTE * 5, // Stop if there's been no interaction in 5 minutes
  })

  collector.on('collect', async (interaction) => {
    if (interaction.user.id !== interaction.user.id) {
      interaction.reply({
        content: 'You cannot use this button',
        ephemeral: true,
      })
      return
    }

    if (interaction.customId === 'warnings:paginated:prev') {
      currentPage--
    } else if (interaction.customId === 'warnings:paginated:next') {
      currentPage++
    }

    const res = await searchPages(currentPage)
    await interaction.update(res)
  })

  collector.on('end', () => {
    interaction.editReply({
      components: [],
    })
  })
}

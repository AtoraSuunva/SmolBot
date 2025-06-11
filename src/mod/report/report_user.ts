import {
  ActionRowBuilder,
  Colors,
  DiscordjsError,
  EmbedBuilder,
  type EmbedFooterOptions,
  InteractionContextType,
  MessageFlags,
  type ModalActionRowComponentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type User,
  type UserContextMenuCommandInteraction,
} from 'discord.js'
import { SleetUserCommand, formatUser, getGuild } from 'sleetcord'
import { MINUTE } from 'sleetcord-common'
import { fetchConfig } from './manage/config.js'
import { sendReport } from './utils.js'

export const report_user = new SleetUserCommand(
  {
    name: 'Report User to Mods',
    contexts: [InteractionContextType.Guild],
  },
  {
    run: runReportUser,
  },
)

async function runReportUser(
  interaction: UserContextMenuCommandInteraction,
  user: User,
) {
  const guild = await getGuild(interaction, true)
  const config = await fetchConfig(guild, interaction.user).catch(
    (err: unknown) => (err instanceof Error ? err.message : String(err)),
  )

  if (typeof config === 'string') {
    await interaction.reply({
      content: config,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const customId = `report_user:${user.id}:${interaction.id}`

  const formattedUser = formatUser(user, {
    markdown: false,
    escapeMarkdown: false,
  })

  const userPreview = new TextInputBuilder()
    .setCustomId('user_preview')
    .setLabel('User Preview')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setPlaceholder(formattedUser.slice(0, 100))
    .setValue(formattedUser)

  const previewRow =
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      userPreview,
    )

  const reasonInput = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Reason (Optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1024)
    .setPlaceholder('Any extra info you want to add to this report?')

  const reasonRow =
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      reasonInput,
    )

  const isAnonInput = new TextInputBuilder()
    .setCustomId('anon')
    .setLabel('Send report anonymously? (Optional)')
    .setRequired(false)
    .setPlaceholder('"yes" or "no" (default "yes")')
    .setMaxLength(3)
    .setStyle(TextInputStyle.Short)

  const isAnonRow =
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      isAnonInput,
    )

  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Report User')
    .addComponents([previewRow, reasonRow, isAnonRow])

  await interaction.showModal(modal)
  const modalInteraction = await interaction
    .awaitModalSubmit({
      filter: (i) => i.customId === customId,
      time: 15 * MINUTE,
    })
    .catch((err: unknown) => {
      if (err instanceof DiscordjsError) {
        return null // time ran out
      }
      throw err
    })

  if (modalInteraction === null) {
    return
  }

  const reason = modalInteraction.fields.getTextInputValue('reason')
  const isAnonString =
    modalInteraction.fields.getTextInputValue('anon') || 'yes'
  const isAnon = isAnonString.toLowerCase() === 'yes'

  const member = await guild.members.fetch(user.id).catch(() => null)

  const report = new EmbedBuilder()
    .setThumbnail(user.displayAvatarURL())
    .setDescription(`**Reported User:** ${formatUser(user, { mention: true })}`)
    .setColor(member?.displayColor || Colors.Default)

  const footer: EmbedFooterOptions = {
    text: `Reported by ${
      isAnon
        ? 'Anonymous'
        : formatUser(interaction.user, {
            markdown: false,
            escapeMarkdown: false,
          })
    }`,
  }

  if (!isAnon) {
    footer.iconURL = interaction.user.displayAvatarURL()
  }

  report.setFooter(footer)

  if (reason) {
    report.addFields([
      {
        name: 'Reason',
        value: reason,
      },
    ])
  }

  const embeds = [report]

  try {
    await sendReport(config, interaction.user, embeds)

    await modalInteraction.reply({
      content:
        "Your report has been sent to the moderators.\nHere's a copy of your report:",
      embeds,
      flags: MessageFlags.Ephemeral,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await modalInteraction.reply({
      content: `Failed to send report: ${msg}`,
      flags: MessageFlags.Ephemeral,
    })
  }
}

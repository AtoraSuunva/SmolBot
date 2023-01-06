import {
  ActionRowBuilder,
  DiscordjsError,
  EmbedFooterOptions,
  Message,
  MessageContextMenuCommandInteraction,
  ModalActionRowComponentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  time,
} from 'discord.js'
import { SleetMessageCommand } from 'sleetcord'
import { quoteMessage } from '../../util/quoteMessage.js'
import { fetchConfig, ReportConfigResolved } from './report_config.js'

export const report_message = new SleetMessageCommand(
  {
    name: 'Report Message',
    dm_permission: false,
  },
  {
    run: runReportMessage,
  },
)

async function runReportMessage(
  interaction: MessageContextMenuCommandInteraction,
  message: Message,
) {
  if (!message.inGuild()) {
    interaction.reply('This command can only be used in a guild.')
    return
  }

  let conf: ReportConfigResolved

  try {
    conf = await fetchConfig(message.guild)
  } catch (err) {
    const content = err instanceof Error ? err.message : String(err)
    interaction.reply({
      content,
      ephemeral: true,
    })
    return
  }

  const { config, reportChannel } = conf

  const customId = `report_message:${message.id}:${interaction.id}`

  const reasonInput = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('Reason (Optional)')
    .setRequired(false)
    .setPlaceholder('Any extra info you want to add to this report?')
    .setMaxLength(1024)
    .setStyle(TextInputStyle.Paragraph)

  const reasonRow =
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      reasonInput,
    )

  const isAnonInput = new TextInputBuilder()
    .setCustomId('anon')
    .setLabel('Send report anonymously? (Optional)')
    .setRequired(false)
    .setPlaceholder('"yes" or "no" (default "no")')
    .setMaxLength(3)
    .setStyle(TextInputStyle.Short)

  const isAnonRow =
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      isAnonInput,
    )

  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Report Message')
    .addComponents([reasonRow, isAnonRow])

  await interaction.showModal(modal)
  const modalInteraction = await interaction
    .awaitModalSubmit({
      filter: (i) => i.customId === customId,
      time: 1000 * 60 * 5,
    })
    .catch((err) => {
      if (err instanceof DiscordjsError) {
        return null // time ran out
      }
      throw err
    })

  if (modalInteraction === null) {
    return
  }

  const reason = modalInteraction.fields.getTextInputValue('reason')
  const isAnonString = modalInteraction.fields.getTextInputValue('anon') ?? 'no'
  const isAnon = isAnonString.toLowerCase() === 'yes'

  const footer: EmbedFooterOptions = {
    text: `Reported by ${isAnon ? 'Anonymous' : interaction.user.tag}`,
  }

  if (!isAnon) {
    footer.iconURL = interaction.user.displayAvatarURL()
  }

  const [report, ...extraEmbeds] = await quoteMessage(message)

  report
    .setFooter(footer)
    .setTimestamp(null)
    .addFields([
      {
        name: 'Posted at',
        value: time(message.createdAt, 'F'),
        inline: true,
      },
      {
        name: 'Edited at',
        value: message.editedAt ? time(message.editedAt, 'F') : 'Never',
        inline: true,
      },
    ])

  if (reason) {
    report.addFields([
      {
        name: 'Reason',
        value: reason,
      },
    ])
  }

  const embeds = [report, ...extraEmbeds]

  try {
    await reportChannel.send({
      content: config.message,
      embeds,
    })

    modalInteraction.reply({
      content:
        "Your report has been sent to the moderators.\nHere's a copy of your report:",
      embeds,
      ephemeral: true,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    modalInteraction.reply({
      content: `Failed to send report: ${msg}`,
      ephemeral: true,
    })
  }
}

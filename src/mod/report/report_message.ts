import {
  ApplicationIntegrationType,
  cleanCodeBlockContent,
  codeBlock,
  DiscordjsError,
  type EmbedFooterOptions,
  InteractionContextType,
  LabelBuilder,
  type Message,
  type MessageContextMenuCommandInteraction,
  MessageFlags,
  ModalBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  time,
} from 'discord.js'
import { formatUser, getGuild, SleetMessageCommand } from 'sleetcord'
import { MINUTE } from 'sleetcord-common'

import { quoteMessage } from '../../helpers/quoteMessage.js'
import { messageToLog } from '../modlog/handlers/messageDelete.js'
import { fetchConfig } from './manage/config.js'
import { sendReport } from './utils.js'

export const report_message = new SleetMessageCommand(
  {
    name: 'Report Message to Mods',
    contexts: [InteractionContextType.Guild],
    integration_types: [ApplicationIntegrationType.GuildInstall],
  },
  {
    run: runReportMessage,
  },
)

async function runReportMessage(
  interaction: MessageContextMenuCommandInteraction,
  message: Message,
) {
  const guild = await getGuild(interaction, true)

  if (!message.inGuild()) {
    await interaction.reply({
      content: 'You can only report messages from servers.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const config = await fetchConfig(guild, interaction.user).catch((err: unknown) =>
    err instanceof Error ? err.message : String(err),
  )

  if (typeof config === 'string') {
    await interaction.reply({
      content: config,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const customId = `report_message:${message.id}:${interaction.id}`

  const logMessage = await messageToLog(message)
  const formattedMessage = [logMessage.header, logMessage.content, logMessage.footer]
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
    .join('\n')
    .slice(0, 2000)

  const authorPreviewTextDisplay = new TextDisplayBuilder({
    content: `## You are reporting the following message by ${message.author} in ${message.channel}:`,
  })

  const messagePreviewTextDisplay = new TextDisplayBuilder({
    content: codeBlock('ansi', cleanCodeBlockContent(formattedMessage)),
  })

  const reasonInput = new LabelBuilder({
    label: 'Reason for report (Optional)',
  }).setTextInputComponent(
    new TextInputBuilder()
      .setCustomId('reason')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(1024)
      .setPlaceholder('Any extra info you want to add to this report?'),
  )

  const isAnonInput = new LabelBuilder({
    label: 'Report Anonymously? (Optional)',
  }).setTextInputComponent(
    new TextInputBuilder()
      .setCustomId('anon')
      .setRequired(false)
      .setPlaceholder('"yes" or "no" (default "yes")')
      .setMaxLength(3)
      .setStyle(TextInputStyle.Short),
  )

  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Report Message')
    .addTextDisplayComponents([authorPreviewTextDisplay, messagePreviewTextDisplay])
    .addLabelComponents([reasonInput, isAnonInput])

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
  const isAnonString = modalInteraction.fields.getTextInputValue('anon') || 'yes'
  const isAnon = isAnonString.toLowerCase() === 'yes'

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

  const [report, ...extraEmbeds] = await quoteMessage(message)

  const createdAt = time(message.createdAt, 'F')
  const editedAt = message.editedAt ? time(message.editedAt, 'F') : ''

  report.setFooter(footer).addFields([
    {
      name: `Posted${editedAt ? ' & Edited' : ''} at`,
      value: `${createdAt}${editedAt ? `\n${editedAt}` : ''}`,
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
    await sendReport(config, interaction.user, embeds)

    await modalInteraction.reply({
      content: "Your report has been sent to the moderators.\nHere's a copy of your report:",
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

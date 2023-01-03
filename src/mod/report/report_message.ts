import {
  ActionRowBuilder,
  DiscordjsError,
  EmbedBuilder,
  EmbedFooterOptions,
  Message,
  MessageContextMenuCommandInteraction,
  ModalActionRowComponentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'
import { SleetMessageCommand } from 'sleetcord'

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
    await interaction.reply('This command can only be used in a guild.')
    return
  }

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

  const embed = new EmbedBuilder()
    .setAuthor({
      name: `${message.author.tag} - #${message.channel.name}`,
      iconURL: message.author.displayAvatarURL(),
      url: message.url,
    })
    .setTitle('Message Reported')
    .setDescription(message.content)
    .setFooter(footer)
    .setTimestamp(message.createdAt)

  if (reason) {
    embed.addFields([
      {
        name: 'Reason',
        value: reason,
      },
    ])
  }

  modalInteraction.reply({
    content:
      "Message was reported to the mods!\nHere's a preview of the report:",
    embeds: [embed],
    ephemeral: true,
  })
}

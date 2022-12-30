import {
  MessageContextMenuCommandInteraction,
  MessageFlags,
  MessageFlagsBitField,
} from 'discord.js'
import { InteractionMessage, SleetMessageCommand } from 'sleetcord'

export const restore_embeds = new SleetMessageCommand(
  {
    name: 'Restore Embeds',
    default_member_permissions: ['ManageMessages'],
    dm_permission: true,
  },
  {
    run: runRestoreEmbeds,
  },
)

async function runRestoreEmbeds(
  interaction: MessageContextMenuCommandInteraction,
  message: InteractionMessage,
) {
  const flags = new MessageFlagsBitField(message.flags)

  if (!flags.has(MessageFlags.SuppressEmbeds)) {
    return interaction.reply({
      ephemeral: true,
      content: 'This message does not have suppressed embeds.',
    })
  }

  flags.remove(MessageFlags.SuppressEmbeds)

  if (interaction.channel === null) {
    return interaction.reply({
      ephemeral: true,
      content: 'This message is not in a cached channel.',
    })
  }

  await interaction.channel.messages.edit(message.id, { flags: flags.bitfield })

  return interaction.reply({
    ephemeral: true,
    content: 'Embeds restored.',
  })
}

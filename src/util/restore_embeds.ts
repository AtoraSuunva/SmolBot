import { MessageContextMenuInteraction, MessageFlags } from 'discord.js'
import { SleetMessageCommand, InteractionMessage } from 'sleetcord'

export const restore_embeds = new SleetMessageCommand(
  {
    name: 'Restore Embeds',
    default_member_permissions: ['MANAGE_MESSAGES'],
    dm_permission: true,
  },
  {
    run: runRestoreEmbeds,
  },
)

async function runRestoreEmbeds(
  interaction: MessageContextMenuInteraction,
  message: InteractionMessage,
) {
  const flags = new MessageFlags(message.flags)

  if (!flags.has(MessageFlags.FLAGS.SUPPRESS_EMBEDS)) {
    return interaction.reply({
      ephemeral: true,
      content: 'This message does not have suppressed embeds.',
    })
  }

  flags.remove(MessageFlags.FLAGS.SUPPRESS_EMBEDS)

  if (interaction.channel === null) {
    return interaction.reply({
      ephemeral: true,
      content: 'This message is not in a cached channel.',
    })
  }

  await interaction.channel.messages.edit(message.id, { flags })

  return interaction.reply({
    ephemeral: true,
    content: 'Embeds restored.',
  })
}

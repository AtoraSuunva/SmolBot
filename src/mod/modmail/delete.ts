import type { ChatInputCommandInteraction } from 'discord.js'
import { SleetSlashSubcommand } from 'sleetcord'
import { prisma } from '../../util/db.js'
import { FIELD_MODMAIL_ID } from './fields/utils.js'

export const modmail_delete_by_id = new SleetSlashSubcommand(
  {
    name: 'delete',
    description: 'Delete a full set of fields and config for a modmail ID',
    options: [FIELD_MODMAIL_ID],
  },
  {
    run: runDeleteModmailID,
  },
)

async function runDeleteModmailID(interaction: ChatInputCommandInteraction) {
  const modmailID = interaction.options.getString('modmail_id', true)

  // Delete all fields
  await prisma.modMailTicketModalField.deleteMany({
    where: {
      modmailID,
    },
  })

  await interaction.reply(`Deleted all fields for modmail ID \`${modmailID}\``)
}

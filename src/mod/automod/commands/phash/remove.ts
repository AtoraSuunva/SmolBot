import { ApplicationCommandOptionType, type ChatInputCommandInteraction } from 'discord.js'
import { inGuildGuard, SleetSlashSubcommand } from 'sleetcord'

import { prisma } from '../../../../helpers/db.js'
import { base64ToPhash } from '../../utils.js'
import { isAppOwner } from './utils.js'

export const automod_phash_remove = new SleetSlashSubcommand(
  {
    name: 'remove',
    description: 'Remove a scam image phash from the database',
    options: [
      {
        name: 'phash',
        description: 'The phash to remove',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
  {
    run: runRemovePhash,
  },
)

async function runRemovePhash(interaction: ChatInputCommandInteraction) {
  inGuildGuard(interaction)

  await interaction.deferReply()

  const phash = interaction.options.getString('phash', true)
  const bitstring = base64ToPhash(phash)

  const isOwner = isAppOwner(interaction)

  const deleted = await prisma.phashInfo.deleteMany({
    where: {
      guildID: isOwner ? '*' : interaction.guildId,
      phash: {
        in: [bitstring, phash], // Allow both raw bitstring and base64 input for convenience
      },
    },
  })

  if (deleted.count === 0) {
    await interaction.editReply({
      content: `No phash \`${phash}\` found in the database.`,
      allowedMentions: { parse: [] },
    })
  } else {
    await interaction.editReply({
      content: `Removed phash \`${phash}\` from the database.`,
      allowedMentions: { parse: [] },
    })
  }
}

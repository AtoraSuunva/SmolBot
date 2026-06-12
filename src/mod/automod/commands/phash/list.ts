import type { AttachmentPayload, ChatInputCommandInteraction } from 'discord.js'
import { inGuildGuard, SleetSlashSubcommand } from 'sleetcord'

import { Prisma } from '../../../../generated/prisma/client.js'
import { prisma } from '../../../../helpers/db.js'
import { plural } from '../../../../helpers/format.js'
import { bitstringToHex } from '../../utils.js'
import { isAppOwner } from './utils.js'

export const automod_phash_list = new SleetSlashSubcommand(
  {
    name: 'list',
    description: 'List the currently stored scam image phashes',
    options: [],
  },
  {
    run: runListPhashes,
  },
)

async function runListPhashes(interaction: ChatInputCommandInteraction) {
  inGuildGuard(interaction)

  const isOwner = isAppOwner(interaction)

  await interaction.deferReply()

  const phashes = await prisma.phashInfo.findMany({
    where: {
      guildID: isOwner ? Prisma.skip : interaction.guildId,
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  if (phashes.length === 0) {
    await interaction.reply('No scam image phashes have been added yet.')
    return
  }

  // format the timestamps as iso timestamps (in UTC)
  const phashList = phashes
    .map(
      (entry) =>
        `- \`${bitstringToHex(entry.phash)}\` (added ${entry.createdAt.toISOString().split('T')[0]})${entry.guildID === '*' ? ' (global)' : ''}`,
    )
    .join('\n')

  let content = `${plural('phash', phashes.length)}:\n${phashList}`
  let files: AttachmentPayload[] = []

  if (phashList.length > 1900) {
    content = `${plural('phash', phashes.length)}:`
    files = [
      {
        name: 'phashes.txt',
        attachment: Buffer.from(phashList, 'utf-8'),
      },
    ]
  }

  await interaction.editReply({
    content,
    files,
  })
}

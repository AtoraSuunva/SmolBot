import {
  ApplicationCommandOptionType,
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js'
import { inGuildGuard, SleetSlashSubcommand } from 'sleetcord'

import { getClosestScamPhashes } from '../../hash/checkPhash.js'
import { computeImagePhash } from '../../hash/phash.js'
import { bitstringToHex } from '../../utils.js'

export const automod_phash_check = new SleetSlashSubcommand(
  {
    name: 'check',
    description: 'Check an image phash and compare it against the stored scam phashes',
    options: [
      {
        name: 'image',
        description: 'Image attachment to check',
        type: ApplicationCommandOptionType.Attachment,
        required: true,
      },
    ],
  },
  {
    run: runCheckPhash,
  },
)

async function runCheckPhash(interaction: ChatInputCommandInteraction) {
  inGuildGuard(interaction)

  const attachment = interaction.options.getAttachment('image', true)

  if (!attachment.contentType?.startsWith('image/')) {
    await interaction.reply({
      content: 'The provided attachment is not an image.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await interaction.deferReply()

  try {
    const response = await fetch(attachment.url)

    if (!response.ok) {
      throw new Error(`Failed to fetch image: [GET ${response.status}] ${attachment.url}`)
    }

    const phash = await computeImagePhash(Buffer.from(await response.arrayBuffer()))
    const closest = await getClosestScamPhashes(phash, interaction.guildId, 5)

    const closestRows =
      closest.length === 0
        ? '- none'
        : closest
            .map((entry) => {
              const globalTag = entry.isGlobal ? ' (global)' : ''
              return `- \`${bitstringToHex(entry.phash)}\`: Distance: ${entry.distance}${globalTag}`
            })
            .join('\n')

    await interaction.editReply({
      content: `Phash: \`${bitstringToHex(phash)}\`\n\nClosest phashes:\n${closestRows}`,
      allowedMentions: { parse: [] },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    await interaction.editReply({
      content: `Failed to check image phash: ${message}`,
      allowedMentions: { parse: [] },
    })
  }
}

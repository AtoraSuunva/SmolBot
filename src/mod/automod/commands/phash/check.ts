import {
  ApplicationCommandOptionType,
  AttachmentBuilder,
  ComponentType,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js'
import { inGuildGuard, SleetSlashSubcommand } from 'sleetcord'

import { getClosestScamPhashesWithImages, getImagePhashFromUrl } from '../../hash/checkPhash.js'
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
        required: false,
      },
      {
        name: 'url',
        description: 'Image URL to check',
        type: ApplicationCommandOptionType.String,
        required: false,
      },
    ],
  },
  {
    run: runCheckPhash,
  },
)

async function runCheckPhash(interaction: ChatInputCommandInteraction) {
  inGuildGuard(interaction)

  const attachment = interaction.options.getAttachment('image')
  const url = interaction.options.getString('url')

  if ((!attachment && !url) || (attachment && url)) {
    await interaction.reply({
      content: 'Provide exactly one input: either `image` or `url`.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (attachment && !attachment.contentType?.startsWith('image/')) {
    await interaction.reply({
      content: 'The provided attachment is not an image.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await interaction.deferReply()

  try {
    const resolved = await getImagePhashFromUrl(attachment?.url ?? url!, {
      fileName: attachment?.name,
      contentType: attachment?.contentType,
      forceFetch: Boolean(attachment),
    })

    const phash = resolved.phash
    const closest = await getClosestScamPhashesWithImages(phash, interaction.guildId, 5)

    // Build files list for closest entries that have stored image blobs
    const files: AttachmentBuilder[] = []
    const fileNameByPhash = new Map<string, string>()

    for (const entry of closest) {
      if (!entry.imageData || fileNameByPhash.has(entry.phash)) {
        continue
      }

      const extension = contentTypeToExtension(entry.imageContentType)
      const fallbackName = `closest-${bitstringToHex(entry.phash)}.${extension}`
      const fileName = sanitizeFileName(entry.imageFileName) ?? fallbackName

      files.push(new AttachmentBuilder(Buffer.from(entry.imageData), { name: fileName }))
      fileNameByPhash.set(entry.phash, fileName)

      if (files.length >= 5) {
        break
      }
    }

    // The checked image thumbnail URL — prefer the original attachment URL so Discord can render
    // it directly without a round-trip; fall back to the resolved normalized URL.
    const checkedImageUrl = attachment?.url ?? resolved.normalizedUrl

    const container = new ContainerBuilder()

    // Header section: phash of checked image + thumbnail of the checked image
    container.addSectionComponents(
      new SectionBuilder({
        components: [
          {
            type: ComponentType.TextDisplay,
            content: `Phash: \`${bitstringToHex(phash)}\``,
          },
        ],
        accessory: {
          type: ComponentType.Thumbnail,
          media: { url: checkedImageUrl },
        },
      }),
    )

    container.addSeparatorComponents(new SeparatorBuilder())

    container.addTextDisplayComponents(new TextDisplayBuilder({ content: '**Closest phashes:**' }))

    if (closest.length === 0) {
      container.addTextDisplayComponents(new TextDisplayBuilder({ content: '- none' }))
    } else {
      for (const entry of closest) {
        const hexPhash = bitstringToHex(entry.phash)
        const globalTag = entry.isGlobal ? ' (global)' : ''
        const rowText = `- \`${hexPhash}\`: Distance: ${entry.distance}${globalTag}`

        const storedFileName = fileNameByPhash.get(entry.phash)

        if (storedFileName) {
          container.addSectionComponents(
            new SectionBuilder({
              components: [
                {
                  type: ComponentType.TextDisplay,
                  content: rowText,
                },
              ],
              accessory: {
                type: ComponentType.Thumbnail,
                media: { url: `attachment://${storedFileName}` },
              },
            }),
          )
        } else {
          container.addTextDisplayComponents(new TextDisplayBuilder({ content: rowText }))
        }
      }
    }

    await interaction.editReply({
      flags: MessageFlags.IsComponentsV2,
      components: [container],
      files,
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

function contentTypeToExtension(contentType: string | null): string {
  if (!contentType) {
    return 'unknown'
  }

  switch (contentType.split(';')[0]) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    case 'image/bmp':
      return 'bmp'
    case 'image/png':
      return 'png'
    default:
      return contentType
  }
}

function sanitizeFileName(fileName: string | null): string | null {
  if (!fileName) {
    return null
  }

  const cleaned = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
  return cleaned.length > 0 ? cleaned : null
}

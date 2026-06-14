import {
  ApplicationCommandOptionType,
  AttachmentBuilder,
  ComponentType,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js'
import { inGuildGuard, SleetSlashSubcommand } from 'sleetcord'

import {
  getClosestScamPhashesWithImages,
  getImagePhashFromPhash,
  getImagePhashFromUrl,
} from '../../hash/checkPhash.js'
import { bitstringToHex, ensureBitstringPhash } from '../../utils.js'

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
      {
        name: 'phash',
        description: 'Phash to check (hex or binary string)',
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
  const phashInput = interaction.options.getString('phash')

  if (
    (!attachment && !url && !phashInput) ||
    (attachment && url) ||
    (attachment && phashInput) ||
    (url && phashInput)
  ) {
    await interaction.reply({
      content: 'Provide exactly one input: either `image`, `url`, or `phash`.',
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

  if (phashInput && !/^([0-9a-fA-F]{16}|[01]{64})$/.test(phashInput)) {
    await interaction.reply({
      content: 'The provided phash must be a hex string or a binary string.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await interaction.deferReply()

  try {
    // either a string that's just the input hash (if we don't have any metadata for it) or a full PhashEntry if we found a matching phash in the database
    const resolved = phashInput
      ? await getImagePhashFromPhash(ensureBitstringPhash(phashInput))
      : await getImagePhashFromUrl(attachment?.url ?? url!, {
          fileName: attachment?.name,
          contentType: attachment?.contentType,
          forceFetch: Boolean(attachment),
        })

    const phash = typeof resolved === 'string' ? resolved : resolved.phash
    const closest = await getClosestScamPhashesWithImages(phash, interaction.guildId, 5)

    // Build files list for closest entries that have stored image blobs
    const files: AttachmentBuilder[] = []
    const fileNameByPhash = new Map<string, string>()

    for (const entry of closest) {
      if (!entry.image?.bytes || fileNameByPhash.has(entry.phash)) {
        continue
      }

      const extension = contentTypeToExtension(entry.image.contentType)
      const fallbackName = `closest-${bitstringToHex(entry.phash)}.${extension}`
      const fileName = sanitizeFileName(entry.image.fileName) ?? fallbackName

      files.push(new AttachmentBuilder(Buffer.from(entry.image.bytes), { name: fileName }))
      fileNameByPhash.set(entry.phash, fileName)

      if (files.length >= 5) {
        break
      }
    }

    // If the url is a media proxy URL, we won't be able to use it as an attachment src for the thumbnail, so we should use the stored image data if available
    let checkedImageUrl =
      typeof resolved === 'string' ? null : (resolved.url ?? url ?? attachment?.url ?? null)

    if (checkedImageUrl?.startsWith('https://media.discordapp.net/')) {
      if (typeof resolved !== 'string' && resolved.image?.bytes) {
        const extension = contentTypeToExtension(resolved.image.contentType)
        const fallbackName = `input.${extension}`
        const fileName = sanitizeFileName(resolved.image.fileName) ?? fallbackName

        files.push(new AttachmentBuilder(Buffer.from(resolved.image.bytes), { name: fileName }))
        checkedImageUrl = `attachment://${fileName}`
      }
    }

    const container = new ContainerBuilder()

    // Header section: phash of checked image + thumbnail of the checked image
    if (checkedImageUrl) {
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
    } else {
      container.addTextDisplayComponents(
        new TextDisplayBuilder({ content: `Phash: \`${bitstringToHex(phash)}\`` }),
      )
    }

    container.addSeparatorComponents(
      new SeparatorBuilder({
        spacing: SeparatorSpacingSize.Large,
      }),
    )

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

        container.addSeparatorComponents(new SeparatorBuilder())
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

  const ext = contentType.split(';')[0]

  switch (ext) {
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
      return contentType.split('/')[1] || 'unknown'
  }
}

function sanitizeFileName(fileName: string | null): string | null {
  if (!fileName) {
    return null
  }

  const cleaned = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
  return cleaned.length > 0 ? cleaned : null
}

import {
  ApplicationCommandOptionType,
  codeBlock,
  FileUploadBuilder,
  inlineCode,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  SnowflakeUtil,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type Interaction,
} from 'discord.js'
import { inGuildGuard, SleetSlashSubcommand } from 'sleetcord'
import { MINUTE } from 'sleetcord-common'

import { prisma } from '../../../../helpers/db.js'
import { plural } from '../../../../helpers/format.js'
import { getImagePhashFromUrl } from '../../hash/checkPhash.js'
import { bitstringToHex, hexToBitstring } from '../../utils.js'
import { isAppOwner } from './utils.js'

const UPLOAD_INPUT_ID = 'phash_bulk_upload'
const UPLOAD_INPUT_ID_2 = 'phash_bulk_upload_2'
const UPLOAD_INPUT_ID_3 = 'phash_bulk_upload_3'
const URL_INPUT_ID = 'url_input'
const PHASH_INPUT_ID = 'phash_input'

interface ResolvedPhashInput {
  phash: string
  phashUrl?: {
    phash: string
    url: string
    imageData: Uint8Array<ArrayBuffer>
    imageFileName: string | null
    imageContentType: string | null
    imageSize: number
  }
}

export const automod_phash_add = new SleetSlashSubcommand(
  {
    name: 'add',
    description:
      'Add a phash to the database, marking it as a scam image, send no params for a bulk upload modal',
    options: [
      {
        name: 'image',
        description: 'Upload an image to add',
        type: ApplicationCommandOptionType.Attachment,
      },
      {
        name: 'url',
        description: 'Add an image via URL',
        type: ApplicationCommandOptionType.String,
      },
      {
        name: 'phash',
        description: 'Add a phash directly (bitstring or base64)',
        type: ApplicationCommandOptionType.String,
      },
    ],
  },
  {
    run: runAddPhash,
  },
)

async function runAddPhash(interaction: ChatInputCommandInteraction) {
  inGuildGuard(interaction)

  const attachment = interaction.options.getAttachment('image')
  const url = interaction.options.getString('url')
  const phashInput = interaction.options.getString('phash')

  const promises: Promise<ResolvedPhashInput>[] = []
  const resolvedInputs: ResolvedPhashInput[] = []
  const errors: Error[] = []

  let respondInteraction: Interaction = interaction

  // If there's no attachment or url provided, we open up a modal for bulk uploading
  if (!attachment && !url) {
    const modal = createBulkUploadModal()
    await interaction.showModal(modal)

    const filter = (i: Interaction) => i.isModalSubmit() && i.customId === modal.data.custom_id

    const int = await interaction.awaitModalSubmit({ time: 10 * MINUTE, filter }).catch(() => {
      /* ignore */
    })

    if (!int) return

    const upload = Array.from(int.fields.getUploadedFiles(UPLOAD_INPUT_ID)?.values() ?? []).concat(
      Array.from(int.fields.getUploadedFiles(UPLOAD_INPUT_ID_2)?.values() ?? []),
      Array.from(int.fields.getUploadedFiles(UPLOAD_INPUT_ID_3)?.values() ?? []),
    )

    for (const file of upload) {
      if (file.contentType?.startsWith('image/')) {
        promises.push(
          resolveInputFromImageUrl(file.url, {
            fileName: file.name,
            contentType: file.contentType,
          }),
        )
      }
    }

    const urls = int.fields
      .getTextInputValue(URL_INPUT_ID)
      .split('\n')
      .map((u) => u.trim())
      .filter((u) => u.length > 0)

    for (const url of urls) {
      promises.push(resolveInputFromImageUrl(url))
    }

    const phashInput = int.fields
      .getTextInputValue(PHASH_INPUT_ID)
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    for (const input of phashInput) {
      try {
        const phash = parsePhashInput(input)
        promises.push(Promise.resolve({ phash }))
      } catch (e) {
        errors.push(e instanceof Error ? e : new Error(String(e)))
      }
    }

    respondInteraction = int
  }

  if (attachment) {
    if (!attachment.contentType?.startsWith('image/')) {
      await interaction.reply({
        content: 'The provided attachment is not an image.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    promises.push(
      resolveInputFromImageUrl(attachment.url, {
        fileName: attachment.name,
        contentType: attachment.contentType,
      }),
    )
  }

  await respondInteraction.deferReply()

  if (url) {
    promises.push(resolveInputFromImageUrl(url))
  }

  if (phashInput) {
    const inputs = phashInput
      .split(' ')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    for (const input of inputs) {
      try {
        const phash = parsePhashInput(input)
        promises.push(Promise.resolve({ phash }))
      } catch (e) {
        errors.push(e instanceof Error ? e : new Error(String(e)))
      }
    }
  }

  await Promise.all(
    promises.map((p) =>
      p
        .then((resolved) => resolvedInputs.push(resolved))
        .catch((e) => errors.push(e instanceof Error ? e : new Error(String(e)))),
    ),
  )

  const phashes = resolvedInputs.map((entry) => entry.phash)

  if (phashes.length === 0) {
    await respondInteraction.editReply({
      content: 'Found no phashes to add.',
    })
    return
  }

  const isOwner = isAppOwner(interaction)

  // if the user is the app owner, add the phash as a global scam image (guildID = '*'), otherwise add it as a guild-specific scam image
  const newPhashes = await addImagesAsScam(phashes, isOwner ? '*' : interaction.guildId)

  const phashUrlEntries = resolvedInputs
    .map((entry) => entry.phashUrl)
    .filter((entry): entry is NonNullable<ResolvedPhashInput['phashUrl']> => Boolean(entry))

  await Promise.all(
    phashUrlEntries.map((entry) =>
      upsertPhashUrlWithImage(entry).catch((e) =>
        errors.push(e instanceof Error ? e : new Error(String(e))),
      ),
    ),
  )

  const contentChunks = []

  if (newPhashes.length > 0) {
    contentChunks.push(
      `Added ${plural('phash', newPhashes.length)} for guild ${inlineCode(
        newPhashes[0].guildID,
      )} to the database:\n${codeBlock(newPhashes.map((p) => bitstringToHex(p.phash)).join('\n'))}`,
    )
  }

  if (errors.length > 0) {
    contentChunks.push(
      `Encountered ${plural('error', errors.length)} while processing images:\n${codeBlock(
        errors.map((e) => e.message).join('\n'),
      )}`,
    )
  }

  const content = contentChunks.join('\n\n')

  if (content.length === 0) {
    await respondInteraction.editReply({
      content: 'No new phashes were added, and no errors were encountered.',
    })
    return
  }

  if (content.length > 1900) {
    await respondInteraction.editReply({
      content: 'Command output was too long, sending as a file instead.',
      files: [
        {
          name: 'result.txt',
          attachment: Buffer.from(content, 'utf-8'),
        },
      ],
    })
  } else {
    await respondInteraction.editReply({
      content: contentChunks.join('\n\n'),
      allowedMentions: { parse: [] },
    })
  }
}

function createBulkUploadModal(): ModalBuilder {
  const modal = new ModalBuilder({
    title: 'Bulk Upload Scam Images',
    customId: SnowflakeUtil.generate().toString(),
  })

  const uploadLabel = new LabelBuilder({
    label: 'Upload images to add as scam phashes (max 10)',
  }).setFileUploadComponent(
    new FileUploadBuilder({
      custom_id: UPLOAD_INPUT_ID,
      min_values: 0,
      max_values: 10,
      required: false,
    }),
  )

  const upload2Label = new LabelBuilder({
    label: 'Upload images to add as scam phashes (max 10)',
  }).setFileUploadComponent(
    new FileUploadBuilder({
      custom_id: UPLOAD_INPUT_ID_2,
      min_values: 0,
      max_values: 10,
      required: false,
    }),
  )

  const upload3Label = new LabelBuilder({
    label: 'Upload images to add as scam phashes (max 10)',
  }).setFileUploadComponent(
    new FileUploadBuilder({
      custom_id: UPLOAD_INPUT_ID_3,
      min_values: 0,
      max_values: 10,
      required: false,
    }),
  )

  const urlLabel = new LabelBuilder({
    label: 'Image URLs to add (one per line)',
  }).setTextInputComponent(
    new TextInputBuilder({
      custom_id: URL_INPUT_ID,
      style: TextInputStyle.Paragraph,
      placeholder:
        'https://media.discordapp.net/attachments/...\nhttps://cdn.discordapp.net/attachments/...',
      required: false,
    }),
  )

  const phashLabel = new LabelBuilder({
    label: 'Phashes (bitstring or hex, one per line)',
  }).setTextInputComponent(
    new TextInputBuilder({
      custom_id: 'phash_input',
      style: TextInputStyle.Paragraph,
      placeholder:
        '1000000000111100111001000001111101011100110000110011110111100011\n81917c6c6e9999b3',
      required: false,
    }),
  )

  modal.addLabelComponents(uploadLabel, upload2Label, upload3Label, urlLabel, phashLabel)

  return modal
}

function addImagesAsScam(phashes: string[], guildID?: string) {
  // we can't createManyAndReturn while ignoring duplicates (with sqlite at least), so we need to do it as a transaction
  return prisma.$transaction(
    phashes.map((phash) =>
      prisma.phashInfo.upsert({
        where: {
          phash_guildID: {
            guildID: guildID ?? '*',
            phash,
          },
        },
        update: {
          isScam: true,
        },
        create: {
          guildID: guildID ?? '*',
          phash,
          isScam: true,
        },
      }),
    ),
  )
}

/**
 * Resolve a phash from an image URL while preserving image metadata for DB persistence.
 *
 * @param url The image URL to resolve.
 * @param options Optional metadata hints from Discord attachments.
 * @returns Resolved phash input payload for command processing.
 */
async function resolveInputFromImageUrl(
  url: string,
  options?: {
    fileName?: string | null
    contentType?: string | null
  },
): Promise<ResolvedPhashInput> {
  const resolved = await getImagePhashFromUrl(url, {
    fileName: options?.fileName,
    contentType: options?.contentType,
    forceFetch: true,
  })

  if (!resolved.imageData) {
    throw new Error(`Failed to read image data from URL: ${url}`)
  }

  return {
    phash: resolved.phash,
    phashUrl: {
      phash: resolved.phash,
      url: resolved.normalizedUrl,
      imageData: resolved.imageData,
      imageFileName: resolved.imageFileName,
      imageContentType: resolved.imageContentType,
      imageSize: resolved.imageSize ?? resolved.imageData.length,
    },
  }
}

function upsertPhashUrlWithImage(entry: NonNullable<ResolvedPhashInput['phashUrl']>) {
  return prisma.phashUrl.upsert({
    where: {
      url: entry.url,
    },
    update: {
      phash: entry.phash,
      imageData: entry.imageData,
      imageFileName: entry.imageFileName,
      imageContentType: entry.imageContentType,
      imageSize: entry.imageSize,
    },
    create: {
      url: entry.url,
      phash: entry.phash,
      imageData: entry.imageData,
      imageFileName: entry.imageFileName,
      imageContentType: entry.imageContentType,
      imageSize: entry.imageSize,
    },
  })
}

function parsePhashInput(input: string): string {
  try {
    // Added phashes are 64-bit bitstrings

    // There are 2 formats that we accept:
    // 1. A 64-bit bitstring we accept as-is (1000000000111100111001000001111101011100110000110011110111100011)
    if (/^[01]{64}$/.test(input)) {
      return input
    }

    // 2. A hex format from https://github.com/JohannesBuchner/imagehash/blob/master/imagehash/__init__.py (81917c6c6e9999b3)
    if (/^[a-fA-F0-9]{16}$/.test(input)) {
      const bitString = hexToBitstring(input, 64)
      return bitString
    } else {
      throw new Error(`Invalid phash format: ${input}`)
    }
  } catch {
    throw new Error(
      `Failed to parse phash input: ${input}. It must be a 64-bit bitstring or a 16-character hex string.`,
    )
  }
}

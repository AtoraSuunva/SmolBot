import {
  ApplicationCommandOptionType,
  Attachment,
  codeBlock,
  FileUploadBuilder,
  inlineCode,
  LabelBuilder,
  ModalBuilder,
  SnowflakeUtil,
  type APIAttachment,
  type ChatInputCommandInteraction,
  type Interaction,
} from 'discord.js'
import { inGuildGuard, SleetSlashSubcommand } from 'sleetcord'
import { MINUTE } from 'sleetcord-common'

import { prisma } from '../../../../helpers/db.js'
import { plural } from '../../../../helpers/format.js'
import { normalizeUrl } from '../../utils.js'
import { isAppOwner } from './utils.js'

const UPLOAD_INPUT_ID = 'phash_bulk_upload'

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

  let phashes: string[] = []

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

    const upload = int.fields.getUploadedFiles(UPLOAD_INPUT_ID, true)

    for (const [, file] of upload) {
      if (file.contentType?.startsWith('image/')) {
        const rawAttachment = getRawAttachment(file)
        const phash = rawAttachment?.placeholder

        if (phash) {
          phashes.push(phash)
        }
      }
    }

    respondInteraction = int
  }

  if (attachment) {
    if (!attachment.contentType?.startsWith('image/')) {
      await interaction.reply({
        content: 'The provided attachment is not an image.',
        ephemeral: true,
      })
      return
    }

    const rawAttachment = getRawAttachment(attachment)
    const phash = rawAttachment?.placeholder

    if (!rawAttachment || !phash) {
      await interaction.reply({
        content: 'Failed to retrieve raw attachment data, please try again.',
        ephemeral: true,
      })
      return
    }

    phashes.push(phash)
  }

  await respondInteraction.deferReply()

  if (url) {
    let parsedUrl: string
    try {
      parsedUrl = normalizeUrl(url)
    } catch {
      await respondInteraction.editReply({
        content: 'Invalid URL provided.',
      })
      return
    }

    const phash = await getPhashFromUrl(parsedUrl)

    if (phash) {
      phashes.push(phash)
    } else {
      await respondInteraction.editReply({
        content: 'No phash found for the provided URL.',
      })
      return
    }
  }

  if (phashes.length === 0) {
    await respondInteraction.editReply({
      content: 'Found no phashes to add.',
    })
    return
  }

  const isOwner = isAppOwner(interaction)

  // if the user is the app owner, add the phash as a global scam image (guildID = '*'), otherwise add it as a guild-specific scam image
  const newPhashes = await addImagesAsScam(phashes, isOwner ? '*' : interaction.guildId)

  await respondInteraction.editReply(
    `Added ${plural('phash', newPhashes.length)} for guild ${inlineCode(newPhashes[0]?.guildID)} to the database:\n${codeBlock(newPhashes.map((p) => p.phash).join('\n'))}`,
  )
}

function createBulkUploadModal(): ModalBuilder {
  const modal = new ModalBuilder({
    title: 'Bulk Upload Scam Images',
    customId: SnowflakeUtil.generate().toString(),
  })

  const uploadInput = new FileUploadBuilder({
    custom_id: UPLOAD_INPUT_ID,
    min_values: 1,
    max_values: 10,
    required: true,
  })

  const uploadLabel = new LabelBuilder({
    label: 'Upload images to add as scam phashes (max 10)',
  })

  uploadLabel.setFileUploadComponent(uploadInput)
  modal.addLabelComponents(uploadLabel)

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

const RawDataSymbol = Symbol('rawData')

/**
 * Get the raw data associated with a Discord.js Attachment object. This is the data received directly from the Discord API, parsed from JSON into an object but otherwise unmodified.
 *
 * This is stored directly on the Attachment object using a symbol to avoid collisions with other properties.
 *
 * @param attachment The Attachment to get the raw API data for
 * @returns The raw APIAttachment data received from Discord
 */
export function getRawAttachment(attachment: Attachment): APIAttachment | undefined {
  return (attachment as unknown as AttachmentWithRaw)[RawDataSymbol]
}

/**
 * Patch an attachment with new raw data
 *
 * @param attachment The Attachment to patch
 * @param data The new raw APIAttachment data to associate with the Attachment
 * @returns void
 */
function patchAttachment(attachment: Attachment, data: APIAttachment) {
  ;(attachment as unknown as AttachmentWithRaw)[RawDataSymbol] = Object.assign(
    (attachment as unknown as AttachmentWithRaw)[RawDataSymbol] ?? {},
    data,
  )
}

export interface AttachmentWithRaw {
  [RawDataSymbol]: APIAttachment
}

type AttachmentPatch = (data: APIAttachment) => void

// Since _patch is a private method, we need to get around TS by using bracket notation
const oldPatch = (Attachment.prototype as unknown as { _patch: AttachmentPatch })['_patch']

;(Attachment.prototype as unknown as { _patch: AttachmentPatch })['_patch'] = function (
  data: APIAttachment,
) {
  oldPatch.call(this, data)
  patchAttachment(this as unknown as Attachment, data)
}

function getPhashFromUrl(url: string): Promise<string | null> {
  return prisma.phashUrl
    .findUnique({
      where: {
        url,
      },
      select: {
        phash: true,
      },
    })
    .then((entry) => entry?.phash ?? null)
}

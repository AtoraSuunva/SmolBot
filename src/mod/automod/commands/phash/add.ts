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
import { computeImagePhash } from '../../hash/phash.js'
import { normalizeUrl, phashToBase64 } from '../../utils.js'
import { isAppOwner } from './utils.js'

const UPLOAD_INPUT_ID = 'phash_bulk_upload'
const URL_INPUT_ID = 'url_input'

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

  const promises: Promise<string>[] = []
  const phashes: string[] = []
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

    const upload = int.fields.getUploadedFiles(UPLOAD_INPUT_ID) ?? []

    for (const [, file] of upload) {
      if (file.contentType?.startsWith('image/')) {
        promises.push(getImagePhashFromUrl(file.url))
      }
    }

    const urls =
      int.fields
        .getTextInputValue(URL_INPUT_ID)
        ?.split('\n')
        .map((u) => u.trim())
        .filter((u) => u.length > 0) ?? []

    for (const url of urls) {
      promises.push(getImagePhashFromUrl(url))
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

    promises.push(getImagePhashFromUrl(attachment.url))
  }

  await respondInteraction.deferReply()

  if (url) {
    promises.push(getImagePhashFromUrl(url))
  }

  await Promise.all(
    promises.map((p) =>
      p
        .then((phash) => phashes.push(phash))
        .catch((e) => errors.push(e instanceof Error ? e : new Error(String(e)))),
    ),
  )

  if (phashes.length === 0) {
    await respondInteraction.editReply({
      content: 'Found no phashes to add.',
    })
    return
  }

  const isOwner = isAppOwner(interaction)

  // if the user is the app owner, add the phash as a global scam image (guildID = '*'), otherwise add it as a guild-specific scam image
  const newPhashes = await addImagesAsScam(phashes, isOwner ? '*' : interaction.guildId)

  const contentChunks = []

  if (newPhashes.length > 0) {
    contentChunks.push(
      `Added ${plural('phash', newPhashes.length)} for guild ${inlineCode(
        newPhashes[0].guildID,
      )} to the database:\n${codeBlock(newPhashes.map((p) => phashToBase64(p.phash)).join('\n'))}`,
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

  modal.addLabelComponents(uploadLabel, urlLabel)

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
 * Accepts a link to an image, checks the database for an existing phash:
 *  - If a phash exists for the URL, returns it
 *  - If no phash exists, attempts to fetch the image and compute a phash, then returns it (and adds it to the database for future reference)
 *  - If the image can't be fetched or hashed, returns null
 *
 * @param url The URL of the image to fetch and compute the phash for
 * @returns The computed phash, or null if the image couldn't be fetched or hashed
 */
async function getImagePhashFromUrl(url: string): Promise<string> {
  // Check if the url is valid and normalize it (for media -> cdn urls)
  let normalizedUrl = normalizeUrl(url)

  // Then check if we already have a phash for this URL in the database
  const existingEntry = await prisma.phashUrl.findUnique({
    where: {
      url: normalizedUrl,
    },
  })

  if (existingEntry) {
    return existingEntry.phash
  }

  // If not, fetch the image and compute the phash
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to fetch image from URL: [GET ${response.status}] ${url}`)
  }

  return computeImagePhash(Buffer.from(await response.arrayBuffer()))
}

import {
  ApplicationCommandOptionType,
  Attachment,
  codeBlock,
  inlineCode,
  User,
  type APIAttachment,
  type ChatInputCommandInteraction,
} from 'discord.js'
import { inGuildGuard, SleetSlashSubcommand } from 'sleetcord'

import { prisma } from '../../../helpers/db.js'
import { plural } from '../../../helpers/format.js'
import { normalizeUrl } from '../utils.js'

export const automod_add_phash = new SleetSlashSubcommand(
  {
    name: 'add_phash',
    description: 'Add a phash to the database, marking it as a scam image',
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

  if (!attachment && !url) {
    await interaction.reply({
      content: 'You must provide either an image attachment or a URL.',
      ephemeral: true,
    })
    return
  }

  let phashes: string[] = []

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

  await interaction.deferReply()

  if (url) {
    let parsedUrl: string
    try {
      parsedUrl = normalizeUrl(url)
    } catch {
      await interaction.editReply({
        content: 'Invalid URL provided.',
      })
      return
    }

    const phash = await getPhashFromUrl(parsedUrl)

    if (phash) {
      phashes.push(phash)
    } else {
      await interaction.editReply({
        content: 'No phash found for the provided URL.',
      })
      return
    }
  }

  if (phashes.length === 0) {
    await interaction.editReply({
      content: 'Found no phashes to add.',
    })
    return
  }

  const isOwner = isAppOwner(interaction)

  // if the user is the app owner, add the phash as a global scam image (guildID = '*'), otherwise add it as a guild-specific scam image
  const newPhashes = await addImagesAsScam(phashes, isOwner ? undefined : interaction.guildId)

  await interaction.editReply(
    `Added ${plural('phash', newPhashes.length)} for guild ${inlineCode(newPhashes[0]?.guildID)} to the database:\n${codeBlock(newPhashes.map((p) => p.phash).join('\n'))}`,
  )
}

function isAppOwner(interaction: ChatInputCommandInteraction) {
  const appOwner = interaction.client.application?.owner

  if (!appOwner) {
    return false
  }

  if (appOwner instanceof User) {
    return interaction.user.id === appOwner.id
  }

  // If the owner is a team, check if the user is a member of the team
  return (
    appOwner.owner?.id === interaction.user.id ||
    appOwner.members.some((member) => member.user.id === interaction.user.id)
  )
}

function addImagesAsScam(phashes: string[], guildID?: string) {
  return prisma.phashInfo.createManyAndReturn({
    data: phashes.map((phash) => ({
      phash,
      guildID: guildID ?? '*',
      isScam: true,
    })),
  })
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

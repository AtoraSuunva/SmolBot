import { ApplicationCommandOptionType, inlineCode, type Message } from 'discord.js'
import { DAY } from 'sleetcord-common'

import { prisma } from '../../../helpers/db.js'
import { plural } from '../../../helpers/format.js'
import { getAutomodStore } from '../automodMiddleware.js'
import { getScamMatchesForHashes } from '../hash/checkPhash.js'
import { getImagePhashes } from '../hash/hashEmbeds.js'
import { AutomodRule, type AutomodEventResult } from '../modules/AutomodRule.js'
import { bitstringToHex } from '../utils.js'

export const imageScamRule = new AutomodRule(
  {
    name: 'image-scam',
    description: 'Detects if an image is a known scam/phishing image',
    options: [
      {
        name: 'delete',
        description: 'Delete detected scam images',
        type: ApplicationCommandOptionType.Boolean,
      },
    ] as const,
  },
  {
    async run(interaction, required) {
      const del = interaction.options.getBoolean('delete')

      return {
        delete: del ?? (required ? true : null),
      }
    },

    async messageCreate(message): Promise<AutomodEventResult[]> {
      return checkForScam(message)
    },

    async messageUpdate(_old, newMessage): Promise<AutomodEventResult[]> {
      return checkForScam(newMessage)
    },
  },
)

/**
 * Check if a message is a scam and should trigger the automod rule, and return the appropriate action if so
 *
 * @param message The message to check for scam content
 * @returns An array of AutomodEventResults indicating the actions to take for this message (e.g. delete, log, etc.)
 */
async function checkForScam(message: Message): Promise<AutomodEventResult[]> {
  if (message.system || !message.inGuild()) {
    return []
  }

  const ruleInstances = getAutomodStore<typeof imageScamRule>()
  const hashEntries = await getImagePhashes(message)
  const scamImages = await getScamMatchesForHashes(
    hashEntries.map((entry) => entry.phash),
    message.guildId,
  )

  // add all urls we saw so we can mark the phash later without needing to rehash the image if we find out it's a scam
  prisma
    .$transaction(
      hashEntries.map((entry) =>
        addImagePhashUrl(entry.phash, entry.url, {
          imageData: entry.imageData,
          imageFileName: entry.imageFileName,
          imageContentType: entry.imageContentType,
          imageSize: entry.imageSize,
        }),
      ),
    )
    .catch((err) => {
      console.error('Error adding phash URLs to database:', err)
    })

  if (scamImages.length > 0) {
    if (ruleInstances.some((instance) => instance.params.delete)) {
      await message.delete().catch(() => null)
    }

    const matches = scamImages
      .map((v) => `${inlineCode(bitstringToHex(v.phash))} (distance: ${v.distance})`)
      .join(', ')

    return ruleInstances.map((instance) => ({
      rule: instance.rule,
      logMessage: `Message contains ${plural('image', scamImages.length, { boldNumber: false })} that match${scamImages.length > 1 ? '' : 'es'} known scam images: ${matches}`,
    }))
  }

  return []
}

/**
 * Add a url + phash entry to the database so we can mark the phash as scam using the url
 *
 * @param phash The phash to add
 * @param url The URL associated with this phash (e.g. the image URL that was hashed)
 * @param image Optional image payload to store for later inspection/re-upload
 * @returns The created or updated ImagePhash entry
 */
function addImagePhashUrl(
  phash: string,
  url: string,
  image?: {
    imageData: Uint8Array<ArrayBuffer>
    imageFileName: string | null
    imageContentType: string | null
    imageSize: number
  },
) {
  const imageFields = image
    ? {
        imageData: image.imageData,
        imageFileName: image.imageFileName,
        imageContentType: image.imageContentType,
        imageSize: image.imageSize,
      }
    : {}

  return prisma.phashUrl.upsert({
    where: {
      url,
    },
    update: {
      phash,
      ...imageFields,
    },
    create: {
      phash,
      url,
      ...imageFields,
    },
  })
}

/**
 * Clear out phash URLs that are older than the age limit and not marked as a scam, to prevent it from growing indefinitely
 */
function clearOldPhashUrls() {
  const cutoffDate = new Date(
    Temporal.Now.instant().subtract({ milliseconds: 3 * DAY }).epochMilliseconds,
  )

  return prisma.$executeRaw`DELETE FROM "PhashUrl" WHERE "created_at" < ${cutoffDate} AND phash NOT IN (SELECT DISTINCT phash FROM "PhashInfo")`
}

// clear on startup and then once a day after that
clearOldPhashUrls().catch(() => {})

setInterval(() => {
  clearOldPhashUrls().catch(() => {})
}, DAY)

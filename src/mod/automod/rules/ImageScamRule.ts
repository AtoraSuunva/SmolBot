import { createWriteStream } from 'node:fs'
import { access, mkdir, unlink } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { ApplicationCommandOptionType, inlineCode, type Message } from 'discord.js'
import { baseLogger, DAY } from 'sleetcord-common'

import type { PhashUrl } from '../../../generated/prisma/client.js'
import { prisma } from '../../../helpers/db.js'
import { plural } from '../../../helpers/format.js'
import { sleep } from '../../../helpers/functions.js'
import { getAutomodStore } from '../automodMiddleware.js'
import { bitstringToHex, getPhashImagePath } from '../commands/phash/utils.js'
import { getScamMatchesForHashes, PHASH_HAMMING_THRESHOLD } from '../hash/checkPhash.js'
import { getImagePhashes } from '../hash/hashEmbeds.js'
import { AutomodRule, type AutomodEventResult } from '../modules/AutomodRule.js'

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
      {
        name: 'distance',
        description: `Maximum Hamming distance to consider an image a match (default: ${PHASH_HAMMING_THRESHOLD})`,
        type: ApplicationCommandOptionType.Integer,
        minValue: 0,
        maxValue: 64,
      },
    ] as const,
  },
  {
    async run(interaction, required) {
      const del = interaction.options.getBoolean('delete')
      const distance = interaction.options.getInteger('distance') ?? PHASH_HAMMING_THRESHOLD

      return {
        delete: del ?? (required ? true : null),
        distance: distance ?? (required ? PHASH_HAMMING_THRESHOLD : null),
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

  const largestDistance = ruleInstances.reduce((max, instance) => {
    const distance = instance.params.distance ?? PHASH_HAMMING_THRESHOLD
    return distance > max ? distance : max
  }, 0)

  const hashEntries = await getImagePhashes(message)
  const scamImages = await getScamMatchesForHashes(
    hashEntries.map((entry) => entry.phash),
    largestDistance,
    message.guildId,
  )

  // add all urls we saw so we can mark the phash later without needing to rehash the image if we find out it's a scam
  prisma
    .$transaction(
      hashEntries.map((entry) => addImagePhashUrl(entry.phash, entry.url, entry.filePath)),
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
function addImagePhashUrl(phash: string, url: string, filePath: string | null) {
  return prisma.phashUrl.upsert({
    where: {
      url,
    },
    update: {
      phash,
      filePath,
    },
    create: {
      phash,
      url,
      filePath,
    },
  })
}

import env from 'env-var'
const PHASH_IMAGE_PATH = env.get('PHASH_IMAGE_PATH').asString()
const phashLogger = baseLogger.child({ module: 'phashMigration' })
const PHASH_IMAGE_MIGRATION_BATCH_SIZE = 5
const PHASH_IMAGE_MIGRATION_PAUSE_MS = 25

/**
 * One-time migration from image files stored directly in the database to external files
 */
async function migrateImageFilesToExternalStorage() {
  if (!PHASH_IMAGE_PATH) {
    phashLogger.warn(
      'PHASH_IMAGE_PATH is not set, skipping migration of image files to external storage.',
    )
    return
  }

  // Create the directory for storing phash images if it doesn't exist
  await mkdir(PHASH_IMAGE_PATH, { recursive: true })

  let cursor: string | undefined

  while (true) {
    const phashUrls = await prisma.phashUrl.findMany({
      where: {
        imageData: {
          not: null,
        },
      },
      select: {
        url: true,
        phash: true,
        imageData: true,
        imageContentType: true,
      },
      orderBy: {
        url: 'asc',
      },
      take: PHASH_IMAGE_MIGRATION_BATCH_SIZE,
      ...(cursor
        ? {
            cursor: {
              url: cursor,
            },
          }
        : {}),
    })

    if (phashUrls.length === 0) {
      break
    }

    phashLogger.info(`Migrating ${phashUrls.length} phash images to external storage.`)

    for (const entry of phashUrls) {
      if (!entry.imageData || !entry.imageContentType) {
        phashLogger.warn(`No image data found for phash ${entry.phash}, skipping migration.`)
        continue
      }

      const filePath = getPhashImagePath(entry.phash, entry.imageContentType)

      if (!filePath) {
        phashLogger.warn(`Failed to get file path for phash ${entry.phash}, skipping migration.`)
        continue
      }

      phashLogger.info(`Migrating image for phash ${entry.phash} to file at ${filePath}`)

      try {
        await writeBufferToFile(filePath, entry.imageData)

        await access(filePath)

        await prisma.phashUrl.update({
          where: {
            url: entry.url,
          },
          data: {
            filePath,
            imageData: null,
          },
        })

        phashLogger.info(`Successfully migrated image for phash ${entry.phash} to file.`)
      } catch (err) {
        phashLogger.error(`Failed to migrate image for phash ${entry.phash}: ${String(err)}`)
      }

      if (PHASH_IMAGE_MIGRATION_PAUSE_MS > 0) {
        await sleep(PHASH_IMAGE_MIGRATION_PAUSE_MS)
      }
    }

    cursor = phashUrls[phashUrls.length - 1]?.url

    if (phashUrls.length < PHASH_IMAGE_MIGRATION_BATCH_SIZE) {
      break
    }
  }
}

async function writeBufferToFile(filePath: string, imageData: Uint8Array) {
  await pipeline(Readable.from([imageData]), createWriteStream(filePath))
}

await migrateImageFilesToExternalStorage().catch((err) => {
  phashLogger.error(`Failed to migrate image files to external storage: ${String(err)}`)
})

/**
 * Clear out phash URLs that are older than the age limit and not marked as a scam, to prevent it from growing indefinitely
 *
 * Also deletes the local image files associated with the deleted phash URLs
 */
async function clearOldPhashUrls() {
  phashLogger.info('Clearing phash URLs not marked as scam and older than 3 days.')
  const cutoffDate = Temporal.Now.instant()
    .subtract({ milliseconds: 3 * DAY })
    .toZonedDateTimeISO('UTC')
    .toString({ timeZoneName: 'never' })

  const deleted = await prisma.$queryRaw<PhashUrl[]>`
DELETE FROM "PhashUrl"
  WHERE "created_at" < ${cutoffDate}
  AND phash NOT IN (
    SELECT DISTINCT phash FROM "PhashInfo"
  )
  RETURNING *`

  if (deleted.length > 0) {
    phashLogger.info(`Deleted ${deleted.length} old phash URLs, deleting files on disk`)

    await Promise.all(
      deleted.map((entry) => (entry.filePath ? unlink(entry.filePath) : Promise.resolve())),
    )
  }

  phashLogger.info('Finished clearOldPhashUrls process.')
}

// clear on startup and then once a day after that
await clearOldPhashUrls().catch(() => {})

setInterval(() => {
  clearOldPhashUrls().catch(() => {})
}, DAY)

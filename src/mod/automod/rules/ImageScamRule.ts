import { ApplicationCommandOptionType, type Message } from 'discord.js'
import { DAY } from 'sleetcord-common'

import { prisma } from '../../../helpers/db.js'
import { plural } from '../../../helpers/format.js'
import { getAutomodStore } from '../automodMiddleware.js'
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
  const scamImages = await countScamImages(
    hashEntries.map((entry) => entry.phash),
    message.guildId,
  )

  // add all urls we saw so we can mark the phash later without needing to rehash the image if we find out it's a scam
  prisma
    .$transaction(hashEntries.map((entry) => addImagePhashUrl(entry.phash, entry.url)))
    .catch(() => {})

  if (scamImages > 0) {
    if (ruleInstances.some((instance) => instance.params.delete)) {
      await message.delete().catch(() => null)
    }

    return ruleInstances.map((instance) => ({
      rule: instance.rule,
      logMessage: `Message contains ${plural('image', scamImages, { boldNumber: false })} that match known scam images.`,
    }))
  }

  return []
}

/**
 * Count how many of the given phashes are marked as scam in the database for the given guild (or globally)
 *
 * @param hashes The phashes to check against the database
 * @param guildID The guild ID to check for guild-specific scam images, or undefined to only check global scam images
 * @returns The number of matching scam images found in the database
 */
async function countScamImages(hashes: string[], guildID?: string): Promise<number> {
  const checkGuildIDs = guildID ? [guildID, '*'] : ['*'] // Check both the specific guild and global entries if a guild ID is provided

  const matches = await prisma.phashInfo.count({
    where: {
      phash: {
        in: hashes,
      },
      guildID: {
        in: checkGuildIDs,
      },
      isScam: true,
    },
  })

  return matches
}

/**
 * Add a url + phash entry to the database so we can mark the phash as scam using the url
 *
 * @param phash The phash to add
 * @param urls The URLs associated with this phash (e.g. the URLs of the images that were hashed to produce this phash)
 * @returns The created or updated ImagePhash entry
 */
function addImagePhashUrl(phash: string, url: string) {
  return prisma.phashUrl.upsert({
    where: {
      url,
    },
    update: {
      phash,
    },
    create: {
      phash,
      url,
    },
  })
}

/**
 * Clear out scam phashes that are older than the age limit, to prevent it from growing indefinitely
 */
function clearOldScamPhashes() {
  const cutoffDate = new Date(
    Temporal.Now.instant().subtract({ milliseconds: 14 * DAY }).epochMilliseconds,
  )

  return prisma.phashInfo.deleteMany({
    where: {
      isScam: true,
      updatedAt: {
        lt: cutoffDate,
      },
    },
  })
}

// clear on startup and then once a day after that
clearOldScamPhashes().catch(() => {})

setInterval(() => {
  clearOldScamPhashes().catch(() => {})
}, DAY)

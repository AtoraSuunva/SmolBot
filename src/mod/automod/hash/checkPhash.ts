import { writeFile } from 'node:fs/promises'

import { prisma } from '../../../helpers/db.js'
import { getPhashImagePath } from '../commands/phash/utils.js'
import { normalizeUrl } from '../utils.js'
import { fetchImageBuffer } from './hashEmbeds.js'
import { phashDistance } from './phash.js'
import { computeImagePhash } from './phash.js'

/** Maximum hamming distance for considering two phashes a scam match. */
export const PHASH_HAMMING_THRESHOLD = 10

export interface Phash {
  /** 64-bit phash bitstring. */
  phash: string
}

/**
 * Basic scam phash row fetched from storage.
 */
export interface PhashGuild extends Phash {
  /** Guild scope for this phash; `*` indicates global scope. */
  guildID: string
}

/**
 * A scam phash candidate annotated with comparison metadata.
 */
export interface ComparedPhash extends PhashGuild {
  /** Hamming distance to the compared target phash. */
  distance: number
  /** Whether this candidate belongs to global scope (guildID === '*'). */
  isGlobal: boolean
}

/** Resolved phash data from a URL lookup/fetch operation. */
export interface PhashEntry extends Phash {
  /** Original URL of the image, if available. */
  url: string | null
  /** Local path to the stored image, if available. */
  filePath: string | null
}

type RemoveNullProps<T> = {
  [K in keyof T]: NonNullable<T[K]>
}

/** Non-nullable version of a phash entry, ensuring all properties are present. */
export type NonNullPhashEntry = RemoveNullProps<PhashEntry>

/** Closest-match entry enriched with optional stored image data for display. */
export interface ComparedPhashWithImage extends ComparedPhash, PhashEntry {}

/**
 * Get an image phash entry by its phash value, returning associated metadata if available.
 *
 * @param phash The phash bitstring to look up.
 * @returns Resolved phash entry with optional image metadata, or null if not found.
 */
export async function getImagePhashFromPhash(phash: string): Promise<PhashEntry> {
  const entry = await prisma.phashUrl.findFirst({
    where: {
      phash,
    },
    select: {
      phash: true,
      url: true,
      filePath: true,
    },
  })

  if (!entry) {
    return {
      phash,
      url: null,
      filePath: null,
    }
  }

  return entry
}

export interface GetImagePhashOptions {
  /** File name to store with the image, if available. */
  fileName?: string | null | undefined
  /** MIME type to store with the image, if available. */
  contentType?: string | null | undefined
  /** If true, bypass cache and fetch image bytes. */
  forceFetch?: boolean | undefined
}

/**
 * Resolve a phash from an image URL using cache-first behavior.
 *
 * @param url Source image URL.
 * @param options Optional hints for metadata and cache behavior.
 * @returns Resolved phash plus normalized URL and optional image payload metadata.
 */
export async function getImagePhashFromUrl(
  url: string,
  options?: GetImagePhashOptions,
): Promise<PhashEntry> {
  const normalizedUrl = normalizeUrl(url)

  if (!options?.forceFetch) {
    const existingEntry = await prisma.phashUrl.findUnique({
      where: {
        url: normalizedUrl,
      },
      select: {
        phash: true,
        url: true,
        filePath: true,
      },
    })

    if (existingEntry) {
      return existingEntry
    }
  }

  const image = await fetchImageBuffer(url)
  const phash = await computeImagePhash(image.bytes)
  const filePath = getPhashImagePath(phash, image.contentType)

  if (filePath) {
    await writeFile(filePath, image.bytes)
  }

  // Save the file to the DB
  await prisma.phashUrl.upsert({
    where: {
      url: normalizedUrl,
    },
    update: {
      phash,
      filePath,
      imageContentType: image.contentType,
    },
    create: {
      phash,
      url: normalizedUrl,
      filePath,
      imageContentType: image.contentType,
    },
  })

  return {
    phash,
    url: normalizedUrl,
    filePath,
  }
}

/**
 * Load scam phash candidates scoped to a guild, optionally including global entries.
 *
 * @param guildID Guild ID for guild-specific matches. If omitted, only global entries are returned.
 * @returns Scam phash candidates eligible for comparison.
 */
async function getScamPhashCandidates(guildID?: string): Promise<PhashGuild[]> {
  const checkGuildIDs = guildID ? [guildID, '*'] : ['*']

  return prisma.phashInfo.findMany({
    where: {
      guildID: {
        in: checkGuildIDs,
      },
      isScam: true,
    },
    select: {
      phash: true,
      guildID: true,
    },
  })
}

/**
 * Compare a target phash against candidate entries and return the closest matches.
 *
 * Results are sorted by ascending hamming distance, then by phash string for stable ordering.
 *
 * @param targetPhash 64-bit phash bitstring to compare.
 * @param candidates Scam phash candidates to compare against.
 * @param limit Maximum number of ranked candidates to return.
 * @returns Ranked candidate list including distance metadata.
 */
function compareAgainstCandidates(
  targetPhash: string,
  candidates: PhashGuild[],
  limit: number,
): ComparedPhash[] {
  return candidates
    .map((candidate) => ({
      ...candidate,
      distance: phashDistance(targetPhash, candidate.phash),
      isGlobal: candidate.guildID === '*',
    }))
    .sort((a, b) => {
      if (a.distance !== b.distance) {
        return a.distance - b.distance
      }

      return a.phash.localeCompare(b.phash)
    })
    .slice(0, Math.max(0, limit))
}

/**
 * Return the closest scam phashes for a single target phash.
 *
 * @param targetPhash The bitstring phash to compare.
 * @param guildID Guild ID to include guild-scoped scam phashes alongside global entries.
 * @param limit Maximum number of closest matches to return.
 * @returns Closest matching scam phashes sorted by distance.
 */
export async function getClosestScamPhashes(
  targetPhash: string,
  guildID?: string,
  limit = 5,
): Promise<ComparedPhash[]> {
  const candidates = await getScamPhashCandidates(guildID)

  if (candidates.length === 0) {
    return []
  }

  return compareAgainstCandidates(targetPhash, candidates, limit)
}

/**
 * Return closest scam phashes along with any stored image payload for each match.
 *
 * @param targetPhash The bitstring phash to compare.
 * @param guildID Guild ID to include guild-scoped scam phashes alongside global entries.
 * @param limit Maximum number of closest matches to return.
 * @returns Closest matching scam phashes enriched with optional image metadata.
 */
export async function getClosestScamPhashesWithImages(
  targetPhash: string,
  guildID?: string,
  limit = 5,
): Promise<ComparedPhashWithImage[]> {
  const closest = await getClosestScamPhashes(targetPhash, guildID, limit)

  if (closest.length === 0) {
    return []
  }

  const uniquePhashes = [...new Set(closest.map((entry) => entry.phash))]
  const imageRows = await prisma.phashUrl.findMany({
    where: {
      phash: {
        in: uniquePhashes,
      },
      filePath: {
        not: null,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      phash: true,
      filePath: true,
      imageContentType: true,
    },
  })

  const imageByPhash = new Map<string, string | null>()

  for (const row of imageRows) {
    if (!imageByPhash.has(row.phash)) {
      imageByPhash.set(row.phash, row.filePath)
    }
  }

  return closest.map((entry) => {
    const filePath = imageByPhash.get(entry.phash)

    return Object.assign(entry, {
      url: null,
      filePath: filePath ?? null,
    })
  })
}

/**
 * Return target hashes that are within the scam distance threshold of known scam phashes.
 *
 * @param targetPhashes The phashes to test.
 * @param guildID Guild ID to include guild-scoped scam phashes alongside global entries.
 * @param threshold Maximum allowed hamming distance for a match.
 * @returns Subset of input phashes that are considered scam matches.
 */
export async function getScamMatchesForHashes(
  targetPhashes: string[],
  guildID?: string,
  threshold = PHASH_HAMMING_THRESHOLD,
): Promise<ComparedPhash[]> {
  if (targetPhashes.length === 0) {
    return []
  }

  const candidates = await getScamPhashCandidates(guildID)

  if (candidates.length === 0) {
    return []
  }

  return targetPhashes
    .map((phash) => {
      const [closest] = compareAgainstCandidates(phash, candidates, 1)
      return closest ? (closest.distance <= threshold ? closest : null) : null
    })
    .filter((entry): entry is ComparedPhash => entry !== null)
}

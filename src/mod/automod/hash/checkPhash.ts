import path from 'node:path'

import { prisma } from '../../../helpers/db.js'
import { normalizeUrl } from '../utils.js'
import { fetchImageBuffer } from './hashEmbeds.js'
import { phashDistance } from './phash.js'
import { computeImagePhash } from './phash.js'

/** Maximum hamming distance for considering two phashes a scam match. */
export const PHASH_HAMMING_THRESHOLD = 10

/**
 * Basic scam phash row fetched from storage.
 */
interface ScamPhashCandidate {
  /** 64-bit phash bitstring. */
  phash: string
  /** Guild scope for this phash; `*` indicates global scope. */
  guildID: string
}

/**
 * A scam phash candidate annotated with comparison metadata.
 */
export interface ComparedPhash extends ScamPhashCandidate {
  /** Hamming distance to the compared target phash. */
  distance: number
  /** Whether this candidate belongs to global scope (guildID === '*'). */
  isGlobal: boolean
}

/** Binary image metadata attached to a phash URL. */
export interface StoredPhashImage {
  /** Raw image bytes, if available. */
  imageData: Uint8Array<ArrayBuffer> | null
  /** Original file name, if known. */
  imageFileName: string | null
  /** MIME type, if known. */
  imageContentType: string | null
  /** Image size in bytes, if known. */
  imageSize: number | null
}

/** Resolved phash data from a URL lookup/fetch operation. */
export interface ResolvedImagePhash extends StoredPhashImage {
  /** Computed or cached 64-bit phash bitstring. */
  phash: string
  /** Normalized URL used for cache reads/writes. */
  normalizedUrl: string
  /** Whether the phash result came from the DB cache instead of a network fetch. */
  fromCache: boolean
}

/** Closest-match entry enriched with optional stored image data for display. */
export interface ComparedPhashWithImage extends ComparedPhash, StoredPhashImage {}

/**
 * Resolve a filename from URL path when no explicit filename is provided.
 *
 * @param url Input URL string.
 * @returns Filename inferred from URL path, or null when unavailable.
 */
function inferFileNameFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname
    const fileName = path.posix.basename(pathname)
    return fileName && fileName !== '/' ? fileName : null
  } catch {
    return null
  }
}

/**
 * Resolve a phash from an image URL using cache-first behavior.
 *
 * @param url Source image URL.
 * @param options Optional hints for metadata and cache behavior.
 * @param options.fileName File name to store with the image, if available.
 * @param options.contentType MIME type to store with the image, if available.
 * @param options.forceFetch If true, bypass cache and fetch image bytes.
 * @returns Resolved phash plus normalized URL and optional image payload metadata.
 */
export async function getImagePhashFromUrl(
  url: string,
  options?: {
    fileName?: string | null | undefined
    contentType?: string | null | undefined
    forceFetch?: boolean | undefined
  },
): Promise<ResolvedImagePhash> {
  const normalizedUrl = normalizeUrl(url)

  if (!options?.forceFetch) {
    const existingEntry = await prisma.phashUrl.findUnique({
      where: {
        url: normalizedUrl,
      },
      select: {
        phash: true,
        imageData: true,
        imageFileName: true,
        imageContentType: true,
        imageSize: true,
      },
    })

    if (existingEntry) {
      return {
        phash: existingEntry.phash,
        normalizedUrl,
        fromCache: true,
        imageData: existingEntry.imageData,
        imageFileName: existingEntry.imageFileName,
        imageContentType: existingEntry.imageContentType,
        imageSize: existingEntry.imageSize,
      }
    }
  }

  const image = await fetchImageBuffer(url)

  const imageFileName = options?.fileName ?? inferFileNameFromUrl(normalizedUrl)

  return {
    phash: await computeImagePhash(image.imageData),
    normalizedUrl,
    fromCache: false,
    imageData: image.imageData,
    imageFileName,
    imageContentType: image.imageContentType,
    imageSize: image.imageData.length,
  }
}

/**
 * Load scam phash candidates scoped to a guild, optionally including global entries.
 *
 * @param guildID Guild ID for guild-specific matches. If omitted, only global entries are returned.
 * @returns Scam phash candidates eligible for comparison.
 */
async function getScamPhashCandidates(guildID?: string): Promise<ScamPhashCandidate[]> {
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
  candidates: ScamPhashCandidate[],
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
      imageData: {
        not: null,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      phash: true,
      imageData: true,
      imageFileName: true,
      imageContentType: true,
      imageSize: true,
    },
  })

  const imageByPhash = new Map<string, StoredPhashImage>()

  for (const row of imageRows) {
    if (!imageByPhash.has(row.phash)) {
      imageByPhash.set(row.phash, {
        imageData: row.imageData,
        imageFileName: row.imageFileName,
        imageContentType: row.imageContentType,
        imageSize: row.imageSize,
      })
    }
  }

  return closest.map((entry) => {
    const image = imageByPhash.get(entry.phash)

    return Object.assign(entry, {
      imageData: image?.imageData ?? null,
      imageFileName: image?.imageFileName ?? null,
      imageContentType: image?.imageContentType ?? null,
      imageSize: image?.imageSize ?? null,
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

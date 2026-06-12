import { prisma } from '../../../helpers/db.js'
import { phashDistance } from './phash.js'

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
): Promise<string[]> {
  if (targetPhashes.length === 0) {
    return []
  }

  const candidates = await getScamPhashCandidates(guildID)

  if (candidates.length === 0) {
    return []
  }

  return targetPhashes.filter((phash) => {
    const [closest] = compareAgainstCandidates(phash, candidates, 1)
    return closest ? closest.distance <= threshold : false
  })
}

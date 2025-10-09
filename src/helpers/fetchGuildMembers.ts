import {
  Collection,
  Events,
  GatewayOpcodes,
  type Guild,
  type GuildMember,
  type GuildMembersChunk,
  type ReadonlyCollection,
  type Snowflake,
  SnowflakeUtil,
} from 'discord.js'
import { baseLogger, SECOND } from 'sleetcord-common'

const fetcherLogger = baseLogger.child({ module: 'fetchGuildMembers' })

interface ChunkedFetchMembersOptions {
  /**
   * The maximum time to wait for all chunks to arrive before throwing a timeout error. Defaults to 30 seconds.
   */
  time?: number
}

/**
 * Fetches all members of a guild. Uses cached chunked fetching to coalesce multiple requests within ~35 seconds to avoid the 1 req/guild/bot/30s rate limit.
 *
 * @param guild The guild to fetch members from.
 * @param options Options for fetching members.
 * @returns A collection of guild members.
 */
export async function fetchGuildMembers(
  guild: Guild,
  options: ChunkedFetchMembersOptions = {},
): Promise<Collection<Snowflake, GuildMember>> {
  const members = new Collection<Snowflake, GuildMember>()

  for await (const chunk of fetchChunkedGuildMembers(guild, options)) {
    for (const member of chunk.values()) {
      members.set(member.id, member)
    }
  }

  return members
}

interface FetchChunksCacheEntry {
  nonce: string | null
  timestamp: number
  chunks: ReadonlyCollection<Snowflake, GuildMember>[]
  done: boolean
}

const CACHE_FRESH_TIME = 35 * SECOND
const FETCH_CHUNKS_CACHE = new Collection<Snowflake, FetchChunksCacheEntry>()

/**
 * Fetches all guild members from the Discord API, returning an async generator that yields chunks of members as they arrive through the gateway.
 *
 * This function caches chunks to coalesce multiple requests for the same guild within ~35 seconds, avoiding the 1 req/guild/bot/30s rate limit.
 * The logic is otherwise similar to `GuildMemberManager#fetch`, but yields chunks as they arrive rather than waiting for all members to be fetched.
 *
 * @param guild The guild to fetch members from.
 * @param options Options for fetching members.
 * @returns An async generator yielding chunks of guild members.
 */
export async function* fetchChunkedGuildMembers(
  guild: Guild,
  options: ChunkedFetchMembersOptions = {},
) {
  const { client } = guild
  const initialCacheCheck = FETCH_CHUNKS_CACHE.get(guild.id)
  const initialNonce =
    initialCacheCheck?.nonce ?? SnowflakeUtil.generate().toString()
  const { time = 30 * SECOND } = options

  if (initialNonce.length > 32) {
    throw new RangeError('Nonce must be 32 characters or less')
  }

  let i = 0

  let isSender = false
  let fetchCache: FetchChunksCacheEntry
  const sendRequestOpCode =
    !initialCacheCheck ||
    Date.now() - initialCacheCheck.timestamp > CACHE_FRESH_TIME

  // We're the first OR it's been long enough we can refetch, we need to send off the request
  // TODO: It would be better to detect the RATE_LIMITED event from the gateway https://discord.com/developers/docs/change-log/2025-08-14-introducing-guild-members-rate-limit
  // Maybe when d.js adds support for it
  if (sendRequestOpCode) {
    fetcherLogger.trace(`Starting new fetch for guild ${guild.id}`)

    // Create a new cache entry
    fetchCache = {
      nonce: SnowflakeUtil.generate().toString(),
      timestamp: Date.now(),
      chunks: [],
      done: false,
    }

    FETCH_CHUNKS_CACHE.set(guild.id, fetchCache)

    isSender = true
    guild.shard.send({
      op: GatewayOpcodes.RequestGuildMembers,
      d: {
        guild_id: guild.id,
        nonce: fetchCache.nonce,
        query: '',
        limit: 0,
      },
    })

    setTimeout(() => {
      // Clean up the cache entry after it's stale so we don't hold onto memory forever
      const existing = FETCH_CHUNKS_CACHE.get(guild.id)
      if (existing === fetchCache) {
        FETCH_CHUNKS_CACHE.delete(guild.id)
        fetcherLogger.trace(`Clearing fetch cache for guild ${guild.id}`)
      }
    }, CACHE_FRESH_TIME).unref()
  } else {
    // Use the existing cache
    fetchCache = initialCacheCheck
  }

  const nextFetchIn = fetchCache.timestamp + CACHE_FRESH_TIME - Date.now()

  fetcherLogger.trace(
    `Fetching members for guild ${guild.id}, initial cache: ${
      initialCacheCheck ? 'HIT' : 'MISS'
    }, sending: ${isSender ? 'sender' : 'coalesced'}, nonce: ${fetchCache.nonce}, next fetch in: ${nextFetchIn}ms`,
  )

  // Catch up to all the chunks we've already received
  for (const cachedChunk of fetchCache.chunks) {
    yield cachedChunk
  }

  if (fetchCache.done) return

  let { promise, resolve } = Promise.withResolvers<void>()
  let results: ReadonlyCollection<Snowflake, GuildMember>[] = []
  let done = false

  // Start a handler to catch new chunks
  function handler(
    members: ReadonlyCollection<Snowflake, GuildMember>,
    _: Guild,
    chunk: GuildMembersChunk,
  ) {
    // console.log(
    //   'received',
    //   isSender ? 'sender' : 'coalesced',
    //   chunk.nonce === fetchCache.nonce ? 'nonce match' : 'nonce mismatch',
    //   chunk,
    // )
    if (chunk.nonce !== fetchCache.nonce) return

    i++
    results.push(members)

    if (isSender) {
      fetcherLogger.trace(
        `Received chunk ${i}/${
          chunk.count ?? '?'
        } for guild ${guild.id} (cached chunks: ${
          fetchCache.chunks.length + 1
        })`,
      )
      fetchCache.chunks.push(members)
    }

    if (members.size < 1_000 || i === chunk.count) {
      done = true
      clearTimeout(timeout)
      if (listeners !== 0) client.setMaxListeners(listeners - 1)
      client.removeListener(Events.GuildMembersChunk, handler)

      if (isSender) {
        fetchCache.done = true
      }
    }

    resolve()
    ;({ promise, resolve } = Promise.withResolvers<void>())
  }

  const listeners = client.getMaxListeners()
  if (listeners !== 0) client.setMaxListeners(listeners + 1)
  client.on(Events.GuildMembersChunk, handler)

  const timeout = setTimeout(() => {
    // Keep the sender listening since it's the only one caching chunks
    if (!isSender) {
      if (listeners !== 0) client.setMaxListeners(listeners - 1)
      client.removeListener(Events.GuildMembersChunk, handler)
    }
    throw new Error('Timeout waiting for guild members chunk')
  }, time).unref()

  while (!done) {
    await promise
    yield* results
    results = []
  }
}

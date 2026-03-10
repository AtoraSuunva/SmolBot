import { APIMessage, Message, MessageSnapshot } from 'discord.js'

/*
 * I experimented with using a WeakMap keyed by Message objects, which would allow storing metadata without modifying the Message objects themselves.
 * However, it seems like when messages are deleted Discord.js clones the old Message object, causing our stored Message !== the new Message and preventing us from retrieving our metadata.
 *
 * See this log:
 * ```
 * Patching '1480735425219006524' with [ 'id', 'channel_id', 'guild_id' ] (old has 20 keys)
 * Patching '1480735422505160736' with [ 'id', 'channel_id', 'guild_id' ] (old has 20 keys)
 * 21:13:58 [purge] Debug: POST /channels/1297100021531021377/messages/bulk-delete 204 No Content [0/1 (3.000s) 395d6cf0674e9291d994fd56de77ef96] [🌎 48]
 * Patching '1480735425219006524' with [ 'id', 'channel_id', 'guild_id' ] (old has 0 keys)
 * Patching '1480735422505160736' with [ 'id', 'channel_id', 'guild_id' ] (old has 0 keys)
 * ```
 * You can see how the first two patches have the old data, but after the bulk delete, the same messages (when comparing ID) are patched again but the old data is gone.
 * Trying to fetch from our WeakMap only retrieves the keys 'id', 'channel_id', and 'guild_id'
 *
 * If we check reference equality using this snippet in `getRawMessage`:
 * ```ts
 * const oldMessage = message.id ? MessageMap.get(message.id) : null
 * console.log('Checking equality for', message.id, oldMessage === message)
 * ```
 *
 * We get:
 * ```
 * Checking equality for 1480735425219006524 false
 * Checking equality for 1480735422505160736 false
 * ```
 *
 * Showing that 2 Message objects with the same ID are not reference equal, which means our WeakMap treats them like separate keys.
 * Trying to get around this would involve working with Discord.js' internals or modifying the Message objects, at which point we might as well just store the data on the Message objects.
 */

const RawDataSymbol = Symbol('rawData')

/**
 * Get the raw data associated with a Discord.js Message object. This is the data received directly from the Discord API, parsed from JSON into an object but otherwise unmodified.
 *
 * This is stored directly on the Message object using a symbol to avoid collisions with other properties.
 *
 * There was an attempt to back this using a WeakMap, but it seems like Discord.js clones Message objects when they are deleted, making it impossible to use a WeakMap.
 * Check the comments in the code for more details.
 * @param message The Message to get the raw API data for
 * @returns The raw APIMessage data received from Discord
 */
export function getRawMessage(message: Message | MessageSnapshot): APIMessage | undefined {
  return (message as unknown as MessageWithRaw)[RawDataSymbol]
}

/**
 * Patch a message with new raw data
 *
 * @param message The Message to patch
 * @param data The new raw APIMessage data to associate with the Message
 * @returns void
 */
function patchMessage(message: Message, data: APIMessage) {
  ;(message as unknown as MessageWithRaw)[RawDataSymbol] = Object.assign(
    (message as unknown as MessageWithRaw)[RawDataSymbol] ?? {},
    data,
  )
}

export interface MessageWithRaw {
  [RawDataSymbol]: APIMessage
}

// Since _patch is a private method, we need to get around TS by using bracket notation
const oldPatch = Message.prototype['_patch']

Message.prototype['_patch'] = function (data: APIMessage) {
  oldPatch.call(this, data)
  patchMessage(this, data)
}

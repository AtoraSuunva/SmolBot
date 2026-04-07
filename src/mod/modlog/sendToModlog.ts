import { GuildTextBasedChannel, Message, MessageCreateOptions } from 'discord.js'

type SendMessageOptions = string | MessageCreateOptions

interface SendToModlogOptions {
  /** Should this message be queued and merged with upcoming messages within the next second. Default false */
  merge?: boolean
}

interface ModlogQueue {
  sendOptions: SendMessageOptions
  channel: GuildTextBasedChannel
  timeout: NodeJS.Timeout
  promise: Promise<Message<true>>
  resolve: (message: Message<true>) => void
}

/** Map of <ChannelID, Queue> */
const modlogQueues = new Map<string, ModlogQueue>()

const QUEUE_TIMEOUT = 1000

/**
 * Sends a message to the modlog channel.
 *
 * This will merge messages sent within a short time frame if the `merge` option is enabled, to prevent spamming the modlog channel with multiple messages in quick succession.
 *
 * Merging uses the following logic:
 * - If a message is sent with `merge: false`, immediately empty the queue and then send the message.
 * - If a message is sent with `merge: true`:
 *   - If adding the message to the queue would overflow the content (2000 character limit) or embed (10 embed limit), immediately send the current queue and then add the message to a new queue.
 *   - Otherwise, add the message to the queue. All upcoming messages in the next second will be merged into this queue and then be sent as one message
 */
export async function sendToModlog(
  channel: GuildTextBasedChannel,
  sendOptions: SendMessageOptions,
  { merge = false }: SendToModlogOptions = {},
): Promise<Message<true>> {
  const queue = modlogQueues.get(channel.id)

  if (!merge) {
    // If merge is false, immediately send the message and clear the queue
    if (queue) {
      await flushModlogQueue(queue)
    }

    return channel.send(sendOptions)
  }

  if (!queue) {
    // If there is no existing queue, create a new one
    return createModlogQueue(channel, sendOptions)
  }

  // If there is an existing queue, merge the new message with the existing one
  const mergedOptions = mergeSendOptions([queue.sendOptions, sendOptions])

  // Check if the merged content exceeds Discord's limits
  const contentLength =
    typeof mergedOptions === 'string' ? mergedOptions.length : mergedOptions.content?.length || 0
  const embedCount = typeof mergedOptions === 'string' ? 0 : mergedOptions.embeds?.length || 0

  if (contentLength > 2000 || embedCount > 10) {
    // If it does, send the existing queue immediately and start a new queue with the new message
    await flushModlogQueue(queue)
    return createModlogQueue(channel, sendOptions)
  } else {
    // Merge the new message with the existing queue
    modlogQueues.set(channel.id, {
      ...queue,
      sendOptions: mergedOptions,
    })
    return queue.promise
  }
}

async function flushModlogQueue(queue: ModlogQueue): Promise<Message<true>> {
  clearTimeout(queue.timeout)
  modlogQueues.delete(queue.channel.id)

  const message = await queue.channel.send(queue.sendOptions)
  queue.resolve(message)
  return message
}

function createModlogQueue(channel: GuildTextBasedChannel, sendOptions: SendMessageOptions) {
  const { promise, resolve } = Promise.withResolvers<Message<true>>()
  const timeout = setTimeout(() => flushModlogQueue(queue).then(resolve), QUEUE_TIMEOUT)

  const queue: ModlogQueue = { channel, sendOptions, timeout, promise, resolve }
  modlogQueues.set(channel.id, queue)
  return promise
}

/**
 * Merges multiple SendMessageOptions into a single SendMessageOptions object. This is used to combine multiple messages into one when merging is enabled.
 *
 * The merging logic is as follows:
 * - The content of all messages is combined into a single string, separated by newlines.
 * - If any of the messages have embeds, they are all included in the merged message.
 * - If any of the messages have attachments, they are all included in the merged message.
 * - Any other options are not merged
 */
function mergeSendOptions(optionsArray: SendMessageOptions[]): SendMessageOptions {
  const content = []
  const embeds = []
  const files = []

  for (const options of optionsArray) {
    if (typeof options === 'string') {
      content.push(options)
    } else {
      if (options.content) content.push(options.content)
      if (options.embeds) embeds.push(...options.embeds)
      if (options.files) files.push(...options.files)
    }
  }

  return {
    content: content.join('\n'),
    embeds,
    files,
    allowedMentions: { parse: [] },
  }
}

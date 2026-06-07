import { ApplicationCommandOptionType, type Guild, type Message, type User } from 'discord.js'
import { SECOND } from 'sleetcord-common'

import { plural } from '../../../helpers/format.js'
import { getRawMessage } from '../../../helpers/rawMessage.js'
import { getAutomodStore, type AutomodStoreReturn } from '../automodMiddleware.js'
import { AutomodRule, type AutomodEventResult } from '../modules/AutomodRule.js'
import { deleteMessages } from '../utils.js'

export interface RepeatInfractionInfo<Identifier> {
  /** The previous messages that "matched" some criteria to count as an infraction */
  previousMessages: Set<Message>
  /** Some "key" that was last derived from the message, something like message content or attachment hashes */
  lastIdentifier: Identifier
  /** The timestamp of the last infraction */
  lastInfractionTimestamp: number
  /** The timestamp of the first infraction in the current series */
  firstInfractionTimestamp: number
  /** The number of times this infraction has been repeated consecutively */
  repeatCount: number
}

const infractionInfoMap = new Map<string, RepeatInfractionInfo<Set<string>>>()

export const embedRepeatsRule = new AutomodRule(
  {
    name: 'embed-repeats',
    description: 'Triggers when an embed is repeated',
    options: [
      {
        name: 'repeats',
        description: 'Trigger when an embed has been repeated this many times',
        type: ApplicationCommandOptionType.Integer,
        required: true,
        min_value: 2,
        max_value: 100,
      },
      {
        name: 'interval',
        description: 'Count repeats sent within this many seconds (0 for no cooldown)',
        type: ApplicationCommandOptionType.Integer,
        required: true,
        min_value: 0,
      },
      {
        name: 'delete',
        description: 'Delete the triggering messages (default: false)',
        type: ApplicationCommandOptionType.Boolean,
      },
    ] as const,
  },
  {
    async run(i, required) {
      const repeats = i.options.getInteger('repeats')
      const interval = i.options.getInteger('interval')
      const deleteTarget = i.options.getBoolean('delete')

      return Promise.resolve({
        repeats: repeats ?? (required ? 2 : null),
        interval: interval ?? (required ? 0 : null),
        delete: deleteTarget ?? (required ? false : null),
      })
    },

    async messageCreate(message): Promise<AutomodEventResult[]> {
      if (!message.inGuild()) {
        return []
      }

      const ruleInstances = getAutomodStore<typeof embedRepeatsRule>()

      return await Promise.all(
        ruleInstances.map(({ rule, params }) =>
          checkForRepeats(rule, params, message.author, message.guild, message),
        ),
      )
    },
  },
)

type EmbedRepeatStore = AutomodStoreReturn<typeof embedRepeatsRule>[number]

/**
 * Check if a message is a repeat and should trigger the automod rule, and return the appropriate action if so
 */
async function checkForRepeats(
  rule: EmbedRepeatStore['rule'],
  params: EmbedRepeatStore['params'],
  user: User,
  guild: Guild,
  message: Message,
): Promise<AutomodEventResult> {
  const rawMessage = getRawMessage(message)

  const attachments = rawMessage
    ? rawMessage.attachments.map((a) => (a.placeholder ? a.placeholder : `${a.filename}-${a.size}`))
    : message.attachments.map((a) => `${a.name}-${a.size}`)

  const messageIdentifiers = [
    ...message.embeds.filter((e) => e.url).map((e) => e.url!),
    ...attachments,
  ]

  if (messageIdentifiers.length === 0) {
    return
  }

  const identifiers = new Set<string>()
  let repeats = 0

  for (const id of messageIdentifiers) {
    if (identifiers.has(id)) {
      repeats++
    } else {
      identifiers.add(id)
    }
  }

  const key = `${rule.ruleID}-${guild.id}-${user.id}`
  const now = Date.now()

  const info = infractionInfoMap.getOrInsert(key, {
    previousMessages: new Set<Message>([message]),
    lastIdentifier: identifiers,
    lastInfractionTimestamp: now,
    firstInfractionTimestamp: now,
    repeatCount: 1,
  })

  const intervalMs = params.interval * SECOND
  const isWithinInterval = intervalMs === 0 ? true : now - info.lastInfractionTimestamp < intervalMs

  // short circuit the intersection if isWithinInterval is false since it won't count as a repeat regardless
  const intersection = isWithinInterval
    ? info.lastIdentifier.intersection(identifiers)
    : new Set<string>()

  if (isWithinInterval && (repeats > 0 || intersection.size > 0)) {
    info.repeatCount += intersection.size + repeats
    info.lastInfractionTimestamp = now

    if (message) {
      info.previousMessages.add(message)
    }

    if (info.repeatCount >= params.repeats) {
      if (params.delete) {
        await deleteMessages(info.previousMessages)
      }

      const seconds = Math.round((now - info.firstInfractionTimestamp) / 1000)

      // Then reset it
      infractionInfoMap.set(key, {
        previousMessages: new Set<Message>(),
        lastIdentifier: identifiers,
        lastInfractionTimestamp: now,
        firstInfractionTimestamp: now,
        repeatCount: 1,
      })

      return {
        rule,
        logMessage: `Sent ${info.repeatCount} identical embeds in ${plural('second', seconds)}`,
      }
    }
  } else {
    // Reset the infraction info if the embed is different or cooldown has expired
    infractionInfoMap.set(key, {
      previousMessages: new Set<Message>([message]),
      lastIdentifier: identifiers,
      lastInfractionTimestamp: now,
      firstInfractionTimestamp: now,
      repeatCount: 1,
    })
  }

  return
}

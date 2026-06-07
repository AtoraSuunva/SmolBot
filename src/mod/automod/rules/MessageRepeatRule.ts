import {
  ApplicationCommandOptionType,
  AutoModerationActionType,
  Guild,
  User,
  type Message,
} from 'discord.js'
import { SECOND } from 'sleetcord-common'

import { plural } from '../../../helpers/format.js'
import { AutomodStoreReturn, getAutomodStore } from '../automodMiddleware.js'
import { AutomodEventResult, AutomodRule } from '../modules/AutomodRule.js'
import { deleteMessages } from '../utils.js'

export interface RepeatInfractionInfo<Identifier> {
  /** The previous messages that "matched" some criteria to count as an infraction */
  previousMessages: Message[]
  /** Some "key" that was last derived from the message, something like message content or attachment hashes */
  lastIdentifier: Identifier
  /** The timestamp of the last infraction */
  lastInfractionTimestamp: number
  /** The timestamp of the first infraction in the current series */
  firstInfractionTimestamp: number
  /** The number of times this infraction has been repeated consecutively */
  repeatCount: number
}

const infractionInfoMap = new Map<string, RepeatInfractionInfo<string>>()

export const messageRepeatsRule = new AutomodRule(
  {
    name: 'message-repeats',
    description: 'Triggers when messages are repeated in a row',
    options: [
      {
        name: 'repeats',
        description: 'Trigger after this many repeats',
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
        description: 'Delete the repeated messages (default: false)',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'native_automod',
        description: 'Count messages caught & blocked by native automod (default: false)',
        type: ApplicationCommandOptionType.Boolean,
      },
    ] as const,
  },
  {
    async run(i, required) {
      const repeats = i.options.getInteger('repeats')
      const interval = i.options.getInteger('interval')
      const deleteTarget = i.options.getBoolean('delete')
      const nativeAutomod = i.options.getBoolean('native_automod')

      return Promise.resolve({
        repeats: repeats ?? (required ? 2 : null),
        interval: interval ?? (required ? 0 : null),
        delete: deleteTarget ?? (required ? false : null),
        native_automod: nativeAutomod ?? (required ? false : null),
      })
    },

    async messageCreate(message): Promise<AutomodEventResult[]> {
      if (!message.inGuild()) {
        return []
      }

      const ruleInstances = getAutomodStore<typeof messageRepeatsRule>()

      return await Promise.all(
        ruleInstances.map(({ rule, params }) =>
          checkForRepeats(rule, params, message.content, message.author, message.guild, message),
        ),
      )
    },

    async autoModerationActionExecution(action): Promise<AutomodEventResult[]> {
      const ruleInstances = getAutomodStore<typeof messageRepeatsRule>()
      const ruleResults: Promise<AutomodEventResult>[] = []

      for (const { rule, params } of ruleInstances) {
        if (
          !params.native_automod ||
          action.action.type !== AutoModerationActionType.BlockMessage
        ) {
          continue
        }

        // User that triggered the rule
        const user = await this.client.users.fetch(action.userId).catch(() => null)

        if (!user) {
          // give up
          continue
        }

        ruleResults.push(checkForRepeats(rule, params, action.content, user, action.guild))
      }

      return Promise.all(ruleResults)
    },
  },
)

type MessageRepeatStore = AutomodStoreReturn<typeof messageRepeatsRule>[number]

/**
 * Check if a message is a repeat and should trigger the automod rule, and return the appropriate action if so
 *
 * @param rule The automod rule being checked
 * @param params The parameters for this rule instance
 * @param content The content to check for repeats, typically the message content (taken from the message or automod execution)
 * @param user The user who sent the message
 * @param guild The guild where the message was sent
 * @param message The message object itself, used for deletion if necessary
 * @returns An AutomodEventResult indicating the action to take if this is a repeat, or undefined if not
 */
async function checkForRepeats(
  rule: MessageRepeatStore['rule'],
  params: MessageRepeatStore['params'],
  content: string,
  user: User,
  guild: Guild,
  message?: Message,
): Promise<AutomodEventResult> {
  const key = `${rule.ruleID}-${guild.id}-${user.id}`
  const now = Date.now()
  const identifier = content.toLowerCase()

  let info = infractionInfoMap.get(key)
  if (!info) {
    infractionInfoMap.set(key, {
      previousMessages: message ? [message] : [],
      lastIdentifier: identifier,
      lastInfractionTimestamp: now,
      firstInfractionTimestamp: now,
      repeatCount: 1,
    })

    return
  }

  const intervalMs = params.interval * SECOND
  const isWithinInterval = intervalMs === 0 ? true : now - info.lastInfractionTimestamp < intervalMs

  if (isWithinInterval && identifier && identifier === info.lastIdentifier) {
    info.repeatCount++
    info.lastInfractionTimestamp = now
    if (message) {
      info.previousMessages.push(message)
    }

    if (info.repeatCount >= params.repeats) {
      if (params.delete) {
        await deleteMessages(info.previousMessages)
      }

      const seconds = Math.round((now - info.firstInfractionTimestamp) / 1000)

      // Then reset it
      infractionInfoMap.set(key, {
        previousMessages: [],
        lastIdentifier: identifier,
        lastInfractionTimestamp: now,
        firstInfractionTimestamp: now,
        repeatCount: 1,
      })

      return {
        rule,
        logMessage: `Sent ${info.repeatCount} identical messages in ${plural('second', seconds)}`,
      }
    }
  } else {
    // Reset the infraction info if the message is different or cooldown has expired
    infractionInfoMap.set(key, {
      previousMessages: message ? [message] : [],
      lastIdentifier: identifier,
      lastInfractionTimestamp: now,
      firstInfractionTimestamp: now,
      repeatCount: 1,
    })
  }

  return
}

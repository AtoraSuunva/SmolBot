import {
  ApplicationCommandOptionType,
  AutoModerationActionType,
  Guild,
  GuildTextBasedChannel,
  SendableChannels,
  User,
  type Message,
} from 'discord.js'
import { SECOND } from 'sleetcord-common'

import { plural } from '../../../helpers/format.js'
import { AutomodStoreReturn, getAutomodStore } from '../automodMiddleware.js'
import { AutomodEventResult, AutomodRule } from '../modules/AutomodRule.js'

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
    description: 'Action users when they repeat messages too many times in a row',
    options: [
      {
        name: 'repeats',
        description: 'Trigger the rule when a message has been repeated this many times',
        type: ApplicationCommandOptionType.Integer,
        required: true,
        min_value: 2,
        max_value: 100,
      },
      {
        name: 'interval',
        description:
          'Count as a repeat if it was sent within this many seconds of the last message (0 for no cooldown)',
        type: ApplicationCommandOptionType.Integer,
        required: true,
        min_value: 0,
      },
      {
        name: 'delete',
        description: 'Delete the messages that triggered the rule (default: false)',
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
      const repeats = i.options.getInteger('repeats', required)
      const interval = i.options.getInteger('interval', required)
      const deleteTarget = i.options.getBoolean('delete') ?? false
      const nativeAutomod = i.options.getBoolean('native_automod') ?? false

      return Promise.resolve({
        repeats,
        interval,
        delete: deleteTarget,
        native_automod: nativeAutomod,
      })
    },

    async messageCreate(message): Promise<AutomodEventResult> {
      if (message.author.bot || !message.inGuild()) {
        return
      }

      const { rule, params } = getAutomodStore<typeof messageRepeatsRule>()

      return checkForRepeats(
        rule,
        params,
        message.content,
        message.author,
        message.guild,
        message.channel as SendableChannels,
        message,
      )
    },

    async autoModerationActionExecution(action): Promise<AutomodEventResult> {
      const { rule, params } = getAutomodStore<typeof messageRepeatsRule>()

      if (!params.native_automod || action.action.type !== AutoModerationActionType.BlockMessage) {
        return
      }

      // User that triggered the rule
      const user = await this.client.users.fetch(action.userId).catch(() => null)
      // Channel the rule alert was sent
      const channel = action.alertSystemMessageId
        ? ((await this.client.channels
            .fetch(action.alertSystemMessageId)
            .catch(() => null)) as SendableChannels)
        : null

      if (!user) {
        // give up
        return
      }

      return checkForRepeats(rule, params, action.content ?? '', user, action.guild, channel)
    },
  },
)

type MessageRepeatStore = AutomodStoreReturn<typeof messageRepeatsRule>

/**
 * Check if a message is a repeat and should trigger the automod rule, and return the appropriate action if so
 */
async function checkForRepeats(
  rule: MessageRepeatStore['rule'],
  params: MessageRepeatStore['params'],
  content: string,
  user: User,
  guild: Guild,
  channel: SendableChannels | null,
  message?: Message,
): Promise<AutomodEventResult> {
  const key = `${rule.ruleID}-${guild.id}-${user.id}`
  const now = Date.now()
  const identifier = content.toLowerCase()

  let info = infractionInfoMap.get(key)
  if (!info) {
    info = {
      previousMessages: message ? [message] : [],
      lastIdentifier: identifier,
      lastInfractionTimestamp: now,
      firstInfractionTimestamp: now,
      repeatCount: 1,
    }
    infractionInfoMap.set(key, info)

    return
  }

  const intervalMs = params.interval * SECOND
  const isWithinInterval = intervalMs === 0 ? true : now - info.lastInfractionTimestamp < intervalMs

  if (identifier === info.lastIdentifier && isWithinInterval) {
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

      return {
        logMessage: `Sent ${info.repeatCount} identical messages in ${plural('second', seconds)}`,
        targetUser: user,
        targetChannel: channel,
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

/**
 * Delete messages, groups messages into bulk deletions where possible, and falls back to individual deletions if not (e.g. for messages in different channels)
 *
 * @param messages The messages to delete
 */
async function deleteMessages(messages: Message[]) {
  const channelToMessages = new Map<GuildTextBasedChannel, Message[]>()

  for (const message of messages) {
    const channel = message.channel as GuildTextBasedChannel
    const channelMessages = channelToMessages.get(channel) ?? []
    channelMessages.push(message)
    channelToMessages.set(channel, channelMessages)
  }

  for (const [channel, messages] of channelToMessages.entries()) {
    if (messages.length > 1) {
      await channel.bulkDelete(messages).catch(() => {})
    } else {
      await messages[0].delete().catch(() => {})
    }
  }
}

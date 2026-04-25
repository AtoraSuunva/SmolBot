import { ApplicationCommandOptionType, type Message } from 'discord.js'
import { SECOND } from 'sleetcord-common'

import { getAutomodStore } from '../automodMiddleware.js'
import { AutomodRule } from '../modules/AutomodRule.js'

export interface RepeatInfractionInfo<Identifier> {
  /** The previous messages that "matched" some criteria to count as an infraction */
  previousMessages: Message[]
  /** Some "key" that was last derived from the message, something like message content or attachment hashes */
  lastIdentifier: Identifier
  /** The timestamp of the last infraction */
  lastInfractionTimestamp: number
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
    ] as const,
  },
  {
    async run(i, required) {
      const repeats = i.options.getInteger('repeats', required)
      const interval = i.options.getInteger('interval', required)

      return Promise.resolve({
        repeats,
        interval,
      })
    },

    async messageCreate(message) {
      if (message.author.bot) {
        return
      }

      const { rule, params } = getAutomodStore<typeof messageRepeatsRule>()

      const key = `${rule.ruleID}-${message.guildId}-${message.author.id}`
      const now = Date.now()

      let info = infractionInfoMap.get(key)
      if (!info) {
        info = {
          previousMessages: [],
          lastIdentifier: '',
          lastInfractionTimestamp: 0,
          repeatCount: 1,
        }
        infractionInfoMap.set(key, info)
      }

      const identifier = message.content.toLowerCase()
      const intervalMs = params.interval * SECOND
      const isWithinInterval =
        intervalMs === 0 ? true : now - info.lastInfractionTimestamp < intervalMs

      if (identifier === info.lastIdentifier && isWithinInterval) {
        info.repeatCount++
        info.lastInfractionTimestamp = now
        info.previousMessages.push(message)

        if (info.repeatCount >= params.repeats) {
          if (rule.deleteTarget && 'bulkDelete' in message.channel) {
            await message.channel.bulkDelete(info.previousMessages).catch(() => {})
          }

          return {
            targetUser: message.author,
            targetChannel: message.channel,
          }
        }
      } else {
        // reset the infraction info if the message is different or cooldown has expired
        info.lastIdentifier = identifier
        info.lastInfractionTimestamp = now
        info.repeatCount = 1
        info.previousMessages = [message]
      }

      return
    },
  },
)

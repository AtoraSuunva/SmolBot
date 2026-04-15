import { ApplicationCommandOptionType, type Message } from 'discord.js'

import { AutomodRule } from './AutomodRule.js'

export interface RepeatInfractionInfo<Identifier> {
  /** The previous messages that "matched" some criteria to count as an infraction */
  previousMessages: Message[]
  /** Some "key" that was last derived from the message, something like message content or attachment hashes */
  lastIdentifier: Identifier
  /** The number of times the key has been repeated */
  repeats: number
}

export const BaseRepeatRule = new AutomodRule(
  {
    name: 'base-repeat',
    description: 'Repeat rule',
    options: [
      {
        name: 'max-repeats',
        description: 'The maximum number of repeats allowed',
        type: ApplicationCommandOptionType.Integer,
        required: true,
        min_value: 2,
        max_value: 100,
      },
      {
        name: 'cooldown',
        description: 'The cooldown between each repeat',
        type: ApplicationCommandOptionType.Integer,
      },
    ] as const,
  },
  {
    async run(i) {
      await i.reply('ok')
      return Promise.resolve({
        'max-repeats': 1,
        cooldown: 0,
      })
    },
    async messageCreate(message) {
      // need some way to access rule parameters here...
      console.log('messageCreate', message.content)
    },
  },
)

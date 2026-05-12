import { ApplicationCommandOptionType } from 'discord.js'

import { getAutomodStore } from '../automodMiddleware.js'
import { AutomodEventResult, AutomodRule } from '../modules/AutomodRule.js'

export const reactionFilterRule = new AutomodRule(
  {
    name: 'reaction-filter',
    description: 'Trigger when a user adds a reaction that matches certain criteria',
    options: [
      {
        name: 'emoji',
        description:
          'The emojis to filter for (unicode, custom emoji name, or custom emoji ID. Comma-separated)',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: 'delete',
        description: 'Delete the reaction that triggered the rule (default: false)',
        type: ApplicationCommandOptionType.Boolean,
      },
    ] as const,
  },
  {
    async run(i, required) {
      const emoji = i.options.getString('emoji', required)
      const del = i.options.getBoolean('delete', required) ?? false

      return {
        emoji,
        delete: del,
      }
    },

    async messageReactionAdd(reaction, user): Promise<AutomodEventResult> {
      const { message } = reaction
      if (!message.inGuild()) {
        return
      }

      const { params } = getAutomodStore<typeof reactionFilterRule>()

      const emojis = params.emoji.split(',').map((e) => e.trim())

      for (const emoji of emojis) {
        if (reaction.emoji.id === emoji || reaction.emoji.name === emoji) {
          const targetUser = await this.client.users.fetch(user.id)

          if (params.delete) {
            await reaction.remove().catch(() => null)
          }

          const emote = reaction.emoji.id
            ? `${reaction.emoji.name} (${reaction.emoji.id})`
            : reaction.emoji.name

          return {
            targetUser,
            targetChannel: message.channel,
            logMessage: `Added reaction ${emote} to ${message.url}`,
          }
        }
      }

      return
    },
  },
)

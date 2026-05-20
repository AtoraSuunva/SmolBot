import {
  ApplicationCommandOptionType,
  type GuildTextBasedChannel,
  type MessageReaction,
  type PartialMessageReaction,
  type User,
} from 'discord.js'

import { getAutomodStore, type AutomodStoreReturn } from '../automodMiddleware.js'
import { AutomodEventResult, AutomodRule } from '../modules/AutomodRule.js'

export const reactionRule = new AutomodRule(
  {
    name: 'reaction',
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

    async messageReactionAdd(reaction, user): Promise<AutomodEventResult[]> {
      const { message } = reaction
      if (!message.inGuild()) {
        return []
      }

      const resolvedUser = await reaction.client.users.fetch(user.id).catch(() => null)
      if (!resolvedUser || resolvedUser.bot) {
        return []
      }

      const ruleInstances = getAutomodStore<typeof reactionRule>()

      return Promise.all(
        ruleInstances.map(({ rule, params }) =>
          checkReactionMatch(rule, params, reaction, resolvedUser).catch(() => null),
        ),
      )
    },
  },
)

type ReactionRuleStore = AutomodStoreReturn<typeof reactionRule>[number]

async function checkReactionMatch(
  rule: ReactionRuleStore['rule'],
  params: ReactionRuleStore['params'],
  reaction: MessageReaction | PartialMessageReaction,
  user: User,
): Promise<AutomodEventResult> {
  const emojis = params.emoji.split(',').map((e) => e.trim())

  for (const emoji of emojis) {
    if (reaction.emoji.id === emoji || reaction.emoji.name === emoji) {
      if (params.delete) {
        await reaction.remove().catch(() => null)
      }

      const emote = reaction.emoji.id
        ? `${reaction.emoji.name} (${reaction.emoji.id})`
        : reaction.emoji.name

      return {
        rule,
        targetUser: user,
        targetChannel: reaction.message.channel as GuildTextBasedChannel,
        logMessage: `Added reaction ${emote} to ${reaction.message.url}`,
      }
    }
  }
}

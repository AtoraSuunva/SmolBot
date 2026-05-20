import {
  ApplicationCommandOptionType,
  escapeInlineCode,
  inlineCode,
  type Message,
  type OmitPartialGroupDMChannel,
  type SendableChannels,
  type User,
} from 'discord.js'

import { workerMatch } from '../../../helpers/regexWorker.js'
import { getAutomodStore, type AutomodStoreReturn } from '../automodMiddleware.js'
import { AutomodEventResult, AutomodRule } from '../modules/AutomodRule.js'

export const regexRule = new AutomodRule(
  {
    name: 'regex',
    // TODO: support regex matching for other events like message updates, reactions, usernames/display names, etc.
    description: 'Trigger when a message matches a specified regular expression',
    options: [
      {
        name: 'pattern',
        description: 'The regular expression pattern to match against messages',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: 'flags',
        description: "Optional regex flags (e.g. 'i' for case-insensitive, 'g' for global).",
        type: ApplicationCommandOptionType.String,
      },
      {
        name: 'delete',
        description: 'Delete the message that triggered the rule (default: false)',
        type: ApplicationCommandOptionType.Boolean,
      },
    ] as const,
  },
  {
    async run(i) {
      const pattern = i.options.getString('pattern', true)
      const flags = i.options.getString('flags') ?? ''
      const del = i.options.getBoolean('delete') ?? false

      // Validate the regex pattern and flags
      try {
        // oxlint-disable-next-line no-new We're just validating the regex
        new RegExp(pattern, flags)
      } catch (e) {
        throw new Error(
          `Invalid regular expression: ${e instanceof Error ? e.message : String(e)}`,
          { cause: e },
        )
      }

      return Promise.resolve({
        pattern,
        flags,
        delete: del,
      })
    },

    async messageCreate(message): Promise<AutomodEventResult[]> {
      if (message.author.bot || message.system || !message.inGuild()) {
        return []
      }

      const ruleInstances = getAutomodStore<typeof regexRule>()

      const user = message.author
      const content = message.content
      const channel = message.channel

      return Promise.all(
        ruleInstances.map(({ rule, params }) =>
          checkRegexMatch(rule, params, user, content, channel, message),
        ),
      )
    },
  },
)

type RegexRuleStore = AutomodStoreReturn<typeof regexRule>[number]

async function checkRegexMatch(
  rule: RegexRuleStore['rule'],
  params: RegexRuleStore['params'],
  user: User,
  content: string,
  channel?: SendableChannels,
  message?: OmitPartialGroupDMChannel<Message>,
): Promise<AutomodEventResult> {
  const regex = new RegExp(params.pattern, params.flags)

  if (await workerMatch(regex, content)) {
    if (message && params.delete) {
      await message.delete().catch(() => null)
    }

    const formattedRegex = inlineCode(escapeInlineCode(regex.toString()))

    const url = message ? `on ${message.url}` : channel ? ` in <#${channel.id}>` : ''

    return {
      rule,
      targetUser: user,
      targetChannel: channel ?? null,
      logMessage: `Matched regex ${formattedRegex}${url}`,
    }
  }
}

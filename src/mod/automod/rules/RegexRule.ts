import {
  ApplicationCommandOptionType,
  escapeInlineCode,
  inlineCode,
  type Message,
  type OmitPartialGroupDMChannel,
} from 'discord.js'

import { getAutomodStore, type AutomodStoreReturn } from '../automodMiddleware.js'
import { AutomodEventResult, AutomodRule } from '../modules/AutomodRule.js'

const { workerMatch } = await import('../../../helpers/regexWorker.js')

export const regexRule = new AutomodRule(
  {
    name: 'regex',
    // TODO: support regex matching for other events like usernames/display names, etc.
    description: 'Match against a regex',
    options: [
      {
        name: 'pattern',
        description: 'Regex to match against',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: 'flags',
        description: 'Regex flags',
        type: ApplicationCommandOptionType.String,
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
      const pattern = i.options.getString('pattern')
      const flags = i.options.getString('flags')
      const del = i.options.getBoolean('delete')

      // Validate the regex pattern and flags
      if (pattern || flags) {
        try {
          // oxlint-disable-next-line no-new We're just validating the regex
          new RegExp(pattern ?? '', flags ?? '')
        } catch (e) {
          throw new Error(
            `Invalid regular expression: ${e instanceof Error ? e.message : String(e)}`,
            { cause: e },
          )
        }
      }

      return Promise.resolve({
        pattern: pattern ?? (required ? '' : null),
        flags: flags ?? (required ? '' : null),
        delete: del ?? (required ? false : null),
      })
    },

    async messageCreate(message): Promise<AutomodEventResult[]> {
      if (message.system || !message.inGuild()) {
        return []
      }

      const ruleInstances = getAutomodStore<typeof regexRule>()

      const content = message.content
      const onTarget = `message ${message.url}`

      return Promise.all(
        ruleInstances.map(({ rule, params }) =>
          checkRegexMatch(rule, params, content, onTarget, message),
        ),
      )
    },

    async messageUpdate(_oldMessage, newMessage): Promise<AutomodEventResult[]> {
      // Check against the updated message
      if (newMessage.system || !newMessage.inGuild()) {
        return []
      }

      const ruleInstances = getAutomodStore<typeof regexRule>()

      const content = newMessage.content

      const onTarget = `edited message ${newMessage.url}`

      return Promise.all(
        ruleInstances.map(({ rule, params }) =>
          checkRegexMatch(rule, params, content, onTarget, newMessage),
        ),
      )
    },

    async messageReactionAdd(reaction): Promise<AutomodEventResult[]> {
      const { message } = reaction
      if (!message.inGuild()) {
        return []
      }

      // Check the regex against the reaction name
      const ruleInstances = getAutomodStore<typeof regexRule>()

      const content = reaction.emoji.name

      if (!content) {
        return []
      }

      const emote = reaction.emoji.id
        ? `**${reaction.emoji.name}** (${reaction.emoji.id})`
        : `**${reaction.emoji.name}**`

      const onTarget = `reaction ${emote} on message ${message.url}`

      return Promise.all(
        ruleInstances.map(({ rule, params }) =>
          checkRegexMatch(rule, params, content, onTarget, message),
        ),
      )
    },
  },
)

type RegexRuleStore = AutomodStoreReturn<typeof regexRule>[number]

async function checkRegexMatch(
  rule: RegexRuleStore['rule'],
  params: RegexRuleStore['params'],
  content: string,
  onTarget: string,
  message?: OmitPartialGroupDMChannel<Message>,
): Promise<AutomodEventResult> {
  const regex = new RegExp(params.pattern, params.flags)

  if (await workerMatch(regex, content)) {
    if (message && params.delete) {
      await message.delete().catch(() => null)
    }

    const formattedRegex = inlineCode(escapeInlineCode(regex.toString()))

    return {
      rule,
      logMessage: `Matched regex ${formattedRegex} on ${onTarget}`,
    }
  }
}

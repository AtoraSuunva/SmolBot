import { ApplicationCommandOptionType, escapeInlineCode, inlineCode } from 'discord.js'

import { workerMatch } from '../../../helpers/regexWorker.js'
import { getAutomodStore } from '../automodMiddleware.js'
import { AutomodEventResult, AutomodRule } from '../modules/AutomodRule.js'

export const regexRule = new AutomodRule(
  {
    name: 'regex-rule',
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

    async messageCreate(message): Promise<AutomodEventResult> {
      if (message.author.bot || !message.inGuild()) {
        return
      }

      const { params } = getAutomodStore<typeof regexRule>()

      const regex = new RegExp(params.pattern, params.flags)

      if (await workerMatch(regex, message.content)) {
        const targetUser = await this.client.users.fetch(message.author.id)

        if (params.delete) {
          await message.delete().catch(() => null)
        }

        const formattedRegex = inlineCode(escapeInlineCode(regex.toString()))

        return {
          targetUser,
          targetChannel: message.channel,
          logMessage: `Matched regex ${formattedRegex} in ${message.url}`,
        }
      }

      return
    },
  },
)

import { uniGetBlock, uniGetCategories, uniGetScripts } from 'char-info'
import {
  ApplicationIntegrationType,
  InteractionContextType,
} from 'discord-api-types/v10'
import {
  ApplicationCommandOptionType,
  type ChatInputCommandInteraction,
  codeBlock,
} from 'discord.js'
import { SleetSlashCommand } from 'sleetcord'

export const char_info = new SleetSlashCommand(
  {
    name: 'char_info',
    description: 'Get information about a string of characters',
    contexts: [
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel,
    ],
    integration_types: [
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall,
    ],
    options: [
      {
        name: 'string',
        type: ApplicationCommandOptionType.String,
        description: 'The string of characters to get information about',
        required: true,
      },
      {
        name: 'ephemeral',
        type: ApplicationCommandOptionType.Boolean,
        description: 'Only show the result to you (default: False)',
      },
    ],
  },
  {
    run: runCharInfo,
  },
)

async function runCharInfo(interaction: ChatInputCommandInteraction) {
  const string = interaction.options.getString('string', true)
  const ephemeral = interaction.options.getBoolean('ephemeral') ?? false

  if (string.length === 0) {
    await interaction.reply({
      content: "You didn't give me any string to get information about!",
      ephemeral,
    })
    return
  }

  const characters: string[] = []

  for (const char of string) {
    characters.push(...characterInfo(char))
  }

  const output = characters.join('\n')

  if (output.length > 1950) {
    await interaction.reply({
      files: [
        {
          name: 'char_info.txt',
          attachment: Buffer.from(output, 'utf-8'),
        },
      ],
      ephemeral,
    })
  } else {
    await interaction.reply({
      content: codeBlock('yaml', output),
      ephemeral,
      allowedMentions: { parse: [] },
    })
  }
}

const intlList = new Intl.ListFormat('en', {
  style: 'short',
  type: 'unit',
})

function characterInfo(char: string): string[] {
  let i = 0
  const info: string[] = []

  while (true) {
    const codePoint = char.codePointAt(i)
    const charCode = char.charCodeAt(i)

    if (codePoint === undefined || Number.isNaN(charCode)) {
      break
    }

    const unicodePoint = `U+${codePoint
      .toString(16)
      .toUpperCase()
      .padStart(4, '0')}`
    const block = uniGetBlock.code(charCode)
    const categories = uniGetCategories.code(charCode)
    const scripts = uniGetScripts.code(charCode)

    const prelude = i === 0 ? `- '${char}':` : '  -'

    const unicodeInfo = `${unicodePoint} (${
      block.displayName
    }; ${displayUnicodeGroup(categories)}; ${displayUnicodeGroup(scripts)})`

    info.push(`${prelude} ${unicodeInfo}`)

    i++
  }

  return info
}

// unfortunately internal, but we can just pull it out like this
type UnicodeCharGroup = ReturnType<(typeof uniGetCategories)['code']>[0]

function displayUnicodeGroup(group: UnicodeCharGroup[]): string {
  return intlList.format(group.map((g) => g.displayName))
}

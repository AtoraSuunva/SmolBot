import { uniGetBlock, uniGetCategories, uniGetScripts } from 'char-info'
import { UnicodeCharGroup } from 'char-info/internal/unicode-lookup.js'
import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
} from 'discord.js'
import { SleetSlashCommand } from 'sleetcord'

export const char_info = new SleetSlashCommand(
  {
    name: 'char_info',
    description: 'Get information about a string of characters',
    options: [
      {
        name: 'string',
        type: ApplicationCommandOptionType.String,
        description: 'The string of characters to get information about',
        required: true,
      },
    ],
  },
  {
    run: runCharInfo,
  },
)

async function runCharInfo(interaction: ChatInputCommandInteraction) {
  const string = interaction.options.getString('string', true)

  if (string.length === 0) {
    await interaction.reply(
      "You didn't give me any string to get information about!",
    )
    return
  }

  const characters: string[] = []

  for (const char of string) {
    characters.push(...characterInfo(char))
  }

  await interaction.reply(characters.join('\n'))
}

const intlList = new Intl.ListFormat('en', {
  style: 'short',
  type: 'unit',
})

function characterInfo(char: string): string[] {
  let i = 0
  const info: string[] = []

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, no-constant-condition
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

    const prelude = i == 0 ? `- ${char}:` : '  -'

    const unicodeInfo = `${unicodePoint} (${
      block.displayName
    }; ${displayUnicodeGroup(categories)}; ${displayUnicodeGroup(scripts)})`

    info.push(`${prelude} ${unicodeInfo}`)

    i++
  }

  return info
}

function displayUnicodeGroup(group: UnicodeCharGroup[]): string {
  return intlList.format(group.map((g) => g.displayName))
}

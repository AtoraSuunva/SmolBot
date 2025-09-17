import { stripVTControlCharacters } from 'node:util'
import {
  UnicodeCategory,
  uniGetBlock,
  uniGetCategories,
  uniGetScripts,
} from 'char-info'
import {
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  type ChatInputCommandInteraction,
  codeBlock,
  InteractionContextType,
  MessageFlags,
} from 'discord.js'
import { SleetSlashCommand } from 'sleetcord'
import stringWidth from 'string-width'
import { unicodeName } from 'unicode-name'
import { ansiFormat, TextColor } from '../helpers/ansiColors.js'

const DOTTED_CIRCLE = '◌'

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
        name: 'details',
        type: ApplicationCommandOptionType.Boolean,
        description:
          'Include block, script, and category info (default: False)',
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
  const details = interaction.options.getBoolean('details') ?? false
  const ephemeral = interaction.options.getBoolean('ephemeral') ?? false

  if (string.length === 0) {
    await interaction.reply({
      content: "You didn't give me any string to get information about!",
      flags: ephemeral ? MessageFlags.Ephemeral : '0',
    })
    return
  }

  const output = characterInformation(string, details)

  if (output.length > 1950) {
    await interaction.reply({
      files: [
        {
          name: 'char_info.txt',
          attachment: Buffer.from(stripVTControlCharacters(output), 'utf-8'),
        },
      ],
      flags: ephemeral ? MessageFlags.Ephemeral : '0',
    })
  } else {
    await interaction.reply({
      content: codeBlock('ansi', output),
      flags: ephemeral ? MessageFlags.Ephemeral : '0',
      allowedMentions: { parse: [] },
    })
  }
}

function characterInformation(str: string, details = false): string {
  const characters: string[] = []
  let longestCodepoint = 4
  let longestWidth = 0

  for (const char of str) {
    longestCodepoint = Math.max(
      longestCodepoint,
      char.codePointAt(0)?.toString(16).length ?? 0,
    )
    longestWidth = Math.max(longestWidth, stringWidth(char))
  }

  for (const char of str) {
    const codePoint = char.codePointAt(0)

    if (codePoint === undefined) {
      continue
    }

    const unicodePoint =
      `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`.padEnd(
        longestCodepoint + 2,
      )
    const name = unicodeName(codePoint)
    const categories = uniGetCategories.code(codePoint)
    const isMark = categories.some((c) => c.name === UnicodeCategory.Mark)

    const basicInfo = `${ansiFormat(TextColor.Pink, unicodePoint)} ${ansiFormat(TextColor.Green, name)}`
    const padLength = longestWidth - stringWidth(char) - (isMark ? 1 : 0)

    const prelude = `│ ${isMark ? DOTTED_CIRCLE : ''}${char}${' '.repeat(padLength)} │`

    let charDetails = ''

    if (details) {
      // TODO: something that can handle Supplementary Multilingual Plane characters
      const block = uniGetBlock.code(codePoint) ?? {
        displayName: 'Astral Plane',
        name: '?',
      }
      const scripts = uniGetScripts.code(codePoint) ?? []

      charDetails = ` (${renderGroup(block)}; ${renderGroupArray(scripts)}; ${renderGroupArray(categories)})`
    }

    characters.push(
      `${ansiFormat(TextColor.Blue, prelude)} ${basicInfo}${charDetails}`,
    )
  }

  return characters.join('\n')
}

// unfortunately internal, but we can just pull it out like this
type UnicodeCharGroup = ReturnType<(typeof uniGetCategories)['code']>[0]

function renderGroupArray(group: UnicodeCharGroup[]): string {
  return group.map(renderGroup).join(', ')
}

function renderGroup(group: UnicodeCharGroup): string {
  if (group.displayName === group.name) {
    return group.displayName
  }

  return `${group.displayName} (${group.name})`
}

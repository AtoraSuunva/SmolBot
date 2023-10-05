import {
  ApplicationCommandOptionType,
  AttachmentPayload,
  ChatInputCommandInteraction,
} from 'discord.js'
import { SleetSlashCommand } from 'sleetcord'
import { DiceRoll } from '@dice-roller/rpg-dice-roller'

export const roll = new SleetSlashCommand(
  {
    name: 'roll',
    description: 'Rolls a die, or multiple dice, using AdX notation',
    options: [
      {
        name: 'dice',
        type: ApplicationCommandOptionType.String,
        description: 'The dice to roll, using AdX notation (ex: 1d6)',
        required: true,
      },
      {
        name: 'statistics',
        type: ApplicationCommandOptionType.Boolean,
        description:
          'Whether to show statistics about the roll, possible min, max, average... (default: false)',
      },
      {
        name: 'ephemeral',
        type: ApplicationCommandOptionType.Boolean,
        description:
          'Whether to show the result of the dice roll to only you (default: false)',
      },
      {
        name: 'help',
        type: ApplicationCommandOptionType.Boolean,
        description:
          "Get some help on how to use dice notation for rolls, and what's supported (default: false)",
      },
    ],
  },
  {
    run: runRoll,
  },
)

async function runRoll(interaction: ChatInputCommandInteraction) {
  const dice = interaction.options.getString('dice') ?? '1d6'
  const statistics = interaction.options.getBoolean('statistics') ?? false
  const ephemeral = interaction.options.getBoolean('ephemeral') ?? false
  const help = interaction.options.getBoolean('help') ?? false

  if (help) {
    return interaction.reply({
      content:
        'See https://dice-roller.github.io/documentation/guide/notation/ for more information on dice notation.',
      ephemeral,
    })
  }

  let roll: DiceRoll | null = null

  try {
    roll = new DiceRoll(dice)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    return interaction.reply({
      content: `There was an error in your dice notation: ${message}`,
      ephemeral: true,
    })
  }

  const result = [roll.toString()]

  if (statistics) {
    result.push(
      `min: ${roll.minTotal}, max: ${roll.maxTotal}, average: ${roll.averageTotal}`,
    )
  }

  let content = result.join('\n')
  const files: AttachmentPayload[] = []

  if (result.length > 2000) {
    files.push({
      name: 'roll.txt',
      attachment: Buffer.from(content),
    })
    content = 'Your roll result was too big! Check the file for the result.'
  }

  return interaction.reply({
    content,
    files,
    ephemeral,
  })
}

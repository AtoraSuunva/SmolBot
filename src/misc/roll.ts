import { DiceRoll } from '@dice-roller/rpg-dice-roller'
import {
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  type ChatInputCommandInteraction,
  InteractionContextType,
} from 'discord.js'
import { SleetSlashCommand, escapeAllMarkdown } from 'sleetcord'

export const roll = new SleetSlashCommand(
  {
    name: 'roll',
    description: 'Rolls a die, or multiple dice, using AdX notation',
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
        name: 'dice',
        type: ApplicationCommandOptionType.String,
        description: 'The dice to roll, using AdX notation (ex: 1d6)',
        required: true,
      },
      {
        name: 'statistics',
        type: ApplicationCommandOptionType.Boolean,
        description:
          'Whether to show statistics about the roll, possible min, max, average... (default: False)',
      },
      {
        name: 'ephemeral',
        type: ApplicationCommandOptionType.Boolean,
        description: 'Only show the result to you (default: False)',
      },
      {
        name: 'help',
        type: ApplicationCommandOptionType.Boolean,
        description:
          "Get some help on how to use dice notation for rolls, and what's supported (default: False)",
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
      allowedMentions: { parse: [] },
    })
  }

  let rollOutput = roll.output
  const split = rollOutput.split(' = ')
  const total = split.pop()

  const result = [`# ${total}`, `-# ${escapeAllMarkdown(split.join(' = '))}`]

  if (statistics) {
    const stats = `min: ${roll.minTotal}, max: ${roll.maxTotal}, average: ${roll.averageTotal}`
    result.push(stats)
    rollOutput += `\n${stats}`
  }

  const content = result.join('\n')

  if (content.length > 2000) {
    return interaction.reply({
      content: 'Your roll result was too big! Check the file for the result.',
      files: [
        {
          name: 'roll.txt',
          attachment: Buffer.from(rollOutput),
        },
      ],
      ephemeral,
    })
  }
  return interaction.reply({
    content,
    ephemeral,
    allowedMentions: { parse: [] },
  })
}

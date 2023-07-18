import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
} from 'discord.js'
import { SleetSlashCommand } from 'sleetcord'
import pluralize from 'pluralize'

export const choose = new SleetSlashCommand(
  {
    name: 'choose',
    description: 'Chooses between multiple options',
    options: [
      {
        name: 'options',
        type: ApplicationCommandOptionType.String,
        description:
          'The options to choose from, use commas (,) to separate them',
        required: true,
      },
      {
        name: 'pick-count',
        type: ApplicationCommandOptionType.Integer,
        description: 'The number of options to pick (default: 1)',
      },
    ],
  },
  {
    run: runChoose,
  },
)

const MAX_OPTIONS = 50

const intlList = new Intl.ListFormat('en', {
  style: 'long',
  type: 'conjunction',
})

async function runChoose(interaction: ChatInputCommandInteraction) {
  const inputOptions = interaction.options.getString('options', true)
  const pickCount = interaction.options.getInteger('pick-count') ?? 1

  if (inputOptions.length === 0) {
    await interaction.reply("You didn't give me any options to choose from!")
    return
  }

  if (pickCount <= 0) {
    await interaction.reply("I can't pick less than 1 option!")
    return
  }

  const options = inputOptions
    .split(',')
    .map((option) => option.trim())
    .filter((option) => option.length > 0)

  if (options.length === 1) {
    await interaction.reply(
      `There's only 1 option, so **${options[0]}**!\nUse commas (,) to separate multiple options if you didn't mean to only put 1 option, like this "otter, ferret, weasel".`,
    )
    return
  }

  if (options.length > MAX_OPTIONS) {
    await interaction.reply(
      `You can't give me more than ${MAX_OPTIONS} options! You gave ${pluralize(
        'option',
        options.length,
        true,
      )}.`,
    )
    return
  }

  if (pickCount > options.length) {
    await interaction.reply(
      `You can't pick ${pluralize('option', pickCount, true)} from ${pluralize(
        'option',
        options.length,
        true,
      )}!`,
    )
    return
  }

  const pickedOptions: string[] = []
  const pickedIndexes = new Set<number>()

  while (
    pickedOptions.length < pickCount &&
    pickedOptions.length < options.length
  ) {
    const i = Math.floor(Math.random() * options.length)
    if (pickedIndexes.has(i)) continue
    pickedIndexes.add(i)
    const choice = options[i]
    pickedOptions.push(choice)
  }

  await interaction.reply(`I choose **${intlList.format(pickedOptions)}**!`)
}

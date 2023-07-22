import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
} from 'discord.js'
import { SleetSlashCommand } from 'sleetcord'
import { plural } from '../util/format.js'

export const flip = new SleetSlashCommand(
  {
    name: 'flip',
    description: 'Flips a coin, or multiple coins',
    options: [
      {
        name: 'count',
        type: ApplicationCommandOptionType.Integer,
        description: 'The number of coins to flip (default: 1)',
      },
    ],
  },
  {
    run: runFlip,
  },
)

const MAX_COINS = 50
const HEAD = '🅗'
const TAIL = 'Ⓣ'

async function runFlip(interaction: ChatInputCommandInteraction) {
  const count = interaction.options.getInteger('count') ?? 1

  if (count <= 0) {
    await interaction.reply("I can't flip less than 1 coin!")
    return
  }

  if (count > MAX_COINS) {
    await interaction.reply(
      `I can't flip more than ${MAX_COINS} coins at once!`,
    )
    return
  }

  const results = []
  let headCount = 0
  let tailCount = 0

  for (let i = 0; i < count; i++) {
    const result = Math.random() < 0.5 ? HEAD : TAIL

    if (result === HEAD) {
      headCount++
    } else {
      tailCount++
    }

    results.push(result)
  }

  if (count === 1) {
    const coin = results[0]
    const result = coin === HEAD ? 'head' : 'tail'
    await interaction.reply(`I flipped a coin and got ${result} ${coin}!`)
  } else {
    await interaction.reply(
      `I flipped ${plural('coin', count)} and got ${plural(
        'head',
        headCount,
      )} and ${plural('tail', tailCount)}!\n${results.join(', ')}`,
    )
  }
}

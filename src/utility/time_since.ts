import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
  time,
} from 'discord.js'
import { SleetSlashCommand } from 'sleetcord'
import prettyMilliseconds from 'pretty-ms'

export const time_since = new SleetSlashCommand(
  {
    name: 'time_since',
    description: 'Get the time since a given date',
    options: [
      {
        name: 'date',
        description: 'The date to get the time since',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: 'ephemeral',
        description:
          'Whether to send the response as an ephemeral message (default: True)',
        type: ApplicationCommandOptionType.Boolean,
      },
    ],
  },
  {
    run: runTimeSince,
  },
)

function runTimeSince(interaction: ChatInputCommandInteraction) {
  const date = interaction.options.getString('date', true)
  const ephemeral = interaction.options.getBoolean('ephemeral') ?? true

  const parsedDate = Date.parse(date)

  if (Number.isNaN(parsedDate)) {
    interaction.reply({
      content: 'Could not parse date, try `yyyy-mm-dd`.',
      ephemeral: true,
    })
    return
  }

  const dateSeconds = parsedDate / 1_000
  const durationMs = Date.now() - parsedDate
  const duration = prettyMilliseconds(durationMs, { verbose: true })

  return interaction.reply({
    content: `The time since ${time(dateSeconds, 'F')} (${time(
      dateSeconds,
      'R',
    )}) is ${duration}`,
    ephemeral,
  })
}

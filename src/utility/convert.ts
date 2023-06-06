import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
} from 'discord.js'
import { AutocompleteHandler, SleetSlashCommand } from 'sleetcord'
import { default as converter } from 'convert-units'

const units = converter().list()

type Unit = ReturnType<converter.Convert['list']>[number]

function autocompleteForUnits(
  value: string,
  validUnits: Unit[],
): ReturnType<AutocompleteHandler<string>> {
  const lVal = value.toLowerCase()

  return validUnits
    .filter(
      (unit) =>
        unit.abbr.toLowerCase().includes(lVal) ||
        unit.singular.toLowerCase().includes(lVal) ||
        unit.plural.toLowerCase().includes(lVal),
    )
    .map((unit) => ({
      name: `${unit.singular} (${unit.abbr})`,
      value: unit.abbr,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 25)
}

const autocompleteFrom: AutocompleteHandler<string> = ({ value }) => {
  return autocompleteForUnits(value, units)
}

const autocompleteTo: AutocompleteHandler<string> = ({
  interaction,
  value,
}) => {
  const from = interaction.options.getString('from', true)
  const fromUnit = units.find((unit) => unit.abbr === from)

  if (!fromUnit) {
    return []
  }

  const possibilities = converter()
    .from(fromUnit.abbr)
    .possibilities()
    .filter((unit) => unit !== fromUnit.abbr)

  return autocompleteForUnits(
    value,
    units.filter((unit) => possibilities.includes(unit.abbr)),
  )
}

export const convert = new SleetSlashCommand(
  {
    name: 'convert',
    description: 'Converts a value from one unit to another',
    options: [
      {
        name: 'value',
        description: 'The value to convert',
        type: ApplicationCommandOptionType.Number,
        required: true,
      },
      {
        name: 'from',
        description: 'The unit to convert from',
        type: ApplicationCommandOptionType.String,
        required: true,
        autocomplete: autocompleteFrom,
      },
      {
        name: 'to',
        description: 'The unit to convert to (default: Best guess)',
        type: ApplicationCommandOptionType.String,
        required: false,
        autocomplete: autocompleteTo,
      },
      {
        name: 'ephemeral',
        description:
          'Whether to send the result as an ephemeral message (default: True)',
        type: ApplicationCommandOptionType.Boolean,
        required: false,
      },
    ],
  },
  {
    run: runConvert,
  },
)

async function runConvert(interaction: ChatInputCommandInteraction) {
  const value = interaction.options.getNumber('value', true)
  const from = interaction.options.getString('from', true)
  const to = interaction.options.getString('to', false)
  const ephemeral = interaction.options.getBoolean('ephemeral', false) ?? true

  const fromUnit = units.find((unit) => unit.abbr === from)?.abbr

  if (!fromUnit) {
    await interaction.reply(`Invalid \`from\` unit "${from}"`)
    return
  }

  const possibleUnits = converter().from(fromUnit).possibilities()
  const toUnit = possibleUnits.find((unit) => unit === to)

  if (to && !toUnit) {
    await interaction.reply(
      `Invalid \`to\` unit "${to}"\nPossible units: ${possibleUnits.join(
        ', ',
      )}`,
    )
    return
  }

  const { val, unit } =
    to && toUnit
      ? { val: converter(value).from(fromUnit).to(toUnit), unit: toUnit }
      : converter(value).from(fromUnit).toBest()

  await interaction.reply({
    content: `${value.toLocaleString()}${fromUnit} = ${val.toLocaleString()}${unit}`,
    ephemeral,
  })
}

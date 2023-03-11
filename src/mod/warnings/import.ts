import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
  codeBlock,
} from 'discord.js'
import { getGuild, SleetSlashCommand } from 'sleetcord'
import { parse } from 'csv-parse'
import { Readable } from 'stream'
import { fetch } from 'undici'
import { Prisma, Warning } from '@prisma/client'
import { s, Result, ObjectValidator } from '@sapphire/shapeshift'
import { prisma } from '../../util/db.js'

// Seperate command since this is potentially abusive, someone could import a LOT of garbage data or falsify new warnings with other mods as responsible
export const warningsImport = new SleetSlashCommand(
  {
    name: 'import-warnings',
    description:
      'Import warnings from a CSV file. Can only create NEW warnings',
    default_member_permissions: ['ManageGuild'],
    options: [
      {
        name: 'file',
        description: 'The CSV file to import',
        type: ApplicationCommandOptionType.Attachment,
        required: true,
      },
    ],
  },
  {
    run: warningsImportRun,
  },
)

async function warningsImportRun(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)
  const file = interaction.options.getAttachment('file', true)

  if (file.contentType?.split(';')[0]?.trim() !== 'text/csv') {
    interaction.reply('Expected a .csv file')
    return
  }

  const response = await fetch(file.url)

  if (!response.body || !response.ok) {
    interaction.reply('Failed to fetch file')
    return
  }

  const parser = parse({
    columns: true,
    trim: true,
    cast: (value, context): Warning[keyof Warning] => {
      if (context.header) return value

      switch (context.column as keyof Warning) {
        case 'guildID':
          return guild.id // No matter the input guild, it's ALWAYS the guild the interaction was called from

        case 'moderatorID':
        case 'modNote':
        case 'validUntil':
          // Map these as nullable here, then we use the validator to do more advanced checking later
          return value === '' ? null : value

        default:
          return value
      }
    },
  })

  const parseStream = Readable.fromWeb(response.body).pipe(parser)

  const rows: Prisma.WarningCreateInput[] = []
  let created = 0

  for await (const record of parseStream) {
    const validated = warningCreateValidator.run(record)

    if (validated.isErr()) {
      console.error(validated.error)
      interaction.reply(
        `You have an invalid row in your csv:\n${codeBlock(
          'js',
          validated.error.message,
        )}\nat:\n${codeBlock('js', JSON.stringify(record, null, 2))}`,
      )
      return
    } else if (validated.isOk()) {
      rows.push(validated.value)

      if (validated.value.guildID !== guild.id) {
        // This *SHOULDN'T* happen, but just in case because this would be REALLY bad
        interaction.reply(
          `You have an invalid row in your csv:\n${codeBlock(
            'js',
            'guildID must be the same as the guild the command was called in',
          )}\nat:\n${codeBlock('js', JSON.stringify(record, null, 2))}`,
        )
        return
      }

      // TODO: this sucks use createMany instead when I use postgres (aka I can be bothered to set it up in docker)
      try {
        await prisma.warning.create({
          data: validated.value,
        })
        created++
      } catch (e) {
        // assume it's just a conflict lol (please just be a conflict)
      }
    }
  }

  // TODO: when I finally migrate to postgres, use `await prisma.warning.createMany`

  interaction.reply(`Imported warnings (${created} added)`)
}

const warningCreateValidator: ObjectValidator<Prisma.WarningCreateInput> =
  s.object({
    guildID: s.string.regex(/^\d{1,20}$/), // Probably more than long enough for a snowflake
    warningID: s.string.reshape(reshapeToNumber),
    version: s.string.reshape(reshapeToNumber),
    user: s.string.lengthLessThan(37), // 2-32 username + #discrim (5)
    userID: s.string.regex(/^\d{1,20}$/),
    reason: s.string.lengthLessThan(256),
    permanent: s.string.reshape(reshapeToBoolean),
    void: s.string.reshape(reshapeToBoolean),
    moderatorID: s.string.regex(/^\d{1,20}$/).nullable,
    modNote: s.string.lengthLessThan(256).nullable,
    createdAt: s.string.reshape(reshapeToDate),
    validUntil: s.string.reshape(reshapeToDate).nullable,
  })

function reshapeToNumber(value: string): Result<number, Error> {
  const parsed = parseInt(value, 10)

  if (Number.isNaN(parsed)) {
    return Result.err(new Error(`Invalid number: ${value}`))
  }

  return Result.ok(parsed)
}

function reshapeToBoolean(value: string): Result<boolean, Error> {
  switch (value.toLowerCase()) {
    case 'true':
      return Result.ok(true)
    case 'false':
      return Result.ok(false)
    default:
      return Result.err(new Error(`Invalid boolean: ${value}`))
  }
}

function reshapeToDate(value: string): Result<Date, Error> {
  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return Result.err(new Error(`Invalid date: ${value}`))
  }

  return Result.ok(parsed)
}

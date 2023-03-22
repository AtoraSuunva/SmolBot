import { parse } from 'csv-parse'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Prisma } from '@prisma/client'
import { stringify } from 'csv-stringify'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcFile = path.join(__dirname, '../csv/from.csv')
const destFile = path.join(__dirname, '../csv/to.csv')

const parser = parse({
  from: 2, // skip header
  skip_records_with_empty_values: true,
  on_record: (record: string[], { records }) => {
    /*
  [
    'Cashspticeye',        0 -> User
    '266729524366934017',  1 -> UserID
    '',                    2 -> Warning Count
    "Continuing to ask ",  3 -> Reason
    '2017-05-14',          4 -> Date
    ''                     5 -> Mod note
  ]
  */
    const [user, userID, , reason, date, modNote] = record

    const modNoteLower = modNote.toLowerCase()

    const newRecord: Prisma.WarningCreateInput = {
      guildID: '120330239996854274',
      warningID: records,
      version: 1,
      user,
      userID,
      reason,
      permanent: ['perma', 'permanent', '∞'].some((v) =>
        modNoteLower.includes(v),
      ),
      void: ['void', '∅'].some((v) => modNoteLower.includes(v)),
      moderatorID: null,
      modNote: modNote ? modNote : null,
      createdAt: new Date(date),
      validUntil: null,
    }

    if (Number.isNaN(new Date(date).getTime())) {
      throw new Error(`Invalid date: ${date}`)
    }

    return newRecord
  },
})

const formatter = stringify({
  header: true,
  cast: {
    boolean: (value) => (value ? 'true' : 'false'),
    date: (value) => value.toISOString(),
  },
  escape_formulas: true,
})

fs.createReadStream(srcFile)
  .pipe(parser)
  .pipe(formatter)
  .pipe(fs.createWriteStream(destFile))

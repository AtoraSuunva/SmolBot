import path from 'node:path'

import type { PrismaConfig } from 'prisma'
import 'dotenv/config'

export default {
  datasource: {
    url: process.env.DATABASE_URL,
  },
  schema: path.join('prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
} satisfies PrismaConfig

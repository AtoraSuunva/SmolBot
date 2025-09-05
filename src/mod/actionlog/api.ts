import { type InferType, Result, s } from '@sapphire/shapeshift'
import { Hono } from 'hono'
import type { Prisma } from '../../generated/prisma/client.js'
import { authMiddleware } from '../../helpers/api/auth.js'
import { shapeShiftValidator } from '../../helpers/api/hono.js'
import { Permission } from '../../helpers/api/token.js'
import { prisma } from '../../helpers/db.js'

const app = new Hono()

function parseBoolean(value: string | undefined | null): Result<boolean> {
  if (value === 'true') return Result.ok(true)
  if (value === 'false') return Result.ok(false)
  return Result.err(new Error('Invalid boolean string'))
}

function parseInteger(
  value: string | undefined | null,
  min?: number | undefined,
  max?: number | undefined,
): Result<number> {
  if (value === null || value === undefined)
    return Result.err(new Error('Invalid integer string'))
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed))
    return Result.err(new Error('Invalid integer string'))

  if (min !== undefined && parsed < min) {
    return Result.err(new Error(`Integer must be at least ${min}`))
  }

  if (max !== undefined && parsed > max) {
    return Result.err(new Error(`Integer must be at most ${max}`))
  }

  return Result.ok(parsed)
}

const paramSchema = s.object({
  guildId: s.string().regex(/^\d{17,19}$/),
  userId: s.string().regex(/^\d{17,19}$/),
})

const querySchema = s.object({
  action: s
    .enum(['ban', 'unban', 'kick', 'timeout', 'timeout removed'])
    .optional(),
  allVersions: s.string().optional().reshape(parseBoolean),
  limit: s
    .string()
    .optional()
    .default('100')
    .reshape((v) => parseInteger(v, 1, 100)),
  before: s
    .string()
    .optional()
    .default('0')
    .reshape((v) => parseInteger(v, 0)),
  after: s
    .string()
    .optional()
    .default('0')
    .reshape((v) => parseInteger(v, 0)),
})

async function findActionLogs(
  guildId: string,
  userId: string | undefined,
  options: InferType<typeof querySchema>,
) {
  const { action, allVersions, before, after, limit } = options

  // Build base where clause
  const where: Prisma.ActionLogWhereInput = {
    guildID: guildId,
  }

  if (userId) where.userID = userId
  if (action) where.action = action
  if (!allVersions) where.validUntil = null
  if (before) where.actionID = { lt: before }
  if (after) where.actionID = { gt: after }

  // Fetch entries
  const entries = await prisma.actionLog.findMany({
    where,
    orderBy: [{ actionID: 'desc' }, { version: 'desc' }],
    take: limit,
  })

  return entries
}

app.get(
  '/:guildId',
  authMiddleware({ requirePermissions: Permission.ReadActionLog }),
  shapeShiftValidator('param', paramSchema),
  shapeShiftValidator('query', querySchema),
  async (c) => {
    const { guildId } = c.req.valid('param')
    const token = c.get('token')

    if (guildId !== token.guildID) {
      return c.json(
        {
          error: 'Auth token is not allowed to access this guild',
        },
        403,
      )
    }

    const entries = await findActionLogs(
      guildId,
      undefined,
      c.req.valid('query'),
    )

    return c.json(entries)
  },
)

app.get(
  '/:guildId/:userId',
  authMiddleware({ requirePermissions: Permission.ReadActionLog }),
  shapeShiftValidator('param', paramSchema),
  shapeShiftValidator('query', querySchema),
  async (c) => {
    const { guildId, userId } = c.req.valid('param')
    const token = c.get('token')

    if (guildId !== token.guildID) {
      return c.json(
        {
          error: 'Auth token is not allowed to access this guild',
        },
        403,
      )
    }

    const entries = await findActionLogs(guildId, userId, c.req.valid('query'))

    return c.json(entries)
  },
)

export default app

import { Result, s } from '@sapphire/shapeshift'
import { Hono } from 'hono'
import type { Prisma } from '../../generated/prisma/client.js'
import { jwtMiddleware } from '../../helpers/api/auth.js'
import { shapeShiftValidator } from '../../helpers/api/hono.js'
import { Permission } from '../../helpers/api/token.js'
import { prisma } from '../../helpers/db.js'

const app = new Hono()

function parseBoolean(value: string | undefined | null): Result<boolean> {
  if (value === 'true') return Result.ok(true)
  if (value === 'false') return Result.ok(false)
  return Result.err(new Error('Invalid boolean string'))
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
})

app.get(
  '/:guildId/:userId',
  jwtMiddleware({ requirePermissions: Permission.ReadActionLog }),
  shapeShiftValidator('param', paramSchema),
  shapeShiftValidator('query', querySchema),
  async (c) => {
    const { guildId, userId } = c.req.valid('param')
    const { action, allVersions } = c.req.valid('query')
    const token = c.get('token')

    if (guildId !== token.gid) {
      return c.json(
        {
          error: 'Auth token guild ID does not match the request guild ID',
        },
        403,
      )
    }

    // Build base where clause
    const where: Prisma.ActionLogWhereInput = {
      guildID: guildId,
      userID: userId,
    }

    if (action) where.action = action
    if (!allVersions) where.validUntil = null

    // Fetch entries
    const entries = await prisma.actionLog.findMany({
      where,
      orderBy: [{ actionID: 'desc' }, { version: 'desc' }],
    })

    return c.json(entries)
  },
)

export default app

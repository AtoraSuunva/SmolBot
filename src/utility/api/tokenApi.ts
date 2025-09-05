import { s } from '@sapphire/shapeshift'
import { Hono } from 'hono'
import {
  authMiddleware,
  createToken,
  deleteToken,
} from '../../helpers/api/auth.js'
import { shapeShiftValidator } from '../../helpers/api/hono.js'
import { Permission } from '../../helpers/api/token.js'

const app = new Hono()

app.get('/info', authMiddleware(), async (c) => {
  const token = c.get('token')

  return c.json({
    name: token.name,
    tokenID: token.tokenID,
    parentTokenID: token.parentTokenID,
    userID: token.userID,
    guildID: token.guildID,
    permissions: token.permissions,
    createdAt: token.createdAt,
    expiresAt: token.expiresAt,
  })
})

const createTokenJson = s.object({
  name: s.string().lengthLessThanOrEqual(25),
  permissions: s.number().optional(),
  expiresAt: s.date().optional().nullable(),
})

app.post(
  '/create',
  authMiddleware({ requirePermissions: Permission.CreateToken }),
  shapeShiftValidator('json', createTokenJson),
  async (c) => {
    const { name, permissions = 0, expiresAt = null } = c.req.valid('json')
    const token = c.get('token')

    if ((token.permissions | permissions) !== permissions) {
      return c.json(
        {
          error:
            'New auth token permissions must be a subset of the parent token permissions',
          parentPermissions: token.permissions,
          newPermissions: permissions,
        },
        403,
      )
    }

    // Create token
    const newToken = await createToken({
      name,
      parentTokenID: token.tokenID,
      userID: token.userID,
      guildID: token.guildID,
      permissions,
      expiresAt,
    })

    return c.json(newToken)
  },
)

app.delete('/delete', authMiddleware(), async (c) => {
  const token = c.get('token')

  // Delete token
  const count = await deleteToken(token.tokenID)

  return c.json({ count })
})

export default app

import { hash, randomBytes } from 'node:crypto'
import { promisify } from 'node:util'

import { createMiddleware } from 'hono/factory'
import { baseLogger } from 'sleetcord-common'

import type { Prisma } from '../../generated/prisma/client.js'
import { prisma } from '../db.js'
import { permissionBitfieldToStrings } from './token.js'

const authLogger = baseLogger.child({ module: 'auth' })

const asyncRandomBytes = promisify(randomBytes)

/**
 * Hash a token using SHA256. This is fine without a salt since salts are intended to prevent
 * rainbow table attacks/user password collisions but since we control the token generation we can
 * guarantee that there's enough entropy in the token itself.
 *
 * We store the hashed tokens in the database to avoid anyone getting database access
 * (or getting the bot to leak the DB) from actually being able to use tokens they find.
 *
 * Someone *could* generate all `2^(32*8)` possible combinations of our 32 random bytes
 * (~115 quattuorvigintillion) and then hash them and use the resulting table to look up our hashes
 * at 1 trillion hashes per second. It would however take ~13.8 gigayears, a time which WolframAlpha
 * can only compare to the age of the universe. I will be very dead by the time this becomes a
 * problem and if this project is still running godspeed to whoever's still maintaining it.
 *
 * @param token The token to hash
 * @returns The hashed token
 */
export function hashToken(token: string) {
  return hash('SHA256', token, 'base64')
}

export interface CreateTokenParams {
  /** The name of the token */
  name: string
  /** The ID of the parent token, if any. Linked tokens can be used to delete children if the parent is deleted */
  parentTokenID?: number | null
  /** The ID of the user this token is associated with */
  userID: string
  /** The ID of the guild this token is associated with */
  guildID?: string | null
  /** The permissions associated with this token */
  permissions?: number
  /** The expiration date of the token, if any */
  expiresAt?: Date | null
}

export interface CreateTokenResult {
  token: string
  tokenInfo: Prisma.TokenGetPayload<{
    omit: { hash: true }
  }>
}

/**
 * Create a new token.
 * @param params The parameters for creating the token
 * @returns The created token and its database representation
 */
export async function createToken({
  name,
  parentTokenID = null,
  userID,
  guildID = null,
  permissions = 0,
  expiresAt = null,
}: CreateTokenParams): Promise<CreateTokenResult> {
  const token = (await asyncRandomBytes(32)).toString('base64')
  const tokenHash = hashToken(token)

  const dbToken = await prisma.token.create({
    data: {
      name,
      parentTokenID,
      hash: tokenHash,
      userID,
      guildID,
      permissions,
      expiresAt,
    },
    omit: { hash: true },
  })

  return {
    token,
    tokenInfo: dbToken,
  }
}

/**
 * Deletes a token by its ID and ALL of its child tokens. This cannot be undone.
 * @param tokenID The ID of the token to delete
 * @returns The amount of tokens deleted
 */
export async function deleteToken(tokenID: number): Promise<number> {
  const { count } = await prisma.token.deleteMany({
    where: {
      tokenID,
    },
  })

  return count
}

export type VerifyTokenResult = Prisma.TokenGetPayload<true>

/**
 * Verifies a token by hashing it and looking it up in the database. Rejects if the token is not found
 * or has been deleted.
 *
 * @param token The token to verify
 * @returns The token info from the database
 */
export const verifyToken = async (token: string): Promise<VerifyTokenResult> => {
  const hash = hashToken(token)

  const dbToken = await prisma.token.findUnique({
    where: {
      hash,
    },
  })

  if (!dbToken) {
    throw new Error('Token not found in database')
  }

  return dbToken
}

export type AuthMiddlewareParams<RequireAuth extends boolean = false> = {
  requireAuth?: RequireAuth
  requirePermissions?: number
}

/**
 * Middleware for handling authentication and authorization.
 *
 * Auth can be made optional if you don't require tokens but still want to extract token info when
 * it's available. Authorization can be added by requiring permissions. Note that this will not handle
 * checking guild ID or user ID.
 * @param authParams The parameters for the middleware.
 * @returns The middleware function.
 */
export function authMiddleware<RequireAuth extends boolean = true>({
  requireAuth = true as RequireAuth,
  requirePermissions = 0,
}: AuthMiddlewareParams<RequireAuth> = {}) {
  return createMiddleware<{
    Variables: {
      token: RequireAuth extends true ? VerifyTokenResult : VerifyTokenResult | undefined
    }
  }>(async (c, next) => {
    let token: VerifyTokenResult | undefined = c.get('token')

    if (c.get('token')) {
      token = c.get('token')
    } else {
      const authHeader = c.req.header('Authorization')

      if (requireAuth && !authHeader) {
        return c.json(
          {
            error: 'Missing Authorization Header',
          },
          401,
        )
      }

      if (authHeader) {
        if (!authHeader.startsWith('Bearer')) {
          return c.json(
            {
              error: 'Authorization Header missing Bearer prefix',
            },
            401,
          )
        }

        const headerToken = authHeader.replace('Bearer ', '')

        try {
          token = await verifyToken(headerToken)
        } catch (err) {
          authLogger.error(err)

          return c.json(
            {
              error: 'Invalid token',
            },
            401,
          )
        }
      }

      c.set('token', token as unknown as RequireAuth extends true ? VerifyTokenResult : undefined)
    }

    if (requirePermissions) {
      if (!token) {
        return c.json(
          {
            error: 'Route requires permissions but no token was provided',
          },
          401,
        )
      }

      if (!(token.permissions & requirePermissions)) {
        const strings = permissionBitfieldToStrings(requirePermissions)

        return c.json(
          {
            error: 'Missing permissions',
            missing: strings,
          },
          403,
        )
      }
    }

    return await next()
  })
}

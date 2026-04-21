import {
  type BaseError,
  CombinedError,
  CombinedPropertyError,
  ExpectedValidationError,
  type InferType,
  type MissingPropertyError,
  type ObjectValidator,
  ValidationError,
} from '@sapphire/shapeshift'
import { routePath } from 'hono/route'
import type { ValidationTargets } from 'hono/types'
import type { JSONValue } from 'hono/utils/types'
import { validator } from 'hono/validator'

/**
 * Creates a Hono validator using `@sapphire/shapeshift`. Properly handles types! Validated data is available in `Context.req.valid(Type)`.
 *
 * Thanks to [this article](https://dev.to/fiberplane/hacking-hono-the-ins-and-outs-of-validation-middleware-2jea) for helping me lock in and figure out the typing for this.
 *
 * @example
 * ```ts
 * const paramSchema = s.object({
 *   guildId: s.string().regex(/^\d{17,19}$/),
 *   userId: s.string().regex(/^\d{17,19}$/),
 * })
 *
 * app.get(
 *  '/action-log/:guildId/:userId',
 *  shapeShiftValidator('param', paramSchema),
 *  async (c) => {
 *   const { guildId, userId } = c.req.valid('param')
 * })
 * ```
 * @param target The target to validate (e.g. 'param', 'query', 'body').
 * @param schema The schema to validate against.
 * @returns A Hono validator.
 */
export function shapeShiftValidator<Schema extends ObjectValidator<T>, T extends object>(
  target: keyof ValidationTargets,
  schema: Schema,
) {
  return validator(target, (value, c): InferType<Schema> | Response => {
    const result = schema.run(value)

    if (result.isErr()) {
      return c.json(
        {
          error: 'Part of your request is invalid',
          route: routePath(c),
          target,
          details: formatError(result.error),
        },
        400,
      )
    }

    // InferType<Schema> *should* be pulling the exact same type as `result.unwrap()` (UndefinedToOptional<T>) but somehow Typescript complains
    return result.unwrap() as InferType<Schema>
  })
}

function formatError(
  err:
    | BaseError
    | CombinedPropertyError
    | MissingPropertyError
    | CombinedError
    | ExpectedValidationError<unknown>,
): JSONValue {
  if (err instanceof CombinedPropertyError) {
    return Object.fromEntries(err.errors.map(([key, error]) => [String(key), formatError(error)]))
  }

  if (err instanceof CombinedError) {
    const combined: (Record<string, unknown> | string)[] = []
    let latest: Record<string, unknown> | string | null = null

    for (const error of err.errors) {
      const formatted = formatError(error) as Record<string, unknown> | string

      if (!latest) {
        latest = formatted
        continue
      }

      if (typeof latest !== typeof combined) {
        combined.push(latest)
        latest = formatted
        continue
      }

      if (typeof latest === 'string' || typeof formatted === 'string') {
        // Both are strings
        // We use || in the condition for typescript to be happy with the else below,
        // we already checked above that typeof latest === typeof combined by now
        if (latest !== formatted) {
          combined.push(latest)
          latest = formatted
        }
      } else {
        // Both are objects
        if (latest.message === formatted.message) {
          for (const [k, v] of Object.entries(formatted)) {
            if (latest[k] !== v) {
              latest[k] = Array.isArray(latest[k]) ? [...latest[k], v] : [latest[k], v]
            }
          }
        } else {
          combined.push(latest)
          latest = formatted
        }
      }
    }

    if (latest) {
      combined.push(latest)
    }

    return combined.length === 1 ? (combined[0] as JSONValue) : (combined as JSONValue)
  }

  if (err instanceof ValidationError) {
    return {
      message: err.message,
      given: String(err.given),
    }
  }

  if (err instanceof ExpectedValidationError) {
    return {
      message: err.message,
      expected: err.expected === undefined ? null : String(err.expected),
      given: String(err.given),
    }
  }

  if (err instanceof Error) {
    return err.message
  }

  return String(err)
}

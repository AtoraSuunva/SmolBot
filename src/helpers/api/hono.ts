import type { InferType, ObjectValidator } from '@sapphire/shapeshift'
import type { ValidationTargets } from 'hono/types'
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
export function shapeShiftValidator<
  Target extends keyof ValidationTargets,
  Schema extends ObjectValidator<T>,
  T extends object,
>(target: Target, schema: Schema) {
  return validator(target, (value, c): InferType<Schema> | Response => {
    const result = schema.run(value)

    if (result.isErr()) {
      return c.json({ error: result.error.message }, 400)
    }

    // InferType<Schema> *should* be pulling the exact same type as `result.unwrap()` (UndefinedToOptional<T>) but somehow Typescript complains
    return result.unwrap() as InferType<Schema>
  })
}

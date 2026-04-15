import { type BaseValidator, type MappedObjectValidator, s } from '@sapphire/shapeshift'
import { ApplicationCommandOptionType, Awaitable, ChatInputCommandInteraction } from 'discord.js'
import {
  ListenerResult,
  SlashEventHandlers,
  SleetContext,
  SleetModuleOptions,
  SleetSlashSubcommand,
  type SleetSlashSubcommandBody,
} from 'sleetcord'

type PrimitiveFromOptionType<T extends ApplicationCommandOptionType> =
  T extends ApplicationCommandOptionType.String
    ? string
    : T extends ApplicationCommandOptionType.Integer
      ? number
      : T extends ApplicationCommandOptionType.Boolean
        ? boolean
        : T extends ApplicationCommandOptionType.User
          ? string
          : T extends ApplicationCommandOptionType.Channel
            ? string
            : T extends ApplicationCommandOptionType.Role
              ? string
              : T extends ApplicationCommandOptionType.Mentionable
                ? string
                : never

type Callback<Item> = Item extends { name: infer Name; type: infer Type }
  ? Name extends PropertyKey
    ? Type extends ApplicationCommandOptionType
      ? Record<Name, PrimitiveFromOptionType<Type>>
      : never
    : never
  : never

type Reducer<T extends unknown[], Acc = object> = T extends []
  ? Acc
  : T extends [infer Head, ...infer Tail]
    ? Reducer<Tail, Acc & Callback<Head>>
    : never

function createParameterPackerFrom(options: SleetSlashSubcommandBody['options']) {
  if (options === undefined) {
    return s.any()
  }

  return s.object(
    options.reduce<MappedObjectValidator<unknown>>((acc, option) => {
      return Object.assign(acc, {
        [option.name]: validatorFromType(option.type),
      })
    }, {}),
  )
}

function validatorFromType(
  type: ApplicationCommandOptionType,
): BaseValidator<PrimitiveFromOptionType<ApplicationCommandOptionType>> {
  switch (type) {
    case ApplicationCommandOptionType.String:
      return s.string()

    case ApplicationCommandOptionType.Number:
    case ApplicationCommandOptionType.Integer:
      return s.number()

    case ApplicationCommandOptionType.Boolean:
      return s.boolean()

    case ApplicationCommandOptionType.User:
    case ApplicationCommandOptionType.Channel:
    case ApplicationCommandOptionType.Role:
    case ApplicationCommandOptionType.Mentionable:
      return s.string()

    default:
      throw new Error(`Invalid option type for automod: ${type}`)
  }
}

interface AutomodAction {
  type: string
  action: string
  target: string
}

type RunResult<T extends unknown[] | undefined> = Awaitable<
  [T] extends [undefined] ? undefined : Reducer<NonNullable<T>>
>

type AutomodEventHandlers<T extends SleetSlashSubcommandBody['options'] = []> = Omit<
  {
    [Event in keyof SlashEventHandlers]: (
      this: SleetContext,
      ...args: Parameters<NonNullable<SlashEventHandlers[Event]>>
    ) => ListenerResult<AutomodAction[] | null | undefined | void>
  },
  'autocomplete' | 'run'
> & {
  run: (
    this: SleetContext,
    interaction: ChatInputCommandInteraction,
    ...args: unknown[]
  ) => Awaitable<RunResult<T>>
  autocomplete?: SlashEventHandlers['autocomplete']
}

/**
 * Base class for an automod rule. Automod roughly mimics what Sleet does for SleetModules, except they're restricted to being subcommand since we mount them under "/automod add <rule>" and "/automod edit <rule>"
 *
 * Some rules:
 * - The body name should be unique across all rules, as it's used to identify the type of the rule in the database
 * - The body options will be shown to users when they add/edit the rule, and used to unpack parameters from the database
 * - The `run` event handler will execute on add/edit and should validate the parameters, and either return an object (to be stored in the database) or throw an error if the parameters are invalid.
 * - The automod system handles rule execution on any non-run events (checking if the guild has any rules for that event) and unpacking parameters before execution
 * - The rule should return an array of Action[] of actions to take on targets, or return null/undefined if the rule should not be triggered
 * - State shouldn't be stored in the rule instance itself, since only 1 instance is created per rule type. Any state should be stored elsewhere.
 */
export class AutomodRule<Body extends SleetSlashSubcommandBody> extends SleetSlashSubcommand {
  public parameterUnpacker: ReturnType<typeof createParameterPackerFrom>

  constructor(
    body: Body,
    handlers: AutomodEventHandlers<Body['options']>,
    options: SleetModuleOptions = {},
  ) {
    super(body, handlers, options)

    this.parameterUnpacker = createParameterPackerFrom(this.body.options)
  }
}

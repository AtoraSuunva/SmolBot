import { type BaseValidator, type MappedObjectValidator, s } from '@sapphire/shapeshift'
import {
  ApplicationCommandOptionType,
  Awaitable,
  ChatInputCommandInteraction,
  SendableChannels,
  User,
} from 'discord.js'
import {
  ListenerResult,
  SlashEventHandlers,
  SleetContext,
  SleetModuleOptions,
  SleetSlashSubcommand,
  type SleetSlashSubcommandBody,
} from 'sleetcord'

import { AutomodAction } from '../actions.js'

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
      ? { [K in Name]: PrimitiveFromOptionType<Type> }
      : never
    : never
  : never

type Reducer<T extends unknown[], Acc = {}> = T extends []
  ? Acc
  : T extends [infer Head, ...infer Tail]
    ? Reducer<Tail, Acc & Callback<Head>>
    : never

type Prettify<T> = { [K in keyof T]: T[K] } & {}

type Nullable<T> = { [K in keyof T]: T[K] | null }

type ReduceOrUndefined<T extends unknown[] | undefined> = T extends unknown[]
  ? Prettify<Reducer<T>>
  : {}

function createParameterUnpackerFrom<T extends SleetSlashSubcommandBody['options'] = []>(
  options: T,
) {
  const inOptions = options ?? []

  return s.object<ReduceOrUndefined<T>>(
    inOptions.reduce((acc, option) => {
      return Object.assign(acc, {
        [option.name]: validatorFromType(option.type),
      })
    }, {}) as unknown as MappedObjectValidator<ReduceOrUndefined<T>>,
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

/**
 * Apply an action to a target user, with an optional override for the action and duration
 */
export interface AutomodTrigger {
  /** The message to append to the modlog log */
  logMessage?: string
  /** The user to apply the action to */
  targetUser: User
  /** The channel to send a message to the user */
  targetChannel?: SendableChannels | null
  /** Override the action to apply */
  action?: AutomodAction
  /** Override the duration of the action in seconds */
  duration?: number
}

export type AutomodEventResult = AutomodTrigger | null | undefined | void

type RunResult<T extends unknown[] | undefined> = [T] extends [undefined]
  ? undefined
  : Reducer<NonNullable<T>>

type AutomodEventHandlers<T extends SleetSlashSubcommandBody['options'] = []> = Omit<
  {
    [Event in keyof SlashEventHandlers]: (
      this: SleetContext,
      ...args: Parameters<NonNullable<SlashEventHandlers[Event]>>
    ) => ListenerResult<AutomodEventResult>
  },
  'autocomplete' | 'run'
> & {
  run: (
    this: SleetContext,
    interaction: ChatInputCommandInteraction,
    required: boolean,
    ...args: unknown[]
  ) => Awaitable<Prettify<Nullable<RunResult<T>>>>
  autocomplete?: SlashEventHandlers['autocomplete']
}

/**
 * Base class for an automod rule. Automod roughly mimics what Sleet does for SleetModules, except they're restricted to being subcommands since we mount them under "/automod add <rule>" and "/automod edit <rule>"
 *
 * Some rules:
 * - The body name should be unique across all rules, as it's used to identify the type of the rule in the database
 * - The body options will be shown to users when they add/edit the rule, and used to unpack parameters from the database
 * - The `run` event handler will execute on add/edit and should validate the parameters, and either return an object (to be stored in the database) or throw an error if the parameters are invalid.
 * - The automod system handles rule execution on any non-run events (checking if the guild has any rules for that event) and unpacking parameters before execution
 * - The rule should return an array of Action[] of actions to take on targets, or return null/undefined if the rule should not be triggered
 * - State shouldn't be stored in the rule instance itself, since only 1 instance is created per rule type. Any state should be stored elsewhere.
 */
export class AutomodRule<
  Body extends SleetSlashSubcommandBody = SleetSlashSubcommandBody,
> extends SleetSlashSubcommand {
  public parameterUnpacker: ReturnType<typeof createParameterUnpackerFrom>
  declare paramType: Prettify<RunResult<Body['options']>>

  private inputBody: Body
  private inputOptions: SleetModuleOptions

  constructor(
    body: Body,
    handlers: AutomodEventHandlers<Body['options']>,
    options: SleetModuleOptions = {},
  ) {
    super(body, handlers as SlashEventHandlers, options)
    this.inputBody = body
    this.inputOptions = options
    this.parameterUnpacker = createParameterUnpackerFrom(this.body.options)
  }

  runRule(
    context: SleetContext,
    interaction: ChatInputCommandInteraction,
    requireParams: boolean,
    ...args: unknown[]
  ): Awaitable<unknown> {
    return (this.handlers as AutomodEventHandlers).run.call(
      context,
      interaction,
      requireParams,
      ...args,
    )
  }

  /**
   * Create a new instance of this rule but with new options merged into the body. Required options are automatically sorted to the front
   *
   * This allows you to add new options to the rule like "name" and "description" without having to redefine the entire rule, for example to have /automod add repeat name:foo message:stop that repeats:1 interval:10 and `/automod add repeat name:bar message:stop that repeats:3 interval:10`
   *
   * New options are prepended to the existing options, so they will show up first when adding/editing rules
   */
  withBodyOptions(options: NonNullable<SleetSlashSubcommandBody['options']>, replace = false) {
    const newOptions = replace ? options : [...options, ...(this.inputBody.options ?? [])]

    // required options need to be first
    newOptions.sort((a, b) => {
      if (a.required && !b.required) {
        return -1
      }
      if (!a.required && b.required) {
        return 1
      }

      return 0
    })

    return new AutomodRule(
      {
        ...this.inputBody,
        options: newOptions,
      },
      this.handlers as AutomodEventHandlers<Body['options']>,
      this.inputOptions,
    )
  }
}

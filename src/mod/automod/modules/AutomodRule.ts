import { type BaseValidator, type MappedObjectValidator, s } from '@sapphire/shapeshift'
import {
  APISelectMenuComponent,
  APISelectMenuDefaultValue,
  ApplicationCommandOptionType,
  Awaitable,
  BaseSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChatInputCommandInteraction,
  CheckboxBuilder,
  CheckboxGroupBuilder,
  ComponentType,
  FileUploadBuilder,
  LabelBuilder,
  MentionableSelectMenuBuilder,
  ModalBuilder,
  RoleSelectMenuBuilder,
  SelectMenuDefaultValueType,
  SendableChannels,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  type GuildMember,
} from 'discord.js'
import {
  ListenerResult,
  SlashEventHandlers,
  SleetContext,
  SleetModuleOptions,
  SleetSlashSubcommand,
  type SleetSlashSubcommandBody,
} from 'sleetcord'

import { AutomodAction, automodActionStringSelectChoices } from '../actions.js'
import type { PrismaAutomodRule } from '../automodMiddleware.js'
import type { AutomodParameters } from '../types.js'

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
 * Apply an action, with optional overrides for the action, target member, target channel, and duration
 *
 * The target member and channel are normally automatically pulled based on the event (e.g. messageCreate will use the message author and channel),
 * but rules can override the target member and channel if they need more flexibility
 */
export interface AutomodTrigger {
  /** The specific automod rule that was triggered, since rules are sent to the handlers in batches */
  rule: PrismaAutomodRule
  /** The message to append to the modlog log message, if there's any details for the trigger */
  logMessage?: string
  /** Override the member to apply the action to, by default it's determined from the event */
  overrideMember?: GuildMember
  /** Override the channel to send a message to the member, by default it's determined from the event */
  overrideChannel?: SendableChannels | null
  /** Override the action to apply, by default it's determined from the rule */
  overrideAction?: AutomodAction
  /** Override the duration of the action in seconds, by default it's determined from the rule */
  overrideDuration?: number
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
    ) => ListenerResult<AutomodEventResult[]>
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
 * Options to change how to override the slash command body
 */
interface WithBodyOptions {
  /** Change how the slash command options are overridden */
  options?: {
    /** If true, replace the existing options instead of merging them */
    replace?: boolean
    /** If defined, override the required property of all options */
    required?: boolean
  }
}

/**
 * Base class for an automod rule. Automod roughly mimics what Sleet does for SleetModules, except they're restricted to being subcommands since we mount them under "/automod_rules add <rule>" and "/automod_rules edit <rule>"
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
  ): Awaitable<AutomodParameters> {
    return (this.handlers as AutomodEventHandlers).run.call(
      context,
      interaction,
      requireParams,
      ...args,
    )
  }

  /**
   * Create a new instance of this rule by merging the existing body with a new body.
   *
   * Used to create add/edit subcommands using the same base
   *
   * @param body The new body to merge with the existing body.
   * @param withOptions Options to control how the body is merged.
   * @returns A new AutomodRule instance with the merged body. The handlers and sleet module options are preserved.
   */
  withBody(body: Partial<Body>, withOptions: WithBodyOptions = {}): AutomodRule<Body> {
    const { options, ...otherBody } = body

    let newOptions = this.inputBody.options

    if (options) {
      if (withOptions.options?.replace) {
        newOptions = options
      } else {
        newOptions = [...options, ...(this.inputBody.options ?? [])]

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

        if (withOptions.options?.required !== undefined) {
          newOptions = newOptions.map((opt) => ({
            ...opt,
            required: withOptions.options?.required ?? false,
          }))
        }
      }
    }

    return new AutomodRule(
      {
        ...this.inputBody,
        ...otherBody,
        options: newOptions,
      },
      this.handlers as AutomodEventHandlers<Body['options']>,
      this.inputOptions,
    )
  }

  asDetailEditModal(rule: PrismaAutomodRule): ModalBuilder {
    const modal = new ModalBuilder({
      customId: `automod:edit:${rule.ruleID}`,
      title: `Edit Rule "${rule.name}" (${rule.ruleID})`,
    })

    const nameInput = new TextInputBuilder({
      customId: 'name',
      style: TextInputStyle.Short,
      value: rule.name,
      placeholder: 'Use a name that helps you remember what this rule does',
      required: true,
      maxLength: 100,
    })

    const nameLabel = new LabelBuilder({
      label: 'Name',
      description: 'Name of the rule (for your reference, not shown to members)',
    }).setTextInputComponent(nameInput)

    // we don't want to mutate the original choices
    // oxlint-disable-next-line oxc/no-map-spread
    const options = automodActionStringSelectChoices.map((choice) => ({
      ...choice,
      default: choice.value === rule.action,
    }))

    const actionSelect = new StringSelectMenuBuilder({
      customId: 'action',
      required: true,
      minValues: 1,
      maxValues: 1,
      options,
    })

    const actionLabel = new LabelBuilder({
      label: 'Action',
      description: 'Action to take when the rule is triggered',
    }).setStringSelectMenuComponent(actionSelect)

    const messageInput = new TextInputBuilder({
      customId: 'message',
      style: TextInputStyle.Paragraph,
      value: rule.message ?? '',
      placeholder: "Keep your message short and concise. Members won't read long messages.",
      required: false,
      maxLength: 1500,
    })

    const messageLabel = new LabelBuilder({
      label: 'Message',
      description:
        'Message to show to members when the rule is triggered (use "-" or leave empty for a silent rule)',
    }).setTextInputComponent(messageInput)

    const durationInput = new TextInputBuilder({
      customId: 'duration',
      style: TextInputStyle.Short,
      value: rule.duration ? String(rule.duration) : '',
      placeholder: 'Enter a whole number in seconds (e.g. 30 for 30 seconds, 3600 for 1 hour)',
      required: false,
    })

    const durationLabel = new LabelBuilder({
      label: 'Duration',
      description: 'Duration of the punishment in seconds for timeouts (default: 30s)',
    }).setTextInputComponent(durationInput)

    const howToEditParamsTextDisplay = new TextDisplayBuilder({
      content: `To edit the parameters of the rule, use the slash command \`/automod_rules edit ${rule.type} rule:${rule.ruleID}\`. Discord does not allow modals to have more than 5 input components, which is not enough :(`,
    })

    modal.addLabelComponents(nameLabel, actionLabel, messageLabel, durationLabel)
    modal.addTextDisplayComponents(howToEditParamsTextDisplay)
    return modal
  }

  asParameterEditModal(rule: PrismaAutomodRule): ModalBuilder {
    const modal = new ModalBuilder({
      customId: `automod:edit-params:${rule.ruleID}`,
      title: `Edit Rule "${rule.name}" (${rule.ruleID})`,
    })

    const modalOptionLimit = 5
    let currentOptions = 0

    for (const option of this.inputBody.options ?? []) {
      if (currentOptions + 1 >= modalOptionLimit) {
        const remaining = (this.inputBody.options?.length ?? 0) - currentOptions
        modal.addTextDisplayComponents({
          type: ComponentType.TextDisplay,
          content: `And ${remaining} more option${remaining === 1 ? '' : 's'}... Use \`/automod_rules edit ${rule.type} rule:${rule.ruleID}\` to edit those options for now.`,
        })
        break
      }

      currentOptions++

      const label = new LabelBuilder().setLabel(option.name).setDescription(option.description)
      const value =
        option.name in rule
          ? // oxlint-disable-next-line typescript/no-base-to-string
            String(rule[option.name as keyof typeof rule])
          : rule.parameters && typeof rule.parameters === 'object' && option.name in rule.parameters
            ? String(rule.parameters[option.name])
            : ''

      switch (option.type) {
        case ApplicationCommandOptionType.String:
        case ApplicationCommandOptionType.Number:
        case ApplicationCommandOptionType.Integer: {
          if (option.choices) {
            const selectMenu = new StringSelectMenuBuilder({
              required: option.required ?? false,
            })

            for (const choice of option.choices) {
              selectMenu.addOptions({
                label: choice.name,
                value: String(choice.value),
                default: String(choice.value) === value,
              })
            }

            label.setStringSelectMenuComponent(selectMenu)
            break
          }

          const textInput = new TextInputBuilder({
            style:
              option.type === ApplicationCommandOptionType.String
                ? TextInputStyle.Paragraph
                : TextInputStyle.Short,
            value,
          })

          if (option.required !== undefined) {
            textInput.setRequired(option.required)
          }

          if (option.type === ApplicationCommandOptionType.String) {
            if (option.min_length !== undefined) {
              textInput.setMinLength(option.min_length)
            }

            if (option.max_length !== undefined) {
              textInput.setMaxLength(option.max_length)
            }
          }

          label.setTextInputComponent(textInput)
          break
        }

        case ApplicationCommandOptionType.Boolean: {
          const checkbox = new CheckboxBuilder({
            custom_id: option.name,
            default: value === 'true',
          })

          label.setCheckboxComponent(checkbox)
          break
        }

        case ApplicationCommandOptionType.User:
        case ApplicationCommandOptionType.Channel:
        case ApplicationCommandOptionType.Role:
        case ApplicationCommandOptionType.Mentionable: {
          const defaults = value
            .split(',')
            .map((v) => v.trim())
            .filter((v) => v.length > 0)

          switch (option.type) {
            case ApplicationCommandOptionType.User:
              label.setUserSelectMenuComponent(
                new UserSelectMenuBuilder({
                  defaultValues: defaultValuesForType(defaults, SelectMenuDefaultValueType.User),
                }),
              )
              break

            case ApplicationCommandOptionType.Channel:
              const selectMenu = new ChannelSelectMenuBuilder({
                defaultValues: defaultValuesForType(defaults, SelectMenuDefaultValueType.Channel),
              })

              if (option.channel_types) {
                selectMenu.setChannelTypes(option.channel_types)
              }

              label.setChannelSelectMenuComponent(selectMenu)
              break

            case ApplicationCommandOptionType.Role:
              label.setRoleSelectMenuComponent(
                new RoleSelectMenuBuilder({
                  defaultValues: defaultValuesForType(defaults, SelectMenuDefaultValueType.Role),
                }),
              )
              break

            case ApplicationCommandOptionType.Mentionable:
              label.setMentionableSelectMenuComponent(
                new MentionableSelectMenuBuilder({
                  defaultValues: defaultValuesForType(defaults),
                }),
              )
              break
          }

          const input = label.data.component as BaseSelectMenuBuilder<APISelectMenuComponent>

          input.setMaxValues(1)

          if (option.required !== undefined) {
            input.setRequired(option.required)
          }

          break
        }

        case ApplicationCommandOptionType.Attachment: {
          const existing = value
            ? value
                .split(',')
                .map((v) => v.trim())
                .filter((v) => v.length > 0)
            : []

          if (existing.length > 0) {
            const checkboxGroup = new CheckboxGroupBuilder({
              custom_id: `keep:${option.name}`,
            })

            for (const file of existing) {
              checkboxGroup.addOptions({
                label: file,
                value: file,
                default: true,
              })
            }

            const checkboxGroupLabel = new LabelBuilder()
              .setLabel(`Attachments to keep:`)
              .setCheckboxGroupComponent(checkboxGroup)
            modal.addLabelComponents(checkboxGroupLabel)
          }

          const fileInput = new FileUploadBuilder({
            required: option.required ?? false,
          })

          label.setFileUploadComponent(fileInput)
          break
        }

        default:
          // @ts-expect-error we want this to be a compile error if there's a new option type and forget to handle it here
          throw new Error(`Invalid option type for automod: ${option.type}`)
      }

      if (label.data.component) {
        label.data.component.setCustomId(option.name)
        modal.addLabelComponents(label)
      }
    }

    if (modal.components.length === 0) {
      modal.addTextDisplayComponents({
        type: ComponentType.TextDisplay,
        content: 'No options to edit for this rule',
      })
    }

    return modal
  }
}

/**
 * Helper function to create default values for select menu components based on the option type and a list of string values (IDs)
 *
 * Values can either be prefixed IDs:
 *
 * ```js
 * U:74768773940256768   // User ID
 * C:211956704798048256  // Channel ID
 * R:524137689184862229  // Role ID
 * ```
 *
 * Or if an overrideType is provided, they can be raw IDs without prefixes, and the overrideType will be used for all values:
 *
 * ```js
 * // Role ID will be treated as a User ID and the prefix will be ignored
 * defaultValuesForType(['74768773940256768', 'R:211956704798048256'], SelectMenuDefaultValueType.User)
 * ```
 *
 * @param values The list of string values (IDs) to convert to default values
 * @param overrideType If provided, all values will be treated as this type. Any prefixes will be overridden
 * @returns An array of APISelectMenuDefaultValue objects to be used as default values for select menu components
 */
function defaultValuesForType<T extends SelectMenuDefaultValueType>(
  values: string[],
  overrideType?: T,
): APISelectMenuDefaultValue<T>[] {
  if (overrideType) {
    return values.map((value) => ({ type: overrideType, id: value.split(':')[1] ?? value }))
  }

  return values.map((value) => {
    const [prefix, id] = value.split(':')
    let type: SelectMenuDefaultValueType

    switch (prefix) {
      case 'U':
        type = SelectMenuDefaultValueType.User
        break

      case 'C':
        type = SelectMenuDefaultValueType.Channel
        break

      case 'R':
        type = SelectMenuDefaultValueType.Role
        break

      default:
        throw new Error(`Invalid default prefix for value: ${value}`)
    }

    return { type, id } as APISelectMenuDefaultValue<T>
  })
}

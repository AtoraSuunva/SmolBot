import { Awaitable, ChatInputCommandInteraction } from 'discord.js'
import {
  NoRunSlashEventHandlers,
  SleetContext,
  SleetModuleOptions,
  SleetSlashCommandGroup,
  SleetSlashCommandGroupBody,
} from 'sleetcord'

import type { AutomodParameters } from '../types.js'
import { AutomodRule } from './AutomodRule.js'

export interface AutomodRuleGroupBody<RequireParams extends boolean> extends Omit<
  SleetSlashCommandGroupBody,
  'options'
> {
  requireParams: RequireParams
  options: AutomodRule[]
}

interface AutomodRuleGroupHandlers extends NoRunSlashEventHandlers {
  runResult?: (
    this: SleetContext,
    interaction: ChatInputCommandInteraction,
    rule: AutomodRule,
    params: AutomodParameters,
  ) => Awaitable<void>
}

/**
 * A drop-in replacement for SleetSlashCommandGroup that is used to group automod rules together.
 *
 * This allows automod rules to have their own interaction options e.g. `/automod add repeats repeats:4 interval: 10`
 * that they can perform their own validation on.
 *
 * The `run` method of the AutomodRule will return the parameters to be stored in the database for that rule
 *
 * The AutomodRuleGroup will `run` the AutomodRule and then pass the returned parameters to the `run` method of the AutomodRuleGroup itself
 */
export class AutomodRuleGroup<RequireParams extends boolean> extends SleetSlashCommandGroup {
  public runResult?: AutomodRuleGroupHandlers['runResult']
  private requireParams: RequireParams

  constructor(
    body: AutomodRuleGroupBody<RequireParams>,
    handlers: AutomodRuleGroupHandlers = {},
    options: SleetModuleOptions = {},
  ) {
    const { requireParams, ...slashCommandBody } = body
    const { runResult, ...slashCommandGroupHandlers } = handlers
    super(slashCommandBody, slashCommandGroupHandlers, options)
    // sleet will automatically register handlers for subcommands (the AutomodRules)
    // this ends up duplicating the handlers since we register them for add and edit
    // so we need to disable that autoregistering
    this.registerChildHandlers = false
    this.requireParams = requireParams
    this.runResult = runResult
  }

  override async run(context: SleetContext, interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand()
    if (subcommand) {
      const subcommandHandler = this.subcommands.get(subcommand) as AutomodRule | undefined
      if (subcommandHandler) {
        const subcommandResult = await subcommandHandler.runRule(
          context,
          interaction,
          this.requireParams,
        )
        if (subcommandHandler instanceof AutomodRule) {
          await this.runResult?.call(context, interaction, subcommandHandler, subcommandResult)
        }
        return subcommandResult
      }

      throw new Error(`Unknown subcommand '${subcommand}' for subcommand group '${this.name}'`)
    }

    return undefined
  }
}

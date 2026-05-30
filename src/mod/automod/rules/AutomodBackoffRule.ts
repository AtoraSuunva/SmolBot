import {
  ApplicationCommandOptionType,
  LimitedCollection,
  type AutoModerationActionExecution,
} from 'discord.js'
import { DAY } from 'sleetcord-common'

import { plural } from '../../../helpers/format.js'
import { getAutomodStore, type AutomodStoreReturn } from '../automodMiddleware.js'
import { AutomodEventResult, AutomodRule } from '../modules/AutomodRule.js'

interface BackoffEntry {
  triggerTimestamps: number[]
  decay_after: number
}

// Keyed by `${guildId}-${userId}-${ruleId}`
const backoffMap = new LimitedCollection<string, BackoffEntry>({
  maxSize: 100,
  keepOverLimit: (v) => {
    // Keep entries that haven't had all triggers decay yet
    const now = Date.now()
    return v.triggerTimestamps.some((timestamp) => now - timestamp < v.decay_after * 1000)
  },
})

interface TriggerInstanceInfo {
  /** Action types triggered by this instance */
  actions: number[]
  /** Timestamp of the first trigger in this instance */
  firstTriggerTimestamp: number
}

// Keyed by `${guildId}-${userId}-${ruleId}`
const triggeredRules = new LimitedCollection<string, TriggerInstanceInfo>({
  maxSize: 100,
})

/** Triggers with more than this amount of time between them are considered separate regardless of action type */
const triggerTimestampSeparate = 250

export const automodBackoffRule = new AutomodRule(
  {
    name: 'automod-backoff',
    description: 'Timeout users when they trigger Discord automod (base ^ triggers)',
    options: [
      {
        name: 'automod_rules',
        description: 'IDs of the native automod rules to apply backoff to (comma-separated)',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: 'base_duration',
        description: 'Base timeout duration (seconds, default: 2)',
        type: ApplicationCommandOptionType.Integer,
      },
      {
        name: 'max_duration',
        description: 'Maximum timeout duration (seconds, default: 604800 / 7 days)',
        type: ApplicationCommandOptionType.Integer,
        min_value: 1,
        max_value: (28 * DAY) / 1000, // Discord's max timeout duration is 28 days
      },
      {
        name: 'decay_after',
        description: 'When to start decaying the triggers (seconds, default: 0 for never)',
        type: ApplicationCommandOptionType.Integer,
        min_value: 0,
      },
      {
        name: 'timeout_after',
        description:
          'Start applying the timeout after this many triggers (default: 1, immediately)',
        type: ApplicationCommandOptionType.Integer,
        min_value: 1,
      },
      {
        name: 'trigger_after',
        description:
          'Trigger the rule and apply the action after this many triggers (default: 0 for never)',
        type: ApplicationCommandOptionType.Integer,
        min_value: 0,
      },
    ] as const,
  },
  {
    async run(i, required) {
      const automodRules = i.options.getString('automod_rules')
      const baseDuration = i.options.getInteger('base_duration')
      const maxDuration = i.options.getInteger('max_duration')
      const decayAfter = i.options.getInteger('decay_after')
      const timeoutAfter = i.options.getInteger('timeout_after')
      const triggerAfter = i.options.getInteger('trigger_after')

      return {
        automod_rules: automodRules ?? (required ? '' : null),
        base_duration: baseDuration ?? (required ? 2 : null),
        max_duration: maxDuration ?? (required ? (7 * DAY) / 1000 : null),
        decay_after: decayAfter ?? (required ? 0 : null),
        timeout_after: timeoutAfter ?? (required ? 1 : null),
        trigger_after: triggerAfter ?? (required ? 0 : null),
      }
    },

    async autoModerationActionExecution(execution): Promise<AutomodEventResult[]> {
      const ruleInstances = getAutomodStore<typeof automodBackoffRule>()

      return Promise.all(
        ruleInstances.map(({ rule, params }) =>
          autoModerationActionExecution(execution, rule, params),
        ),
      )
    },
  },
)

type AutomodBackoffStore = AutomodStoreReturn<typeof automodBackoffRule>[number]

async function autoModerationActionExecution(
  execution: AutoModerationActionExecution,
  rule: AutomodBackoffStore['rule'],
  params: AutomodBackoffStore['params'],
): Promise<AutomodEventResult> {
  if (!params.automod_rules.includes(execution.ruleId)) {
    return
  }

  const key = `${execution.guild.id}-${execution.userId}-${execution.ruleId}`

  // If a rule has multiple actions (e.g. block message + timeout), it will trigger separate executions for each action
  // We only want to apply the backoff once per trigger, so we need to dedupe executions
  const previousTriggers = triggeredRules.ensure(key, () => ({
    actions: [],
    firstTriggerTimestamp: 0,
  }))

  const actionType = execution.action.type

  if (
    // If the first trigger was more than `triggerTimestampSeparate` ms ago, treat this as a new instance
    Date.now() - previousTriggers.firstTriggerTimestamp > triggerTimestampSeparate ||
    // OR Duplicate action means we got a new trigger
    previousTriggers.actions.includes(actionType)
  ) {
    previousTriggers.actions = [actionType]
    previousTriggers.firstTriggerTimestamp = Date.now()
  } else {
    // This execution is the same rule trigger but with a different action (e.g. first a block message, then a timeout)
    previousTriggers.actions.push(actionType)
    // Avoid triggering twice on the same message
    return
  }

  const entry = backoffMap.ensure(key, () => ({
    triggerTimestamps: [],
    decay_after: params.decay_after,
  }))

  entry.decay_after = params.decay_after

  // Remove expired triggers based on decay_after
  const now = Date.now()
  if (params.decay_after > 0) {
    entry.triggerTimestamps = entry.triggerTimestamps.filter(
      (timestamp) => now - timestamp < params.decay_after * 1000,
    )
  }

  // Add the current trigger
  entry.triggerTimestamps.push(now)

  // Check for decay_after
  if (params.decay_after > 0) {
    const decayTimestamp = now + params.decay_after * 1000

    entry.triggerTimestamps = entry.triggerTimestamps.filter(
      (timestamp) => timestamp <= decayTimestamp,
    )
  }

  const triggerCount = entry.triggerTimestamps.length

  // Check if the automod rule should trigger
  if (params.trigger_after > 0 && triggerCount >= params.trigger_after) {
    const nativeRule = await execution.guild.autoModerationRules
      .fetch(execution.ruleId)
      .catch(() => null)

    const ruleName = nativeRule ? nativeRule.name : 'unknown rule'

    return {
      rule,
      logMessage: `Discord automod rule "${ruleName}" (${execution.ruleId}) triggered ${plural('time', triggerCount)}. Rule action triggered.`,
    }
  }

  // Check if we should apply the timeout
  if (params.timeout_after > 0 && triggerCount >= params.timeout_after) {
    const duration = Math.min(
      params.base_duration ** (triggerCount - params.timeout_after + 1),
      params.max_duration,
    )

    const nativeRule = await execution.guild.autoModerationRules
      .fetch(execution.ruleId)
      .catch(() => null)

    const ruleName = nativeRule ? nativeRule.name : 'unknown rule'

    return {
      rule,
      overrideAction: 'timeout',
      overrideDuration: duration,
      logMessage: `Discord automod rule "${ruleName}" (${execution.ruleId}) triggered ${plural('time', triggerCount)}. User timed out.`,
    }
  }
}

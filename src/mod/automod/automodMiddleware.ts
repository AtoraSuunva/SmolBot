import { AsyncLocalStorage } from 'node:async_hooks'

import { EventDetails, formatUser, SleetModuleMiddleware } from 'sleetcord'
import { baseLogger } from 'sleetcord-common'

import { Prisma } from '../../generated/prisma/client.js'
import { prisma } from '../../helpers/db.js'
import { plural } from '../../helpers/format.js'
import { sendToModlog } from '../modlog/sendToModlog.js'
import { formatLog, getValidatedConfigFor } from '../modlog/utils.js'
import { muteMembers } from '../mute/mute.js'
import { AutomodAction } from './actions.js'
import { AutomodEventResult, AutomodRule } from './modules/AutomodRule.js'

const automodMiddlewareLogger = baseLogger.child({ module: 'automodMiddleware' })

export type PrismaAutomodRule = Prisma.AutomodRuleGetPayload<true>

interface AutomodStoreEntry<T> {
  rule: PrismaAutomodRule
  params: T
}

export const automodAsyncStore = new AsyncLocalStorage<AutomodStoreEntry<any>[]>()

export type AutomodStoreReturn<Rule extends AutomodRule> = AutomodStoreEntry<Rule['paramType']>[]

export function getAutomodStore<Rule extends AutomodRule>(): AutomodStoreEntry<
  Rule['paramType']
>[] {
  const store = automodAsyncStore.getStore()

  if (!store) {
    throw new Error('No automod parameters found in async store')
  }

  return store as AutomodStoreEntry<Rule['paramType']>[]
}

const actionToVerb: Record<AutomodAction, string> = {
  ban: 'banned',
  kick: 'kicked',
  mute: 'muted',
  timeout: 'timed out',
  log: 'flagged',
}

export const automodMiddleware: SleetModuleMiddleware = async (module, event, next) => {
  // ignore anything that isn't an AutomodRule
  if (!(module instanceof AutomodRule)) {
    await next()
    return
  }

  // try to load this rule from the database for the guild
  const { name } = module.body

  // find the guild the event is for
  let guildID: string | null = null
  for (const arg of event.arguments as unknown as EventArguments[]) {
    if (typeof arg !== 'object' || arg === null) {
      continue
    }

    if ('guildId' in arg && typeof arg.guildId === 'string') {
      guildID = arg.guildId
      break
    }

    if ('guild' in arg && arg.guild && 'id' in arg.guild) {
      guildID = arg.guild.id
      break
    }

    if (
      'message' in arg &&
      arg.message &&
      typeof arg.message === 'object' &&
      'guildId' in arg.message
    ) {
      guildID = arg.message.guildId
      break
    }
  }

  if (!guildID) {
    // if we can't find a guild ID, just skip automod processing since we don't know which rules to load
    automodMiddlewareLogger.warn(
      { eventName: event.name },
      `Could not find guild ID in event arguments, skipping automod processing for event ${event.name}`,
    )
    await next()
    return
  }

  // pull the rules from the database, if any exists
  const rules = await prisma.automodRule.findMany({
    where: {
      guildID,
      type: name,
    },
  })

  if (rules.length === 0) {
    // no rules of this type for this guild, skip processing by not calling next()
    return
  }

  automodMiddlewareLogger.info(
    { eventName: event.name, ruleCount: rules.length },
    `Found ${rules.length} automod rules of type ${name} for guild ${guildID} to process for event ${event.name}`,
  )

  const automodRules: AutomodStoreEntry<any>[] = []

  // for each rule, unpack the parameters and run the event handler
  for (const rule of rules) {
    const params = module.parameterUnpacker.run(rule.parameters)

    if (params.isErr()) {
      automodMiddlewareLogger.error(
        { ruleId: rule.ruleID, error: params.error },
        `Failed to unpack parameters for automod rule ${rule.ruleID} of type ${name}, skipping execution`,
      )
      continue
    }

    automodRules.push({ rule, params: params.value })
  }

  const ruleIDs = automodRules.map((r) => r.rule.ruleID)

  automodMiddlewareLogger.info(
    { rules: ruleIDs, ruleType: name, params: automodRules.map((r) => r.params) },
    `Running ${ruleIDs.length} automod rule(s) of type ${name} with parameters`,
  )
  const results = await (automodAsyncStore.run(automodRules, next) as Promise<AutomodEventResult[]>)

  for (const result of results) {
    if (!result) {
      continue
    }

    const { rule } = result
    const targetUser = result.targetUser
    const targetChannel = result.targetChannel
    const { client } = targetUser
    const member = await client.guilds
      .fetch(guildID)
      .then((guild) => guild.members.fetch(targetUser.id))
      .catch(() => null)
    const action = result.action ?? (rule.action as AutomodAction)
    const duration = result.duration ?? rule.duration ?? 0

    if (!member) {
      return
    }

    let actionable = false

    const reason = `Automod rule ${rule.ruleID} triggered: ${result.logMessage ?? 'No additional details'}`

    switch (action) {
      case 'ban': {
        if (member.bannable) {
          actionable = true
          await member.ban({
            reason,
            deleteMessageSeconds: duration,
          })
        }
        break
      }

      case 'kick': {
        if (member.kickable) {
          actionable = true
          await member.kick(reason)
        }
        break
      }

      case 'mute': {
        if (member.moderatable) {
          actionable = true
          const me = await member.guild.members.fetchMe()

          await muteMembers({
            action: 'mute',
            guild: member.guild,
            members: [member],
            reason,
            executor: me,
          })
        }
        break
      }

      case 'timeout': {
        if (member.moderatable) {
          actionable = true
          if (duration > 0) {
            await member.timeout(duration * 1000, reason)
          }
        }
        break
      }

      case 'log': {
        // do nothing, just continue to modlog
        break
      }
    }

    if (rule.message && targetChannel) {
      await targetChannel.send({
        content: rule.message.replace('{user}', `<@${targetUser.id}>`),
      })
    }

    // log to modlog

    const config = await getValidatedConfigFor(
      member.guild,
      'automodAction',
      (config) => config.automodAction,
    )

    if (config) {
      // 🐲 10:55:14 PM [Automod] User [username] (123456789) @user triggered **Automod Rule Name** and was **kicked**: Sent 5 identical messages in 10 seconds
      const loggedAction =
        action === 'log' || !actionable
          ? ''
          : ` and was **${actionToVerb[action]}**${duration > 0 ? ` for ${plural('second', duration)}` : ''}`
      const details = result.logMessage ? `:\n> ${result.logMessage}` : ''
      const content = formatLog(
        '🐲',
        'Automod',
        `${formatUser(member)} triggered **${rule.name}**${loggedAction}${details}`,
        new Date(),
      )

      await sendToModlog(config.channel, {
        content,
        allowedMentions: { parse: [] },
      })
    }
  }
}

type NonUnknown<T> = T extends unknown ? (unknown extends T ? never : T) : never
/**
 * Flatten a type like [A, B, C] | [D, E, F] into A | B | C | D | E | F
 */
type Flatten<T extends readonly unknown[]> = T extends unknown[] ? NonUnknown<T[number]> : never
type EventArguments = Flatten<EventDetails['arguments']>

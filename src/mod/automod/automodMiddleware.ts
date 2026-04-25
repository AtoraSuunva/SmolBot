import { AsyncLocalStorage } from 'node:async_hooks'

import { EventDetails, SleetModuleMiddleware } from 'sleetcord'
import { baseLogger } from 'sleetcord-common'

import { Prisma } from '../../generated/prisma/client.js'
import { prisma } from '../../helpers/db.js'
import { AutomodAction } from './actions.js'
import { AutomodEventResult, AutomodRule } from './modules/AutomodRule.js'

const automodMiddlewareLogger = baseLogger.child({ module: 'automodMiddleware' })

interface AutomodStoreEntry<T> {
  rule: Prisma.AutomodRuleGetPayload<true>
  params: T
}

export const automodAsyncStore = new AsyncLocalStorage<AutomodStoreEntry<any>>()

export function getAutomodStore<Rule extends AutomodRule>(): AutomodStoreEntry<Rule['paramType']> {
  const store = automodAsyncStore.getStore()
  if (!store) {
    throw new Error('No automod parameters found in async store')
  }

  return {
    rule: store.rule,
    params: store.params as Rule['paramType'],
  }
}

export const automodMiddleware: SleetModuleMiddleware = async (module, event, next) => {
  // ignore anything that isn't an AutomodRule
  if (!(module instanceof AutomodRule)) {
    await next()
    return
  }

  automodMiddlewareLogger.debug(
    { eventName: event.name, ruleType: module.body.name },
    `Received event ${event.name} for automod rule type ${module.body.name}`,
  )

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
  }

  if (!guildID) {
    // if we can't find a guild ID, just skip automod processing since we don't know which rules to load
    automodMiddlewareLogger.debug(
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
    // no rules of this type for this guild, skip processing
    automodMiddlewareLogger.debug(
      { eventName: event.name, guildID, ruleType: name },
      `No automod rules of type ${name} found for guild ${guildID}, skipping automod processing for event ${event.name}`,
    )
    return
  }

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

    automodMiddlewareLogger.debug(
      { ruleId: rule.ruleID, ruleType: name, params: params.unwrap() },
      `Running automod rule ${rule.ruleID} of type ${name} with parameters`,
    )
    const result = await (automodAsyncStore.run(
      { rule, params: params.unwrap() },
      next,
    ) as Promise<AutomodEventResult>)

    if (result) {
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

      switch (action) {
        case 'ban': {
          if (member.bannable) {
            await member.ban({
              reason: `Automod rule ${rule.ruleID} triggered`,
              deleteMessageSeconds: duration,
            })
          }
        }

        case 'kick': {
          if (member.kickable) {
            await member.kick(`Automod rule ${rule.ruleID} triggered`)
          }
        }

        case 'mute': {
          if (member.moderatable) {
            await member.timeout(duration * 1000, `Automod rule ${rule.ruleID} triggered`)
          }
        }

        case 'timeout': {
          if (member.moderatable) {
            await member.timeout(duration * 1000, `Automod rule ${rule.ruleID} triggered`)
          }
        }

        case 'log': {
          automodMiddlewareLogger.info(
            { guildID, userId: targetUser.id, action, duration, ruleId: rule.ruleID },
            `Automod rule ${rule.ruleID} triggered for user ${targetUser.id}, applying action ${action} for duration ${duration}`,
          )
        }
      }

      if (rule.message && targetChannel) {
        await targetChannel.send({
          content: rule.message.replace('{user}', `<@${targetUser.id}>`),
        })
      }
    }
  }
}

type NonUnknown<T> = T extends unknown ? (unknown extends T ? never : T) : never
/**
 * Flatten a type like [A, B, C] | [D, E, F] into A | B | C | D | E | F
 */
type Flatten<T extends readonly unknown[]> = T extends unknown[] ? NonUnknown<T[number]> : never
type EventArguments = Flatten<EventDetails['arguments']>

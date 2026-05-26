import { AsyncLocalStorage } from 'node:async_hooks'

import type { Channel, Client, Guild, GuildMember } from 'discord.js'
import { EventDetails, formatUser, SleetModuleMiddleware } from 'sleetcord'
import { baseLogger } from 'sleetcord-common'

import type { AutomodRuleGetPayload } from '../../generated/prisma/models.js'
import { prisma } from '../../helpers/db.js'
import { plural } from '../../helpers/format.js'
import { sendToModlog } from '../modlog/sendToModlog.js'
import { formatLog, getValidatedConfigFor } from '../modlog/utils.js'
import { muteMembers } from '../mute/mute.js'
import { AutomodAction } from './actions.js'
import { AutomodEventResult, AutomodRule } from './modules/AutomodRule.js'
import { getAutomodConfig } from './utils.js'

const automodMiddlewareLogger = baseLogger.child({ module: 'automodMiddleware' })

export type PrismaAutomodRule = AutomodRuleGetPayload<true>

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

  const { guild, member, channel } = await getEntitiesFromEvent(event)

  if (!guild) {
    // if we can't find a guild ID, just skip automod processing since we don't know which rules to load
    automodMiddlewareLogger.warn(
      { eventName: event.name },
      `Could not find guild ID in event arguments, skipping automod processing for event ${event.name}`,
    )
    await next()
    return
  }

  const config = await getAutomodConfig(guild.id)

  if (config.ignoredChannels?.includes(channel?.id ?? '')) {
    automodMiddlewareLogger.info(
      { channelId: channel?.id },
      `Channel ${channel?.id} is configured to be ignored, skipping automod processing for event ${event.name}`,
    )
    return
  }

  if (config.ignoredRoles?.length && member) {
    const memberRoles = new Set(member.roles.cache.map((r) => r.id))
    const ignoredRole = config.ignoredRoles.find((r) => memberRoles.has(r))

    if (ignoredRole) {
      automodMiddlewareLogger.info(
        { roleId: ignoredRole, memberId: member.id },
        `Member ${member.id} has role ${ignoredRole} which is configured to be ignored, skipping automod processing for event ${event.name}`,
      )
      return
    }
  }

  if (config.ignoredUsers?.includes(member?.id ?? '')) {
    automodMiddlewareLogger.info(
      { userId: member?.id },
      `User ${member?.id} is configured to be ignored, skipping automod processing for event ${event.name}`,
    )
    return
  }

  if (member?.user.bot && config.ignoreBots) {
    automodMiddlewareLogger.info(
      { userId: member.id },
      `User ${member.id} is a bot and ignoreBots is enabled, skipping automod processing for event ${event.name}`,
    )
    return
  }

  if (member?.permissions.has('Administrator') && config.ignoreAdmins) {
    automodMiddlewareLogger.info(
      { userId: member.id },
      `User ${member.id} has Administrator permissions and ignoreAdmins is enabled, skipping automod processing for event ${event.name}`,
    )
    return
  }

  // pull the rules from the database, if any exists
  const rules = await prisma.automodRule.findMany({
    where: {
      guildID: guild.id,
      type: name,
    },
  })

  if (rules.length === 0) {
    // no rules of this type for this guild, skip processing by not calling next()
    return
  }

  automodMiddlewareLogger.info(
    { eventName: event.name, ruleCount: rules.length },
    `Found ${rules.length} automod rules of type ${name} for guild ${guild.id} to process for event ${event.name}`,
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

    const punishMember = result.overrideMember ?? member
    const sendChannel = result.overrideChannel ?? channel
    const action = result.overrideAction ?? (rule.action as AutomodAction)
    const duration = result.overrideDuration ?? rule.duration ?? 0

    if (!punishMember) {
      return
    }

    let actionable = false

    const reason =
      `Automod rule ${rule.ruleID} triggered: ${result.logMessage ?? 'No additional details'}`.slice(
        0,
        512,
      )

    switch (action) {
      case 'ban': {
        if (punishMember.bannable) {
          actionable = true
          await punishMember.ban({
            reason,
            deleteMessageSeconds: duration,
          })
        }
        break
      }

      case 'kick': {
        if (punishMember.kickable) {
          actionable = true
          await punishMember.kick(reason)
        }
        break
      }

      case 'mute': {
        if (punishMember.moderatable) {
          actionable = true
          const me = await punishMember.guild.members.fetchMe()

          await muteMembers({
            action: 'mute',
            guild: punishMember.guild,
            members: [punishMember],
            reason,
            executor: me,
          })
        }
        break
      }

      case 'timeout': {
        if (punishMember.moderatable) {
          actionable = true
          if (duration > 0) {
            await punishMember.timeout(duration * 1000, reason)
          }
        }
        break
      }

      case 'log': {
        // do nothing, just continue to modlog
        break
      }
    }

    if (rule.message && sendChannel && sendChannel.isSendable()) {
      const prepend = config.prepend ? `${config.prepend}, ` : ''
      const ruleMessage = rule.message.replace('{user}', `<@${punishMember.id}>`)
      await sendChannel.send({
        content: `${prepend}${ruleMessage}`,
      })
    }

    // log to modlog

    const modlogConfig = await getValidatedConfigFor(
      guild,
      'automodAction',
      (config) => config.automodAction,
    )

    if (modlogConfig) {
      // 🐲 10:55:14 PM [Automod] User [username] (123456789) @user triggered **Automod Rule Name** in <#channelId> and was **kicked**: Sent 5 identical messages in 10 seconds
      const byUser = formatUser(punishMember.user)
      const inChannel = sendChannel ? ` in <#${sendChannel.id}>` : ''
      const loggedAction =
        action === 'log' || !actionable
          ? ''
          : ` and was **${actionToVerb[action]}**${duration > 0 ? ` for ${plural('second', duration)}` : ''}`
      const details = result.logMessage ? `:\n> ${result.logMessage}` : ''

      const content = formatLog(
        '🐲',
        'Automod',
        `${byUser} triggered **${rule.name}**${inChannel}${loggedAction}${details}`,
        new Date(),
      )

      await sendToModlog(modlogConfig.channel, {
        content,
        allowedMentions: { parse: [] },
      })
    }
  }
}

interface Entities {
  guild: Guild | null
  member: GuildMember | null
  channel: Channel | null
}

async function getEntitiesFromEvent(event: EventDetails): Promise<Entities> {
  switch (event.name) {
    case 'messageCreate':
    case 'messageDelete':
    case 'messageUpdate': {
      const [message] = event.arguments

      return resolveEntities(
        message.client,
        message.guildId,
        message.author?.id ?? null,
        message.channelId,
      )
    }

    case 'autoModerationActionExecution': {
      const [execution] = event.arguments

      return resolveEntities(
        execution.guild.client,
        execution.guild.id,
        execution.userId,
        execution.action.metadata.channelId,
      )
    }

    case 'messageReactionAdd': {
      const [reaction, user] = event.arguments

      return resolveEntities(
        reaction.message.client,
        reaction.message.guildId,
        user.id,
        reaction.message.channelId,
      )
    }

    case 'guildMemberAdd':
    case 'guildMemberUpdate': {
      const [member] = event.arguments

      return resolveEntities(member.client, member.guild.id, member.id, null)
    }

    case 'presenceUpdate': {
      const [, newPresence] = event.arguments

      return resolveEntities(
        newPresence.client,
        newPresence.guild?.id ?? null,
        newPresence.userId,
        null,
      )
    }

    case 'threadCreate':
    case 'threadUpdate': {
      // TODO: use audit log to match the thread creation to a user?
      const [thread] = event.arguments

      return resolveEntities(thread.client, thread.guildId, null, thread.id)
    }

    // TODO: userUpdate -> since it fires without specifying which guilds we share, we need to check every guild for the user
    // this is what modlog does, maybe find a way to share the logic with modlog here?
  }

  return { guild: null, member: null, channel: null }
}

async function resolveEntities(
  client: Client,
  guildId: string | null,
  userId: string | null,
  channelId: string | null,
): Promise<Entities> {
  const guild = guildId ? await client.guilds.fetch(guildId).catch(() => null) : null
  const member = guild && userId ? await guild.members.fetch(userId).catch(() => null) : null
  const channel = channelId ? await client.channels.fetch(channelId).catch(() => null) : null

  return { guild, member, channel }
}

import { withQueryTags } from '@prisma/sqlcommenter-query-tags'
import { GatewayIntentBits, Options, Partials, type RESTOptions } from 'discord.js'
import env from 'env-var'
import { SleetClient, type SleetModuleEventHandlers, SleetModuleMiddleware } from 'sleetcord'
import { baseLogger, initDBLogging, initSentry, Sentry, sentryMiddleware } from 'sleetcord-common'

import { prisma } from './helpers/db.js'
import { modules } from './modules.js'
import { startApiServer } from './utility/api/server.js'

const initLogger = baseLogger.child({ module: 'init' })

/**
 * Sleet module runner that adds some prisma sql commenter tags to trace queries to events and modules
 * @param module The Sleet module being run
 * @param callback The Sleet callback to run
 * @param event The Sleet/Discord.js event that triggered the module
 * @returns The result of running the callback
 */
const withQueryTagsMiddleware: SleetModuleMiddleware = (module, event, next) => {
  return withQueryTags(
    {
      event: event.name,
      module: module.name,
    },
    async () => next(),
  )
}

async function main() {
  const TOKEN = env.get('TOKEN').required().asString()
  const APPLICATION_ID = env.get('APPLICATION_ID').required().asString()
  const GIT_COMMIT_SHA = env.get('GIT_COMMIT_SHA').asString() ?? 'development'

  initLogger.info('Init Sentry')
  initSentry({
    release: GIT_COMMIT_SHA,
    tracesSampler(samplingContext) {
      const { name } = samplingContext

      if (name.includes(':')) {
        // Transaction names are `${module.name}:${event.name}`
        const [moduleName, eventName] = name.split(':') as [string, keyof SleetModuleEventHandlers]

        switch (eventName) {
          case 'raw':
            return 0

          case 'messageCreate':
          case 'messageUpdate':
          case 'userUpdate':
            return 0.01
        }

        switch (moduleName) {
          case 'logging':
          case 'sentryLogger':
            return 0.01
        }

        return 0.2
      }

      return 0.2
    },
  })

  initLogger.info('Init Sleet')
  const sleetClient = new SleetClient({
    sleet: {
      token: TOKEN,
      applicationId: APPLICATION_ID,
      middleware: [sentryMiddleware, withQueryTagsMiddleware],
    },
    client: {
      rest: {
        // I hate types sometimes, the native fetch works, but then plays bad with everything else
        // that involves streams
        makeRequest: fetch as unknown as RESTOptions['makeRequest'],
      },
      intents: [
        GatewayIntentBits.AutoModerationExecution,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildModeration, // For Audit Log Events
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
      ],
      partials: [
        Partials.Channel,
        Partials.GuildMember,
        Partials.Message,
        Partials.Reaction,
        Partials.User,
      ],
      makeCache: Options.cacheWithLimits({
        ...Options.DefaultMakeCacheSettings,
        BaseGuildEmojiManager: 0,
        GuildEmojiManager: 0,
        GuildStickerManager: 0,
        GuildScheduledEventManager: 0,
        PresenceManager: 0,
        StageInstanceManager: 0,
        ThreadMemberManager: 0,
      }),
      enforceNonce: true,
    },
  })

  initLogger.info('Init DB Logging')
  initDBLogging(prisma, sleetClient)

  // TODO: some modules should be locked to, say, a dev guild only
  // `registerOnlyInGuilds` solves that, but we need a way to pass which guild(s) to the commands
  // `devGuild` option in sleet? `registerOnlyInGuilds: ['devGuild']`?
  sleetClient.addModules(modules)

  initLogger.info('Putting commands')
  await sleetClient.putCommands()
  initLogger.info('Logging in')
  await sleetClient.login()
  initLogger.info('Logged in')

  startApiServer()
}

process
  .on('unhandledRejection', (reason, _promise) => {
    initLogger.error('Unhandled promise rejection')
    initLogger.error(reason)
    Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)))
  })
  .on('uncaughtException', (err) => {
    initLogger.error('Uncaught exception')
    initLogger.error(err)
    Sentry.captureException(err)
    process.exit(1)
  })

// See https://docs.sentry.io/platforms/node/configuration/integrations/default-integrations/
try {
  await main()
} catch (err) {
  initLogger.error('Fatal error during startup, or error bubbled up')
  initLogger.error(err)
  Sentry.captureException(err)
  process.exit(1)
}

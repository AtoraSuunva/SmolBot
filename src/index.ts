import { GatewayIntentBits, Options, Partials, RESTOptions } from 'discord.js'
import env from 'env-var'
import {
  SleetClient,
  SleetModule,
  SleetModuleEventHandlers,
  formatUser,
} from 'sleetcord'
import {
  Sentry,
  baseLogger,
  getModuleRunner,
  initDBLogging,
  initSentry,
} from 'sleetcord-common'
import { modules } from './modules.js'
import { prisma } from './util/db.js'

const initLogger = baseLogger.child({ module: 'init' })

async function main() {
  const TOKEN = env.get('TOKEN').required().asString()
  const APPLICATION_ID = env.get('APPLICATION_ID').required().asString()
  const GIT_COMMIT_SHA = env.get('GIT_COMMIT_SHA').asString() ?? 'development'

  initLogger.info('Init Sentry')
  initSentry({
    release: GIT_COMMIT_SHA,
    tracesSampler(samplingContext) {
      const { name, op } = samplingContext.transactionContext

      if (op === 'module') {
        // Transaction names are `${module.name}:${event.name}`
        const [moduleName, eventName] = name.split(':') as [
          string,
          keyof SleetModuleEventHandlers,
        ]

        if (
          eventName === 'messageCreate' ||
          eventName === 'messageUpdate' ||
          eventName === 'userUpdate'
        ) {
          return 0.01
        } else if (moduleName === 'logging' || moduleName === 'sentryLogger') {
          return 0.01
        }

        return 0.2
      } else if (op === 'db.sql.prisma') {
        if (name === 'ModLogConfig findFirst') {
          return 0.005
        }
        return 0.1
      }

      return 0.2
    },
  })

  initLogger.info('Init DB Logging')
  initDBLogging(prisma)

  initLogger.info('Init Sleet')
  const sleetClient = new SleetClient({
    sleet: {
      token: TOKEN,
      applicationId: APPLICATION_ID,
      moduleRunner: getModuleRunner(),
    },
    client: {
      rest: {
        // I hate types sometimes, the native fetch works, but then plays bad with everything else
        // that involves streams
        makeRequest: fetch as unknown as RESTOptions['makeRequest'],
      },
      intents: [
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
        AutoModerationRuleManager: 0,
      }),
    },
  })

  const moreLogging = new SleetModule(
    {
      name: 'moreLogging',
    },
    {
      ready(c) {
        const { application, shard, readyAt } = c
        initLogger.info(`Ready at   : ${readyAt.toISOString()}`)
        initLogger.info(`Logged in  : ${formatUser(c.user)}`)
        initLogger.info(`Guild Count: ${application.approximateGuildCount}`)

        if (shard) {
          initLogger.info(`Shard Count: ${shard.count}`)
        }
      },
    },
  )

  // TODO: some modules should be locked to, say, a dev guild only
  // `registerOnlyInGuilds` solves that, but we need a way to pass which guild(s) to the commands
  // `devGuild` option in sleet? `registerOnlyInGuilds: ['devGuild']`?
  sleetClient.addModules([moreLogging, ...modules])

  initLogger.info('Putting commands')
  await sleetClient.putCommands()
  initLogger.info('Logging in')
  await sleetClient.login()
  initLogger.info('Logged in')
}

// See https://docs.sentry.io/platforms/node/configuration/integrations/default-integrations/
try {
  await main()
} catch (err) {
  initLogger.error('Fatal error during startup, or error bubbled up', err)
  Sentry.captureException(err)
  process.exit(1)
}

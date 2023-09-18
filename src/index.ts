import { GatewayIntentBits, Options, Partials, RESTOptions } from 'discord.js'
import env from 'env-var'
import { SleetClient } from 'sleetcord'
import { modules } from './modules.js'
import {
  Sentry,
  getModuleRunner,
  initDBLogging,
  initSentry,
} from 'sleetcord-common'
import { prisma } from './util/db.js'

async function main() {
  const TOKEN = env.get('TOKEN').required().asString()
  const APPLICATION_ID = env.get('APPLICATION_ID').required().asString()
  const GIT_COMMIT_SHA = env.get('GIT_COMMIT_SHA').asString() ?? 'development'

  initSentry({
    release: GIT_COMMIT_SHA,
  })
  initDBLogging(prisma)

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

  // TODO: some modules should be locked to, say, a dev guild only
  // `registerOnlyInGuilds` solves that, but we need a way to pass which guild(s) to the commands
  // `devGuild` option in sleet? `registerOnlyInGuilds: ['devGuild']`?
  sleetClient.addModules(modules)
  await sleetClient.putCommands()
  await sleetClient.login()
}

// See https://docs.sentry.io/platforms/node/configuration/integrations/default-integrations/
try {
  await main()
} catch (err) {
  Sentry.captureException(err)
}

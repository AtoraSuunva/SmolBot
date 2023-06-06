import { GatewayIntentBits, Partials } from 'discord.js'
import env from 'env-var'
import { SleetClient } from 'sleetcord'
import { LoggerOptions } from 'pino'
import { modules } from './modules.js'

const TOKEN = env.get('TOKEN').required().asString()
const APPLICATION_ID = env.get('APPLICATION_ID').required().asString()
const NODE_ENV = env.get('NODE_ENV').required().asString()
const USE_PINO_PRETTY = env.get('USE_PINO_PRETTY').required().asBool()

const loggerOptions: LoggerOptions = {
  level: NODE_ENV === 'development' ? 'debug' : 'info',
}

if (USE_PINO_PRETTY) {
  loggerOptions.transport = {
    target: 'pino-pretty',
  }
}

const sleetClient = new SleetClient({
  sleet: {
    token: TOKEN,
    applicationId: APPLICATION_ID,
  },
  client: {
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildModeration, // For Audit Log Events
    ],
    partials: [
      Partials.User,
      Partials.GuildMember,
      Partials.Reaction,
      Partials.Message,
      Partials.Channel,
    ],
  },
  logger: loggerOptions,
})

// TODO: some modules should be locked to, say, a dev guild only
// `registerOnlyInGuilds` solves that, but we need a way to pass which guild(s) to the commands
// `devGuild` option in sleet? `registerOnlyInGuilds: ['devGuild']`?
sleetClient.addModules(modules)
await sleetClient.putCommands()
sleetClient.login()

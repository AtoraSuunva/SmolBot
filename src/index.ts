import { GatewayIntentBits, Partials, RESTOptions } from 'discord.js'
import env from 'env-var'
import { SleetClient } from 'sleetcord'
import { modules } from './modules.js'
import './util/dbLogging.js'

const TOKEN = env.get('TOKEN').required().asString()
const APPLICATION_ID = env.get('APPLICATION_ID').required().asString()

const sleetClient = new SleetClient({
  sleet: {
    token: TOKEN,
    applicationId: APPLICATION_ID,
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
  },
})

// TODO: some modules should be locked to, say, a dev guild only
// `registerOnlyInGuilds` solves that, but we need a way to pass which guild(s) to the commands
// `devGuild` option in sleet? `registerOnlyInGuilds: ['devGuild']`?
sleetClient.addModules(modules)
await sleetClient.putCommands()
await sleetClient.login()

import { GatewayIntentBits, Partials } from 'discord.js'
import env from 'env-var'
import { SleetClient } from 'sleetcord'
import { modules } from './modules.js'

const TOKEN = env.get('TOKEN').required().asString()
const APPLICATION_ID = env.get('APPLICATION_ID').required().asString()

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
})

// TODO: some modules should be locked to, say, a dev guild only
// `registerOnlyInGuilds` solves that, but we need a way to pass which guild(s) to the commands
// `devGuild` option in sleet? `registerOnlyInGuilds: ['devGuild']`?
sleetClient.addModules(modules)
await sleetClient.putCommands()
await sleetClient.login()

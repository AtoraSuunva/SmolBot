import { GatewayIntentBits } from 'discord.js'
import env from 'env-var'
import { SleetClient } from 'sleetcord'
import { mute, unmute } from './mod/mute.js'
import { purge } from './mod/purge.js'
import { revoke } from './mod/revoke.js'
import { activity } from './misc/activity.js'
import { furrygen } from './misc/furrygen.js'
import { info } from './misc/info.js'
import { minesweeper } from './misc/minesweeper.js'
import { stats } from './misc/stats.js'
import { banlog } from './mod/banlog.js'
import { lookup } from './mod/lookup.js'
import { softban } from './mod/softban.js'
import { quote } from './utility/quote.js'
import { unedit, unedit_message } from './mod/unedit.js'
import { autoreply } from './secret/autoreply.js'
import { send } from './secret/send.js'
import { extract } from './utility/extract.js'
import { count_members } from './utility/count_members.js'
import { restore_embeds } from './utility/restore_embeds.js'
import { idof } from './mod/idof.js'
import { welcome } from './mod/welcome/welcome.js'
import { LoggerOptions } from 'pino'
import { lock_thread } from './mod/lock_thread.js'
import { ping } from './misc/ping.js'
import { report_message } from './mod/report/report_message.js'
import { report } from './mod/report/report.js'
import { mass_ban, mass_kick } from './mod/mass_action.js'
import { report_config } from './mod/report/report_config.js'
import { convert } from './utility/convert.js'
import { time_since } from './utility/time_since.js'
import { vc_log } from './mod/vc_log.js'
import { modlog, modlogModules } from './mod/modlog/modlog.js'
import { timeout_button } from './secret/timeout_button.js'
import { warnings } from './mod/warnings/warnings.js'
import { myWarnings } from './mod/warnings/my-warnings.js'
import { warningsImport } from './mod/warnings/import.js'

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
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
    ],
  },
  logger: loggerOptions,
})

// TODO: some modules should be locked to, say, a dev guild only
// `registerOnlyInGuilds` solves that, but we need a way to pass which guild(s) to the commands
// `devGuild` option in sleet? `registerOnlyInGuilds: ['devGuild']`?
sleetClient.addModules([
  // mod
  mute,
  unmute,
  softban,
  purge,
  revoke,
  banlog,
  lookup,
  unedit,
  unedit_message,
  idof,
  welcome,
  lock_thread,
  report,
  report_message,
  report_config,
  mass_ban,
  mass_kick,
  vc_log,
  modlog,
  ...modlogModules,
  warnings,
  warningsImport,
  myWarnings,

  // misc
  activity,
  furrygen,
  info,
  stats,
  minesweeper,
  ping,

  // util
  quote,
  extract,
  count_members,
  restore_embeds,
  convert,
  time_since,

  // secret
  autoreply,
  send,
  timeout_button,
])

// const TEST_GUILD_ID = env.get('TEST_GUILD_ID').required().asString()
// sleetClient.putCommands({ guildId: TEST_GUILD_ID, commands: [] })

sleetClient.putCommands()
sleetClient.login()

import { Intents } from 'discord.js'
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
import { quote } from './util/quote.js'
import { unedit } from './mod/unedit.js'
import { autoreply } from './secret/autoreply.js'
import { send } from './secret/send.js'
import { extract } from './util/extract.js'
import { count_members } from './util/count_members.js'
import { restore_embeds } from './util/restore_embeds.js'
import { idof } from './mod/idof.js'

const TOKEN = env.get('TOKEN').required().asString()
const APPLICATION_ID = env.get('APPLICATION_ID').required().asString()

const sleetClient = new SleetClient({
  sleet: {
    token: TOKEN,
    applicationId: APPLICATION_ID,
  },
  client: {
    intents: [
      Intents.FLAGS.GUILDS,
      Intents.FLAGS.GUILD_MEMBERS,
      Intents.FLAGS.GUILD_MESSAGES,
      Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
    ],
  },
})

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
  idof,

  // misc
  activity,
  furrygen,
  info,
  stats,
  minesweeper,

  // util
  quote,
  extract,
  count_members,
  restore_embeds,

  // secret
  autoreply,
  send,
])

// const TEST_GUILD_ID = env.get('TEST_GUILD_ID').required().asString()
// sleetClient.putCommands({ guildId: TEST_GUILD_ID, commands: [] })

sleetClient.putCommands()
sleetClient.login()

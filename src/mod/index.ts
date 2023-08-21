// import { automod } from './automod/automod.js'
import { banlog } from './banlog.js'
import { dehoist } from './dehoist.js'
import { idof } from './idof.js'
import { lock_thread } from './lock_thread.js'
import { lookup } from './lookup.js'
import { mass_ban, mass_kick } from './mass_action.js'
import { modlogModules } from './modlog/index.js'
import { muteModules } from './mute/index.js'
import { purge } from './purge.js'
import { report } from './report/report.js'
import { revoke } from './revoke.js'
import { softban } from './softban.js'
import { unedit, unedit_message } from './unedit.js'
import { vc_log } from './vc_log.js'
import { warningsModules } from './warnings/index.js'
import { welcome } from './welcome/welcome.js'

export const modModules = [
  ...modlogModules,
  ...muteModules,
  ...warningsModules,
  // automod,
  banlog,
  dehoist,
  idof,
  lock_thread,
  lookup,
  mass_ban,
  mass_kick,
  purge,
  report,
  revoke,
  softban,
  unedit_message,
  unedit,
  vc_log,
  welcome,
]

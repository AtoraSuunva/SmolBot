import { banlog } from './banlog.js'
import { idof } from './idof.js'
import { lock_thread } from './lock_thread.js'
import { lookup } from './lookup.js'
import { mass_ban, mass_kick } from './mass_action.js'
import { modlog } from './modlog/modlog.js'
import { mute, unmute } from './mute.js'
import { purge } from './purge.js'
import { report } from './report/report.js'
import { revoke } from './revoke.js'
import { softban } from './softban.js'
import { unedit, unedit_message } from './unedit.js'
import { vc_log } from './vc_log.js'
import { warnings } from './warnings/warnings.js'
import { welcome } from './welcome/welcome.js'

export const modModules = [
  modlog,
  report,
  warnings,
  welcome,
  banlog,
  idof,
  lock_thread,
  lookup,
  mass_ban,
  mass_kick,
  mute,
  unmute,
  purge,
  revoke,
  softban,
  unedit,
  unedit_message,
  vc_log,
]

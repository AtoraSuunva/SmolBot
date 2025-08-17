// import { automod } from './automod/automod.js'
import { actionLogModules } from './actionlog/index.js'
import { manual_log } from './actionlog/manual_log.js'
import { antiraidModules } from './antiraid/index.js'
import { auto_tag } from './auto_tag.js'
import { maliciousFile } from './automod/maliciousFile.js'
import { dehoist } from './dehoist.js'
import { delete_police_config } from './delete_police_config.js'
// import { export_users } from './export_users.js'
import { find_members } from './find_members.js'
import { lock_thread } from './lock_thread/lock_thread.js'
import { lock_thread_config } from './lock_thread/lock_thread_config.js'
import { lookup } from './lookup.js'
import {
  mass_ban,
  mass_find,
  mass_kick,
  mass_softban,
  mass_unban,
} from './mass_action.js'
import { messageDeleteAuditLog } from './messageDeleteAuditLog.js'
import { modlogModules } from './modlog/index.js'
import { modmail } from './modmail/index.js'
import { muteModules } from './mute/index.js'
import { purge } from './purge.js'
import { purge_threads } from './purge_threads.js'
import { report } from './report/report.js'
import { revoke } from './revoke/index.js'
import { unedit, unedit_message } from './unedit.js'
import { vc_log } from './vc_log.js'
import { warningsModules } from './warnings/index.js'
import { welcome } from './welcome/welcome.js'

export const modModules = [
  ...actionLogModules,
  ...antiraidModules,
  ...modlogModules,
  ...muteModules,
  ...warningsModules,
  // automod,
  auto_tag,
  dehoist,
  delete_police_config,
  // export_users,
  find_members,
  lock_thread_config,
  lock_thread,
  lookup,
  maliciousFile,
  manual_log,
  mass_ban,
  mass_find,
  mass_kick,
  mass_softban,
  mass_unban,
  messageDeleteAuditLog,
  modmail,
  purge_threads,
  purge,
  report,
  revoke,
  unedit_message,
  unedit,
  vc_log,
  welcome,
]

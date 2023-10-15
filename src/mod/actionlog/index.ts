import { SleetSlashCommand } from 'sleetcord'
import { actionlog_history } from './actionlog_history.js'
import { actionlog_manage } from './actionlog_manage.js'
import { logAction } from './logAction.js'
import { actionReason } from './reason.js'

const actionlog = new SleetSlashCommand({
  name: 'actionlog',
  description: 'Manage the action logging system',
  default_member_permissions: ['ManageGuild'],
  options: [actionlog_manage, actionlog_history],
})

export const actionLogModules = [actionlog, logAction, actionReason]

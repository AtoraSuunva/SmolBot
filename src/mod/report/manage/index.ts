import { SleetSlashCommand } from 'sleetcord'
import { report_config } from './config.js'
import { report_unblock } from './unblock.js'

export const report_manage = new SleetSlashCommand({
  name: 'report_manage',
  description: 'Manage the report system.',
  dm_permission: false,
  default_member_permissions: ['ManageGuild'],
  options: [report_config, report_unblock],
})

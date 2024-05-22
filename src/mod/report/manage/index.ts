import { InteractionContextType } from 'discord-api-types/v10'
import { SleetSlashCommand } from 'sleetcord'
import { report_manage_config } from './config.js'
import { report_manage_unblock } from './unblock.js'

export const report_manage = new SleetSlashCommand({
  name: 'report_manage',
  description: 'Manage the report system.',
  contexts: [InteractionContextType.Guild],
  default_member_permissions: ['ManageGuild'],
  options: [report_manage_config, report_manage_unblock],
})

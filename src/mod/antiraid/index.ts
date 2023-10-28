import { SleetSlashCommand } from 'sleetcord'
import { antiraid_check } from './check.js'
import { antiraid_config } from './config.js'

const antiraid = new SleetSlashCommand({
  name: 'antiraid',
  description: 'Configure the antiraid module',
  options: [antiraid_config, antiraid_check],
  dm_permission: false,
  default_member_permissions: ['ManageGuild'],
})

export const antiraidModules = [antiraid]

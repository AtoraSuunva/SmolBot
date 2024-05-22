import { InteractionContextType } from 'discord-api-types/v10'
import { SleetSlashCommand } from 'sleetcord'
import { antiraid_check } from './check.js'
import { antiraid_config } from './config.js'

const antiraid = new SleetSlashCommand({
  name: 'antiraid',
  description: 'Configure the antiraid module',
  options: [antiraid_config, antiraid_check],
  contexts: [InteractionContextType.Guild],
  default_member_permissions: ['ManageGuild'],
})

export const antiraidModules = [antiraid]

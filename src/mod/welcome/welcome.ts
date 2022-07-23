import { SleetSlashCommand } from 'sleetcord'
import { config } from './config.js'
import { deleteCommand } from './delete.js'
import { fields } from './help.js'
import { message } from './message.js'

export const welcome = new SleetSlashCommand({
  name: 'welcome',
  description: 'Manage the welcome message',
  dm_permission: false,
  default_member_permissions: ['ManageGuild'],
  options: [fields, message, deleteCommand, config],
})

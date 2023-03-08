import { SleetModule, SleetSlashCommand } from 'sleetcord'
import { edit } from './edit.js'
import { logGuildMemberAdd } from './handlers/guildMemberAdd.js'
import { view } from './view.js'

export const modlog = new SleetSlashCommand({
  name: 'modlog',
  description: 'Manage the modlog',
  dm_permission: false,
  default_member_permissions: ['ManageGuild'],
  options: [view, edit],
})

export const modlogModules: SleetModule[] = [logGuildMemberAdd]

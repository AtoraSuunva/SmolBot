import { SleetSlashCommand } from 'sleetcord'
import { edit } from './edit.js'
import { logGuildMemberAdd } from './handlers/guildMemberAdd.js'
import { view } from './view.js'
import { logAuditLog } from './handlers/auditLog/index.js'
import { logUserUpdate } from './handlers/userUpdate.js'
import { logMessageDelete } from './handlers/messageDelete.js'
import { logMessageDeleteBulk } from './handlers/messageDeleteBulk.js'

export const modlog = new SleetSlashCommand(
  {
    name: 'modlog',
    description: 'Manage the modlog',
    dm_permission: false,
    default_member_permissions: ['ManageGuild'],
    options: [view, edit],
  },
  {},
  [
    logGuildMemberAdd,
    logUserUpdate,
    logMessageDelete,
    logMessageDeleteBulk,
    logAuditLog,
  ],
)

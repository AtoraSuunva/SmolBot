import { SleetModule } from 'sleetcord'
import { logGuildMemberAdd } from './handlers/guildMemberAdd.js'
import { logAuditLog } from './handlers/auditLog/index.js'
import { logUserUpdate } from './handlers/userUpdate.js'
import { logMessageDelete } from './handlers/messageDelete.js'
import { logMessageDeleteBulk } from './handlers/messageDeleteBulk.js'
import { logGuildMemberRemove } from './handlers/guildMemberRemove.js'
import { modlogMessageReactionAdd } from './handlers/messageReactionAdd.js'

export const modlog = new SleetModule(
  {
    name: 'modlog',
  },
  {},
  [
    logAuditLog,
    logGuildMemberAdd,
    logGuildMemberRemove,
    logMessageDelete,
    logMessageDeleteBulk,
    logUserUpdate,
    modlogMessageReactionAdd,
  ],
)

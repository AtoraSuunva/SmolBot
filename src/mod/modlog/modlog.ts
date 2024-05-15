import { SleetModule } from 'sleetcord'
import { logAuditLog } from './handlers/auditLog/index.js'
import { logGuildMemberAdd } from './handlers/guildMemberAdd.js'
import { logGuildMemberRemove } from './handlers/guildMemberRemove.js'
import { logMessageDelete } from './handlers/messageDelete.js'
import { logMessageDeleteBulk } from './handlers/messageDeleteBulk.js'
import { modlogMessageReactionAdd } from './handlers/messageReactionAdd.js'
import { logUserUpdate } from './handlers/userUpdate.js'

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

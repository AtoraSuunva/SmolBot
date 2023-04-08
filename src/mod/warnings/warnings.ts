import { SleetSlashCommand, SleetSlashCommandGroup } from 'sleetcord'
import { warningsConfigView } from './config/view.js'
import { warningsConfigEdit } from './config/edit.js'
import { warningsAdd } from './add.js'
import { warningsSearch } from './search.js'
import { warningsEdit } from './edit.js'
import { warningsHistory } from './history.js'
import { warningsRevert } from './revert.js'
import { warningsExport } from './export.js'
import { importWarnings } from './import_warnings.js'
import { myWarnings } from './my_warnings.js'

const warningsConfig = new SleetSlashCommandGroup({
  name: 'config',
  description: 'Manage the warnings configuration',
  options: [warningsConfigEdit, warningsConfigView],
})

export const warnings = new SleetSlashCommand(
  {
    name: 'warnings',
    description: 'Manage warnings on the server',
    default_member_permissions: ['ModerateMembers'],
    options: [
      warningsAdd,
      warningsSearch,
      warningsEdit,
      warningsHistory,
      warningsRevert,
      warningsConfig,
      warningsExport,
    ],
  },
  {},
  [importWarnings, myWarnings],
)

import { SleetSlashCommand, SleetSlashCommandGroup } from 'sleetcord'
import { warningsConfigView } from './config/view.js'
import { warningsConfigEdit } from './config/edit.js'
import { warningsAdd } from './add.js'
import { warningsSearch } from './search.js'
import { warningsEdit } from './edit.js'
import { warningsHistory } from './history.js'
import { warningsRevert } from './revert.js'
import { warningsExport, warningsExportReady } from './export.js'

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
  {
    ready: warningsExportReady, // TODO: this is because sleet is bugged, remove when updated, see https://github.com/AtoraSuunva/sleet/issues/1
  },
)

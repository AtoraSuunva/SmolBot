import { SleetSlashCommandGroup } from 'sleetcord'

import { BaseRepeatRule } from '../filters/BaseRepeatRule.js'

export const automod_edit = new SleetSlashCommandGroup({
  name: 'edit',
  description: 'Edit an existing automod rule',
  options: [BaseRepeatRule],
})

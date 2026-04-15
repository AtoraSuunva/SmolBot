import { SleetSlashCommandGroup } from 'sleetcord'

import { BaseRepeatRule } from '../filters/BaseRepeatRule.js'

export const automod_add = new SleetSlashCommandGroup({
  name: 'add',
  description: 'Add a new rule to automod',
  options: [BaseRepeatRule],
})

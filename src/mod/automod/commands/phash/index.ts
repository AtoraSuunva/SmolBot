import { SleetSlashCommandGroup } from 'sleetcord'

import { automod_phash_add } from './add.js'
import { automod_phash_list } from './list.js'

export const automod_phash = new SleetSlashCommandGroup({
  name: 'phash',
  description: 'Commands for managing image phashes for scam detection',
  options: [automod_phash_add, automod_phash_list],
})

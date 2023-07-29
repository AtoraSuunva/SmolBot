import { logging, rollbarLogger } from 'sleetcord-common'
import { miscModules } from './misc/index.js'
import { modModules } from './mod/index.js'
import { secretModules } from './secret/index.js'
import { SleetModule } from 'sleetcord'
import { utilityModules } from './utility/index.js'

export const modules: SleetModule[] = [
  ...miscModules,
  ...modModules,
  ...secretModules,
  ...utilityModules,
  logging,
  rollbarLogger,
]

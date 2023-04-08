import { utilityModules } from './utility/index.js'
import { secretModules } from './secret/index.js'
import { miscModules } from './misc/index.js'
import { modModules } from './mod/index.js'
import { SleetModule } from 'sleetcord'

export const modules: SleetModule[] = [
  ...modModules,
  ...miscModules,
  ...utilityModules,
  ...secretModules,
]

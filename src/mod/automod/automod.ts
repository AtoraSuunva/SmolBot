import { SleetSlashCommand } from 'sleetcord'

import { automodMiddleware } from './automodMiddleware.js'
import { automod_add } from './commands/add.js'
import { automod_delete } from './commands/delete.js'
import { automod_edit } from './commands/edit.js'
import { automod_view } from './commands/view.js'
import { rules } from './rules/index.js'

// TODO for automod:
//  - [X] Add a way to view the automod rules
//    - [ ] Include way to search
//    - [ ] Include pagination
//  - [ ] Add more rules (automod backoff timeout, pressure spam, newlines, etc)

export const automod = new SleetSlashCommand(
  {
    name: 'automod',
    description: "Manage the bot's automod",
    options: [automod_add, automod_view, automod_edit, automod_delete],
  },
  {},
  {
    modules: rules,
    middleware: [automodMiddleware],
  },
)

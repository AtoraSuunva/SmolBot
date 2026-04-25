import { SleetSlashCommand } from 'sleetcord'

import { automodMiddleware } from './automodMiddleware.js'
import { automod_add } from './commands/add.js'
import { automod_edit } from './commands/edit.js'
import { automod_remove } from './commands/remove.js'
import { automod_view } from './commands/view.js'
import { messageRepeatsRule } from './rules/MessageRepeats.js'

// TODO for automod:
//  - [X] Add a way to view the automod rules
//    - [ ] Include way to search
//    - [ ] Include pagination
//  - [X] Add a way to remove automod rules
//  - [X] Add a way to add automod rules
//    - Rules should have:
//      - [X] Bot-set type
//      - [X] User-customizable name
//      - [X] User-customizable message (shown on trigger, optional)
//      - [X] User-customizable arguments (varies per rule)
//    - [X] Each rule should (somehow) define what it needs to generate the slash commands
//    - [X] Each rule should be able to parse the DB row and create itself (on load)
//      - Could use the type as a discriminator to determine which rule to create
//    - [X] Each rule should be able to serialize itself into a Prisma-compatible payload
//  - [ ] Add a way to edit automod rules?
//    - How? Good way to handle multiple types? Generate slash commands like add?

export const automod = new SleetSlashCommand(
  {
    name: 'automod',
    description: "Manage the bot's automod",
    options: [automod_add, automod_view, automod_edit, automod_remove],
  },
  {},
  {
    modules: [messageRepeatsRule],
    middleware: [automodMiddleware],
  },
)

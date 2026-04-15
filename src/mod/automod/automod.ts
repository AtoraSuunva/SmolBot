import { SleetSlashCommand } from 'sleetcord'

import { automod_add } from './commands/add.js'
import { automod_edit } from './commands/edit.js'
import { automod_remove } from './commands/remove.js'
import { automod_view } from './commands/view.js'

// TODO for automod:
//  - Add a way to view the automod rules
//    - Include way to search
//    - Include pagination
//  - Add a way to remove automod rules
//  - Add a way to add automod rules
//    - Rules should have:
//      - Bot-set type
//      - User-customizable name
//      - User-customizable description (shown on trigger, optional)
//      - User-customizable arguments (varies per rule)
//    - Each rule should (somehow) define what it needs to generate the slash commands
//    - Each rule should be able to parse the DB row and create itself (on load)
//      - Could use the type as a discriminator to determine which rule to create
//    - Each rule should be able to serialize itself into a Prisma-compatible payload
//  - Add a way to edit automod rules?
//    - How? Good way to handle multiple types? Generate slash commands like add?

export const automod = new SleetSlashCommand({
  name: 'automod',
  description: "Manage the bot's automod",
  options: [automod_add, automod_view, automod_edit, automod_remove],
})

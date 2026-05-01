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
//  - [ ] Log channel for automod actions
//    - Just integrate with modlog? Probably the best, doesn't require extra config
//    - But make sure to include the parameters in the log for context (e.g. "user sent 5 messages in 10 seconds") -> format function?
//    - Option to enable/fine-tune what gets logged (e.g. maybe I don't want to log message repeats that trigger a timeout, but I do want to log ones that trigger a ban)?
//      - Maybe later, if needed
//  - [ ] Add more rules (automod backoff timeout, reactions, pressure spam, newlines, etc)

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

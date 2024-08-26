import { InteractionContextType } from 'discord-api-types/v10'
import { SleetSlashCommand } from 'sleetcord'

import { create_ticket_button } from './create_ticket_button.js'
import { modmail_delete_by_id } from './delete.js'
import { modmail_fields } from './fields/index.js'
import { handle_thread_update } from './handle_thread_update.js'
import { handle_ticket_message } from './handle_ticket_message.js'

export const modmail = new SleetSlashCommand(
  {
    name: 'modmail',
    description: 'Manage modmail settings',
    contexts: [InteractionContextType.Guild],
    options: [create_ticket_button, modmail_fields, modmail_delete_by_id],
  },
  {},
  [handle_ticket_message, handle_thread_update],
)

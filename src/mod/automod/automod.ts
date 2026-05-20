import { Interaction, MessageFlags } from 'discord.js'
import { inGuildGuard, SleetSlashCommand } from 'sleetcord'

import { automodMiddleware } from './automodMiddleware.js'
import { automod_add, handleCopyInteraction } from './commands/add.js'
import { automod_delete, handleDeleteInteraction } from './commands/delete.js'
import { automod_details, handleDetailsInteraction } from './commands/details.js'
import { automod_edit, handleEditInteraction } from './commands/edit.js'
import { automod_view, handleViewInteraction } from './commands/view.js'
import { rules } from './rules/index.js'

// TODO for automod:
// - [ ] Add more rules (phash, pressure, newlines, forbidden, emoji-only, embeds, scam)

export const automod = new SleetSlashCommand(
  {
    name: 'automod',
    description: "Manage the bot's automod",
    options: [automod_add, automod_view, automod_details, automod_edit, automod_delete],
  },
  {
    interactionCreate,
  },
  {
    modules: rules,
    middleware: [automodMiddleware],
  },
)

async function interactionCreate(interaction: Interaction) {
  if (!interaction.isButton()) {
    return
  }

  inGuildGuard(interaction)

  // automod:view:{pageNumber}
  // automod:details:{ruleID}
  // automod:edit:{ruleID}
  // automod:copy:{ruleID}
  // automod:delete:{ruleID}
  const [module, action, ...params] = interaction.customId.split(':')

  if (module !== 'automod') {
    return
  }

  switch (action) {
    // automod:view:{pageNumber}
    case 'view': {
      await handleViewInteraction(interaction, params)
      break
    }

    // automod:details:{ruleID}
    case 'details': {
      await handleDetailsInteraction(interaction, params)
      break
    }

    // automod:edit:{ruleID}
    case 'edit': {
      await handleEditInteraction(interaction, params)
      break
    }

    // automod:copy:{ruleID}
    case 'copy': {
      await handleCopyInteraction(interaction, params)
      break
    }

    // automod:delete:{ruleID}
    case 'delete': {
      await handleDeleteInteraction(interaction, params)
      break
    }

    default:
      await interaction.reply({
        content: `Action \`${action}\` not implemented`,
        flags: MessageFlags.Ephemeral,
      })
      break
  }
}

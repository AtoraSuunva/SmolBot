import {
  ApplicationIntegrationType,
  Interaction,
  InteractionContextType,
  MessageFlags,
} from 'discord.js'
import { inGuildGuard, SleetSlashCommand } from 'sleetcord'

import { automodMiddleware } from './automodMiddleware.js'
import { automod_add, handleCopyInteraction } from './commands/add.js'
import { automod_add_phash } from './commands/add_phash.js'
import { automod_config } from './commands/config.js'
import { automod_delete, handleDeleteInteraction } from './commands/delete.js'
import { automod_details, handleDetailsInteraction } from './commands/details.js'
import { automod_edit, handleEditInteraction } from './commands/edit.js'
import { automod_view, handleViewInteraction } from './commands/view.js'
import { rules } from './rules/index.js'

// TODO for automod:
// - [ ] Add more rules (phash, pressure, newlines, forbidden, emoji-only, scam, cross-channel)

// It's ugly to split these out, but we're actually running into the 8,000 character limit for commands
export const automod_rules = new SleetSlashCommand({
  name: 'automod_rules',
  description: "Manage the bot's automod rules",
  options: [automod_add, automod_edit],
  contexts: [InteractionContextType.Guild],
  default_member_permissions: ['ManageGuild'],
  integration_types: [ApplicationIntegrationType.GuildInstall],
})

export const automod = new SleetSlashCommand(
  {
    name: 'automod',
    description: "Manage the bot's automod",
    options: [automod_view, automod_details, automod_delete, automod_config, automod_add_phash],
    contexts: [InteractionContextType.Guild],
    default_member_permissions: ['ManageGuild'],
    integration_types: [ApplicationIntegrationType.GuildInstall],
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

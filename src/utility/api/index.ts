import { ApplicationIntegrationType, InteractionContextType } from 'discord.js'
import { SleetSlashCommand, SleetSlashCommandGroup } from 'sleetcord'
import { check, create, deleteToken, list } from './token.js'

const token = new SleetSlashCommandGroup({
  name: 'token',
  description: 'Token management commands',
  options: [create, list, check, deleteToken],
})

export const api = new SleetSlashCommand({
  name: 'api',
  description: 'Manage API access',
  contexts: [InteractionContextType.Guild],
  integration_types: [ApplicationIntegrationType.GuildInstall],
  default_member_permissions: ['Administrator'],
  options: [token],
})

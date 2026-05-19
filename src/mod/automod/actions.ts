import { APISelectMenuOption } from 'discord.js'
import { makeChoices } from 'sleetcord'

export const automodActions = ['log', 'timeout', 'mute', 'kick', 'ban'] as const
export type AutomodAction = (typeof automodActions)[number]
export const automodActionCommandOptionChoices = makeChoices(automodActions as unknown as string[])
export const automodActionStringSelectChoices = [
  {
    label: 'Log',
    value: 'log',
    description: 'Only log the automod trigger without taking any action',
    emoji: { name: '📝' },
  },
  {
    label: 'Timeout',
    value: 'timeout',
    description: 'Timeout the user for a specified duration',
    emoji: { name: '⏱️' },
  },
  {
    label: 'Mute',
    value: 'mute',
    description: 'Mute the user until they are unmuted by a moderator',
    emoji: { name: '🔇' },
  },
  {
    label: 'Kick',
    value: 'kick',
    description: 'Kick the user from the server',
    emoji: { name: '👢' },
  },
  {
    label: 'Ban',
    value: 'ban',
    description: 'Ban the user from the server',
    emoji: { name: '🔨' },
  },
] as const satisfies APISelectMenuOption[]

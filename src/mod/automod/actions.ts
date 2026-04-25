import { makeChoices } from 'sleetcord'

export const automodActions = ['log', 'timeout', 'mute', 'kick', 'ban'] as const
export type AutomodAction = (typeof automodActions)[number]
export const automodActionChoices = makeChoices(automodActions as unknown as string[])

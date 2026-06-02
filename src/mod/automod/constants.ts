import { makeChoices } from 'sleetcord'

import { rules } from './rules/index.js'

export const automodTypes = rules.map((rule) => rule.name)
export const automodChoices = makeChoices(automodTypes)

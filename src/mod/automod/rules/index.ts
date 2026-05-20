import { AutomodRule } from '../modules/AutomodRule.js'
import { automodBackoffRule } from './AutomodBackoffRule.js'
import { messageRepeatsRule } from './MessageRepeatRule.js'
import { reactionRule } from './ReactionRule.js'
import { regexRule } from './RegexRule.js'

export const rules: AutomodRule[] = [
  messageRepeatsRule,
  reactionRule,
  regexRule,
  automodBackoffRule,
]

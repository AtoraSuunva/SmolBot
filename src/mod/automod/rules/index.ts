import { AutomodRule } from '../modules/AutomodRule.js'
import { messageRepeatsRule } from './MessageRepeatRule.js'
import { reactionFilterRule } from './ReactionRule.js'
import { regexRule } from './RegexRule.js'

export const rules: AutomodRule[] = [messageRepeatsRule, reactionFilterRule, regexRule]

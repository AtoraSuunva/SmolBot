import { AutomodRule } from '../modules/AutomodRule.js'
import { automodBackoffRule } from './AutomodBackoffRule.js'
import { embedRepeatsRule } from './EmbedRepeatRule.js'
import { imageScamRule } from './ImageScamRule.js'
import { messageRepeatsRule } from './MessageRepeatRule.js'
import { reactionRule } from './ReactionRule.js'
import { regexRule } from './RegexRule.js'

export const rules: AutomodRule[] = [
  automodBackoffRule,
  embedRepeatsRule,
  imageScamRule,
  messageRepeatsRule,
  reactionRule,
  regexRule,
]

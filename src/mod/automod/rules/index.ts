import env from 'env-var'

import { AutomodRule } from '../modules/AutomodRule.js'
import { automodBackoffRule } from './AutomodBackoffRule.js'
import { embedRepeatsRule } from './EmbedRepeatRule.js'
import { messageRepeatsRule } from './MessageRepeatRule.js'
import { reactionRule } from './ReactionRule.js'
import { regexRule } from './RegexRule.js'
const ENABLE_PHASH = env.get('ENABLE_PHASH').asBool() ?? true

export const rules: AutomodRule[] = [
  automodBackoffRule,
  embedRepeatsRule,
  ...(ENABLE_PHASH
    ? [await import('./ImageScamRule.js').then((module) => module.imageScamRule)]
    : []),
  messageRepeatsRule,
  reactionRule,
  regexRule,
]

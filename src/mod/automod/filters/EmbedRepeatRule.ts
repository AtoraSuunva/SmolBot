import { Message } from 'discord.js'
import { BaseRepeatRule, RepeatInfractionInfo } from './BaseRepeatRule.js'
import { hashEmbeds } from '../hashEmbeds.js'

export class EmbedRepeatRule extends BaseRepeatRule<string[]> {
  constructor(maxRepeats: number) {
    super(maxRepeats, 'repeat', `Max repeats reached (${maxRepeats})`)
  }

  override isRepeat(
    _message: Message<true>,
    info: RepeatInfractionInfo<string[]>,
    newIdentifier: string[],
  ): boolean {
    const { lastIdentifier } = info

    return (
      // Has at least 1 embed
      newIdentifier.length > 0 &&
      // Has at least 1 identical embed
      newIdentifier.some((hash) => lastIdentifier.includes(hash))
    )
  }

  override getIdentifier(message: Message<true>): Promise<string[]> {
    return hashEmbeds(message)
  }
}

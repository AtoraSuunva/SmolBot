import { Message } from 'discord.js'
import { BaseRepeatRule, RepeatInfractionInfo } from './BaseRepeatRule.js'

export class ContentRepeatRule extends BaseRepeatRule<string> {
  constructor(maxRepeats: number) {
    super(maxRepeats, 'repeat', `Max repeats reached (${maxRepeats})`)
  }

  override isRepeat(
    message: Message<true>,
    info: RepeatInfractionInfo<string>,
    newIdentifier: string,
  ): boolean {
    const { lastIdentifier } = info

    return (
      // Not empty (means it's an embed)
      message.content !== '' &&
      // Same content
      lastIdentifier === newIdentifier
    )
  }

  override getIdentifier(message: Message<true>): string {
    return message.content.toLowerCase()
  }
}

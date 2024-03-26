import { Message } from 'discord.js'
import { BaseRepeatRule, RepeatInfractionInfo } from './BaseRepeatRule.js'
import { hashEmbeds } from '../hashEmbeds.js'

interface AcrossChannelsIdentifier {
  channel: string
  content: string
  embeds: string[]
}

export class AcrossChannelsRule extends BaseRepeatRule<AcrossChannelsIdentifier> {
  constructor(maxRepeats: number) {
    super(
      maxRepeats,
      'across-channels',
      `Max repeats across channels reached (${maxRepeats})`,
    )
  }

  override isRepeat(
    _message: Message<true>,
    info: RepeatInfractionInfo<AcrossChannelsIdentifier>,
    newIdentifier: AcrossChannelsIdentifier,
  ): boolean {
    const { lastIdentifier } = info

    return (
      // Not the same channel
      lastIdentifier.channel !== newIdentifier.channel &&
      // Same content
      (lastIdentifier.content === newIdentifier.content ||
        // Or same embeds
        newIdentifier.embeds.some((hash) =>
          lastIdentifier.embeds.includes(hash),
        ))
    )
  }

  override async getIdentifier(
    message: Message<true>,
  ): Promise<AcrossChannelsIdentifier> {
    return {
      channel: message.channel.id,
      content: message.content.toLowerCase(),
      embeds: await hashEmbeds(message),
    }
  }
}

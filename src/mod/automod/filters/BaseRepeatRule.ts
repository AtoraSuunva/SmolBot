import { Awaitable, GuildMember, Message } from 'discord.js'
import { AutomodRule, RuleTriggerInfo } from './AutomodRule.js'

export interface RepeatInfractionInfo<Identifier> {
  /** The previous messages that "matched" some criteria to count as an infraction */
  previousMessages: Message[]
  /** Some "key" that was last derived from the message, something like message content or attachment hashes */
  lastIdentifier: Identifier
  /** The number of times the key has been repeated */
  repeats: number
}

export abstract class BaseRepeatRule<Identifier> extends AutomodRule {
  private readonly infractionInfo = new Map<
    GuildMember,
    RepeatInfractionInfo<Identifier>
  >()

  constructor(
    public readonly maxRepeats: number,
    name: string,
    description: string,
  ) {
    super(name, description)
  }

  async resetCounter(
    member: GuildMember,
    message: Message<true>,
    data?: Identifier,
  ) {
    this.infractionInfo.set(member, {
      previousMessages: [message],
      lastIdentifier: data ?? (await this.getIdentifier(message)),
      repeats: 0,
    })
  }

  abstract isRepeat(
    message: Message<true>,
    info: RepeatInfractionInfo<Identifier>,
    newIdentifier: Identifier,
  ): Awaitable<boolean>

  abstract getIdentifier(message: Message<true>): Awaitable<Identifier>

  override async filterMessage(
    message: Message<true>,
  ): Promise<RuleTriggerInfo | null> {
    const member = await message.guild.members.fetch(message.author.id)
    const info = this.infractionInfo.get(member)

    if (!info || info.previousMessages.length === 0) {
      await this.resetCounter(member, message)
      return null
    }

    const newIdentifier = await this.getIdentifier(message)
    const isRepeat = await this.isRepeat(message, info, newIdentifier)

    if (!isRepeat) {
      await this.resetCounter(member, message, newIdentifier)
      return null
    }

    const { previousMessages, repeats } = info
    const newRepeats = repeats + 1

    this.infractionInfo.set(member, {
      previousMessages: [...previousMessages, message],
      lastIdentifier: newIdentifier,
      repeats: newRepeats,
    })

    if (newRepeats >= this.maxRepeats) {
      return {
        causedBy: [...previousMessages, message],
        reason: this.description,
      }
    }

    return null
  }
}

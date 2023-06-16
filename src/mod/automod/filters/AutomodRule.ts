import { Awaitable, Message } from 'discord.js'

export interface RuleTriggerInfo {
  readonly causedBy?: Message[]
  readonly reason: string
}

export abstract class AutomodRule {
  constructor(
    public readonly name: string,
    public readonly description: string,
  ) {}

  filterMessage(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _message: Message<true>,
  ): Awaitable<RuleTriggerInfo | null> {
    return null
  }
}

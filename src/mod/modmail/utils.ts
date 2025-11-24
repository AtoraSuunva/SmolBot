import type { Logger } from 'pino'
import { baseLogger } from 'sleetcord-common'

export const modmailLogger: Logger = baseLogger.child({ module: 'modmail' })

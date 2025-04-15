import type { WelcomeSettings } from '../../generated/prisma/client.js'

// <GuildID, WelcomeSettings>
export const welcomeCache = new Map<string, WelcomeSettings | null>()

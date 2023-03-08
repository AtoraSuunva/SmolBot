import { ModLogConfig } from '@prisma/client'
import { ChatInputCommandInteraction, codeBlock, Guild } from 'discord.js'
import { getGuild, SleetSlashSubcommand } from 'sleetcord'
import { prisma } from '../../util/db.js'

export const view = new SleetSlashSubcommand(
  {
    name: 'view',
    description: 'View the modlog',
  },
  {
    run: handleView,
  },
)

async function handleView(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)

  const settings = await prisma.modLogConfig.findFirst({
    where: {
      guildID: guild.id,
    },
  })

  if (!settings) {
    await interaction.reply({
      content: 'No modlog settings found',
      ephemeral: true,
    })
    return
  }

  const formattedSettings = formatConfig(guild, settings)
  await interaction.reply({
    content: formattedSettings,
  })
}

export function formatConfig(guild: Guild, config: Partial<ModLogConfig>) {
  type ConfigValue = ModLogConfig[keyof ModLogConfig]
  let longest = 0

  const formatted = Object.entries(config)
    .map(([key, value]): [string, ConfigValue] => {
      key = snakeCase(key)
      if (key.length > longest) longest = key.length
      return [key, value]
    })
    .map(([key, value]) => {
      if (['guild_id', 'updated_at'].includes(key)) return null
      if (key === 'channel_id')
        (key = 'channel'),
          (value = `#${
            guild.channels.cache.get(value as string)?.name ?? 'unknown-channel'
          }`)

      return `${snakeCase(key).padEnd(longest, ' ')} = ${value}`
    })
    .filter(notNullish)
    .join('\n')

  return codeBlock('ini', formatted)
}

function notNullish<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

function snakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/\s+/g, '_')
    .toLowerCase()
}

import type { Prisma } from '@prisma/client'
import { InteractionContextType } from 'discord-api-types/v10'
import {
  ApplicationCommandOptionType,
  type ChatInputCommandInteraction,
  Constants,
} from 'discord.js'
import { SleetSlashCommand, getGuild, makeChoices } from 'sleetcord'
import { getOptionCount } from 'sleetcord-common'
import { prisma } from '../../util/db.js'
import { formatConfig } from '../../util/format.js'

export const mute_manage = new SleetSlashCommand(
  {
    name: 'mute_manage',
    description: 'Configure the mute system',
    default_member_permissions: ['ManageGuild'],
    contexts: [InteractionContextType.Guild],
    options: [
      {
        name: 'role',
        description: 'The role to give to muted users',
        type: ApplicationCommandOptionType.Role,
      },
      {
        name: 'log_channel',
        description: 'The channel to send mute logs to',
        type: ApplicationCommandOptionType.Channel,
        channel_types: Constants.GuildTextBasedChannelTypes,
      },
      {
        name: 'unset',
        description: 'Unset a config option',
        type: ApplicationCommandOptionType.String,
        choices: makeChoices(['role', 'log_channel']),
      },
    ],
  },
  {
    run: runMuteManage,
  },
)

async function runMuteManage(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)

  const oldConfig = await prisma.muteConfig.findUnique({
    where: {
      guildID: guild.id,
    },
  })

  // No options specified, show the current config
  if (getOptionCount(interaction) === 0) {
    if (!oldConfig) {
      return interaction.reply({
        content:
          "You don't have an existing mute config, use `/mute_manage` with options to create one.",
      })
    }

    return interaction.reply({
      content: `Current config:\n${formatConfig({
        config: oldConfig,
        guild,
      })}`,
    })
  }

  const role = interaction.options.getRole('role')
  const logChannel = interaction.options.getChannel('log_channel')
  const unset = interaction.options.getString('unset')

  const toUpsert: Omit<Prisma.MuteConfigCreateInput, 'guildID'> = {
    roleID: unset === 'role' ? null : role?.id ?? oldConfig?.roleID ?? null,
    logChannelID:
      unset === 'log_channel'
        ? null
        : logChannel?.id ?? oldConfig?.logChannelID ?? null,
  }

  const newConfig = await prisma.muteConfig.upsert({
    where: {
      guildID: guild.id,
    },
    create: {
      ...toUpsert,
      guildID: guild.id,
    },
    update: {
      ...toUpsert,
    },
  })

  const config = formatConfig({ config: newConfig, oldConfig, guild })

  return interaction.reply({
    content: `Mute config:\n${config}`,
  })
}

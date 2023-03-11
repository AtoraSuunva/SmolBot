import { ModLogConfig } from '@prisma/client'
import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
} from 'discord.js'
import { getGuild, makeChoices, SleetSlashSubcommand } from 'sleetcord'
import { TextChannelTypes } from '../../util/constants.js'
import { prisma } from '../../util/db.js'
import { formatConfig } from '../../util/format.js'
import { clearCacheFor } from './utils.js'

enum UserUpdate {
  None = 'None',
  Username = 'Username',
  Avatar = 'Avatar',
  Both = 'Both',
}

const userUpdateChoices = makeChoices([
  UserUpdate.None,
  UserUpdate.Username,
  UserUpdate.Avatar,
  UserUpdate.Both,
])

export const edit = new SleetSlashSubcommand(
  {
    name: 'edit',
    description: 'Edit the modlog',
    options: [
      {
        name: 'enabled',
        description: 'Whether modlog is enabled',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'channel',
        description: 'The channel to log to',
        type: ApplicationCommandOptionType.Channel,
        channel_types: TextChannelTypes,
      },
      {
        name: 'member_add',
        description: 'Log new member joins',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'member_add_new',
        description:
          'The time in hours for an account to be marked as "new". 0 to disable.',
        type: ApplicationCommandOptionType.Integer,
        min_value: 0,
      },
      {
        name: 'member_add_invite',
        description: 'Log which invite was used to join',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'member_welcome',
        description: 'Log when a member is welcomed',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'member_remove',
        description: 'Log when a member leaves (or is kicked)',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'member_remove_roles',
        description: 'Log the roles a member had when they left',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'member_ban',
        description: 'Log when a member is banned',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'member_unban',
        description: 'Log when a member is unbanned',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'user_update',
        description: 'Log when a user is updated',
        type: ApplicationCommandOptionType.String,
        choices: userUpdateChoices,
      },
      {
        name: 'message_delete',
        description: 'Log when a message is deleted',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'message_delete_bulk',
        description: 'Log when multiple messages are deleted at once',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'channel_create',
        description: 'Log when a channel is created',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'channel_delete',
        description: 'Log when a channel is deleted',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'reaction_actions',
        description: 'Allow to act on modlog entries by reacting',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'automod_action',
        description: 'Log when an automod action by this bot is taken',
        type: ApplicationCommandOptionType.Boolean,
      },
    ],
  },
  {
    run: handleEdit,
  },
)

async function handleEdit(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)
  const { options } = interaction
  const enabled = options.getBoolean('enabled')
  const channel = options.getChannel('channel')
  const memberAdd = options.getBoolean('member_add')
  const memberAddNew = options.getInteger('member_add_new')
  const memberAddInvite = options.getBoolean('member_add_invite')
  const memberWelcome = options.getBoolean('member_welcome')
  const memberRemove = options.getBoolean('member_remove')
  const memberRemoveRoles = options.getBoolean('member_remove_roles')
  const memberBan = options.getBoolean('member_ban')
  const memberUnban = options.getBoolean('member_unban')
  const userUpdate = options.getString('user_update')
  const messageDelete = options.getBoolean('message_delete')
  const messageDeleteBulk = options.getBoolean('message_delete_bulk')
  const channelCreate = options.getBoolean('channel_create')
  const channelDelete = options.getBoolean('channel_delete')
  const reactionActions = options.getBoolean('reaction_actions')
  const automodAction = options.getBoolean('automod_action')

  const oldSettings = await prisma.modLogConfig.findFirst({
    where: {
      guildID: guild.id,
    },
  })

  const channelID = channel?.id ?? oldSettings?.channelID
  if (!channelID) {
    interaction.reply({
      content: 'Please specify a channel to log to.',
      ephemeral: true,
    })
    return
  }

  const mergedSettings: Omit<ModLogConfig, 'updatedAt'> = {
    guildID: guild.id,
    enabled: enabled ?? oldSettings?.enabled ?? false,
    channelID,
    memberAdd: memberAdd ?? oldSettings?.memberAdd ?? false,
    memberAddNew: memberAddNew ?? oldSettings?.memberAddNew ?? 0,
    memberAddInvite: memberAddInvite ?? oldSettings?.memberAddInvite ?? false,
    memberWelcome: memberWelcome ?? oldSettings?.memberWelcome ?? false,
    memberRemove: memberRemove ?? oldSettings?.memberRemove ?? false,
    memberRemoveRoles:
      memberRemoveRoles ?? oldSettings?.memberRemoveRoles ?? false,
    memberBan: memberBan ?? oldSettings?.memberBan ?? false,
    memberUnban: memberUnban ?? oldSettings?.memberUnban ?? false,
    userUpdate: userUpdate ?? oldSettings?.userUpdate ?? UserUpdate.None,
    messageDelete: messageDelete ?? oldSettings?.messageDelete ?? false,
    messageDeleteBulk:
      messageDeleteBulk ?? oldSettings?.messageDeleteBulk ?? false,
    channelCreate: channelCreate ?? oldSettings?.channelCreate ?? false,
    channelDelete: channelDelete ?? oldSettings?.channelDelete ?? false,
    reactionActions: reactionActions ?? oldSettings?.reactionActions ?? false,
    automodAction: automodAction ?? oldSettings?.automodAction ?? false,
  }

  await prisma.modLogConfig.upsert({
    where: {
      guildID: guild.id,
    },
    update: mergedSettings,
    create: mergedSettings,
  })

  clearCacheFor(guild)

  interaction.reply({
    content: `New settings:\n${formatConfig(guild, mergedSettings)}`,
  })
}

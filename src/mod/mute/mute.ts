import {
  ActionRowBuilder,
  type AnyThreadChannel,
  type APIRole,
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  AuditLogEvent,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  type ChatInputCommandInteraction,
  Collection,
  type CommandInteraction,
  type Guild,
  type GuildAuditLogsEntry,
  GuildMember,
  type GuildTextBasedChannel,
  type InteractionCallbackResponse,
  InteractionContextType,
  MessageFlags,
  type OverwriteData,
  OverwriteType,
  type PartialGuildMember,
  type PartialTextBasedChannelFields,
  type PermissionResolvable,
  type Role,
  time,
  User,
  type UserContextMenuCommandInteraction,
} from 'discord.js'
import { DateTime } from 'luxon'
import {
  botHasPermissionsGuard,
  formatUser,
  getGuild,
  getMembersOrUsers,
  inGuildGuard,
  PreRunError,
  SleetSlashCommand,
  SleetUserCommand,
} from 'sleetcord'
import { baseLogger, notNullish, SECOND } from 'sleetcord-common'

import type { Prisma } from '../../generated/prisma/client.js'
import { prisma } from '../../helpers/db.js'
import { plural, responseMessageLink } from '../../helpers/format.js'

const mutedRoles = ['muted', 'mute', 'foreboden', 'roleban', 'rolebanned', 'jail', 'jailed']

const muteLogger = baseLogger.child({ module: 'mute' })

type NonThreadGuildTextBasedChannel = Exclude<GuildTextBasedChannel, AnyThreadChannel>

const DELETE_TIME = 3

export const mute = new SleetSlashCommand(
  {
    name: 'mute',
    description: 'Mutes a user',
    default_member_permissions: ['ManageRoles'],
    contexts: [InteractionContextType.Guild],
    integration_types: [ApplicationIntegrationType.GuildInstall],
    options: [
      {
        name: 'members',
        description: 'The members to mute',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: 'reason',
        description: 'The reason for the mute',
        type: ApplicationCommandOptionType.String,
      },
      {
        name: 'ephemeral',
        description: 'Only show the result to you (default: False)',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'channel',
        description:
          'The channel to mute the user in, if you want to join a user to an existing muted session',
        type: ApplicationCommandOptionType.Channel,
        channel_types: [ChannelType.GuildText],
      },
      {
        name: 'separate_channels',
        description:
          'Whether to create a separate channel for each muted user, overrides `channel` (default: false)',
        type: ApplicationCommandOptionType.Boolean,
      },
    ],
  },
  {
    run: (i) => handleChatInput(i, 'mute'),
    guildMemberUpdate: handleGuildMemberUpdate,
    guildMemberAdd: handleGuildMemberAdd,
    guildMemberRemove: handleGuildMemberRemove,
    interactionCreate: async (i) => {
      if (i.isButton() && i.inGuild()) {
        const [cId, userId] = i.customId.split(':')

        if (cId !== DELETE_CHANNEL_ID) {
          return
        }

        const channel = await i.guild?.channels.fetch(i.channelId).catch(() => null)

        if (i.user.id !== userId && !channel?.permissionsFor(i.user)?.has('ManageChannels')) {
          await i.reply({
            content: "You don't have permission to delete the channel.",
            flags: MessageFlags.Ephemeral,
          })
          return
        }

        if (!channel?.isTextBased()) {
          await i.reply({
            content: "That isn't a text channel, or the channel doesn't exist anymore.",
            flags: MessageFlags.Ephemeral,
          })
          return
        }

        const inTime = time(DateTime.now().plus({ seconds: DELETE_TIME }).toUnixInteger(), 'R')
        await i.reply(`Deleting channel '${channel.name}' ${inTime}`)
        setTimeout(() => channel.delete('Muted channel cleanup'), DELETE_TIME * SECOND)
      }
    },
  },
)

export const mute_menu = new SleetUserCommand(
  {
    name: 'Mute',
    default_member_permissions: ['ManageRoles'],
    contexts: [InteractionContextType.Guild],
    integration_types: [ApplicationIntegrationType.GuildInstall],
  },
  {
    run: (i) => handleUserCommand(i, 'mute'),
  },
)

export const unmute = new SleetSlashCommand(
  {
    name: 'unmute',
    description: 'Unmutes a user',
    default_member_permissions: ['ManageRoles'],
    contexts: [InteractionContextType.Guild],
    integration_types: [ApplicationIntegrationType.GuildInstall],
    options: [
      {
        name: 'members',
        type: ApplicationCommandOptionType.String,
        description: 'The members to mute',
        required: true,
      },
      {
        name: 'reason',
        type: ApplicationCommandOptionType.String,
        description: 'The reason for the mute',
      },
      {
        name: 'ephemeral',
        type: ApplicationCommandOptionType.Boolean,
        description: 'Only show the result to you (default: False)',
      },
    ],
  },
  {
    run: (i) => handleChatInput(i, 'unmute'),
  },
)

export const unmute_menu = new SleetUserCommand(
  {
    name: 'Unmute',
    default_member_permissions: ['ManageRoles'],
    contexts: [InteractionContextType.Guild],
    integration_types: [ApplicationIntegrationType.GuildInstall],
  },
  {
    run: (i) => handleUserCommand(i, 'unmute'),
  },
)

export const muteCommands = [mute, mute_menu, unmute, unmute_menu]

type MuteAction = 'mute' | 'unmute'

interface MuteSuccess {
  member: GuildMember | User
  roles?: Role[]
}

interface MuteFail extends MuteSuccess {
  reason: string
}

interface ActionResult {
  succeeded: MuteSuccess[]
  failed: MuteFail[]
  addendum?: string
  components?: ActionRowBuilder<ButtonBuilder>[]
}

async function handleChatInput(interaction: ChatInputCommandInteraction, action: MuteAction) {
  inGuildGuard(interaction)

  const reason = interaction.options.getString('reason')
  const ephemeral = interaction.options.getBoolean('ephemeral') ?? false
  // oxlint-disable-next-line typescript/no-unnecessary-type-assertion we need to narrow the type down
  const channel = interaction.options.getChannel('channel') as NonThreadGuildTextBasedChannel | null
  const separateChannels = interaction.options.getBoolean('separate_channels') ?? false

  const response = await interaction.deferReply({
    flags: ephemeral ? MessageFlags.Ephemeral : '0',
    withResponse: true,
  })

  const members = await getMembersOrUsers(interaction, 'members', true)

  return runMute({
    interaction,
    action,
    members,
    reason,
    ephemeral,
    channel,
    separateChannels,
    response,
  })
}

async function handleUserCommand(
  interaction: UserContextMenuCommandInteraction,
  action: MuteAction,
) {
  inGuildGuard(interaction)
  const guild = await getGuild(interaction, true)
  const target = interaction.targetMember

  const members = [
    target instanceof GuildMember
      ? target
      : await guild.members.fetch(interaction.targetId).catch(() => null),
  ].filter(notNullish)

  return runMute({
    interaction,
    action,
    members,
    reason: null,
    ephemeral: false,
    channel: null,
    separateChannels: false,
  })
}

const CONFIG_DEFAULT: Prisma.MuteConfigGetPayload<true> = {
  guildID: '',
  logChannelID: null,
  roleID: null,
  separateUsers: false,
  categoryID: null,
  channelTopic: null,
  nameTemplate: 'muted-{user}',
  maxChannels: 25,
  starterMessage: null,
}

const DELETE_CHANNEL_ID = 'delete_channel'
const createDeleteChannelRow = (userId?: string | null) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${DELETE_CHANNEL_ID}:${userId ?? ''}`)
      .setLabel('Delete Channel')
      .setStyle(ButtonStyle.Danger),
  )

interface InteractionMuteParams {
  interaction: CommandInteraction
  action: MuteAction
  members: (GuildMember | User)[]
  reason?: string | null
  ephemeral?: boolean
  channel?: NonThreadGuildTextBasedChannel | null
  separateChannels?: boolean
  response?: InteractionCallbackResponse | null
}

async function runMute({
  interaction,
  action,
  members,
  reason = null,
  ephemeral = false,
  channel = null,
  separateChannels = false,
  response = null,
}: InteractionMuteParams) {
  inGuildGuard(interaction)
  const guild = await getGuild(interaction, true)

  await botHasPermissionsGuard(interaction, ['ManageRoles'])

  const linkResponse =
    response ??
    (await interaction.deferReply({
      flags: ephemeral ? MessageFlags.Ephemeral : '0',
      withResponse: true,
    }))

  const result = await muteMembers({
    guild,
    executor: interaction.member as GuildMember,
    action,
    members,
    reason,
    ephemeral,
    sourceChannel: interaction.channel,
    messageLink: responseMessageLink(interaction, linkResponse),
    muteChannel: channel,
    separateChannels,
  })

  if (result.success) {
    await interaction.editReply({
      content: result.content ?? null,
      components: result.components ?? [],
    })
  } else {
    await interaction.editReply({
      content: result.content,
    })
  }
}

interface MuteMembersParams {
  /** The guild where the action is taking place */
  guild: Guild
  /** The member executing the action */
  executor: GuildMember
  /** The action to perform (mute or unmute) */
  action: MuteAction
  /** The members to be muted or unmuted */
  members: (GuildMember | User)[]
  /** The reason for the action */
  reason?: string | null
  /** Whether the action should be ephemeral */
  ephemeral?: boolean
  /** The channel where the action was initiated */
  sourceChannel?: GuildTextBasedChannel | null
  /** The link to the message associated with the action */
  messageLink?: string | null
  /** The channel where the mute should be applied */
  muteChannel?: NonThreadGuildTextBasedChannel | null
  /** Whether to mute members in separate channels */
  separateChannels?: boolean
}

interface MuteMembersSuccess {
  success: true
  members: (GuildMember | User)[]
  content?: string
  components?: ActionRowBuilder<ButtonBuilder>[]
}

interface MuteMembersFailure {
  success: false
  members: (GuildMember | User)[]
  content: string
}

type MuteResult = MuteMembersSuccess | MuteMembersFailure

/**
 * Mute or unmute the specified members
 */
export async function muteMembers({
  guild,
  executor,
  action,
  members,
  reason = null,
  ephemeral = false,
  sourceChannel = null,
  messageLink = null,
  muteChannel = null,
  separateChannels = false,
}: MuteMembersParams): Promise<MuteResult> {
  const me = await guild.members.fetchMe()
  const myPermissions = me.permissions

  const missingPermissions = myPermissions.missing(['ManageRoles'])

  if (missingPermissions.length > 0) {
    throw new PreRunError(`I'm missing these permissions: ${missingPermissions.join(', ')}`)
  }

  if (members.length === 0) {
    return {
      success: false,
      members,
      content: `Failed to resolve any members to ${action}, use @ mentions or IDs`,
    }
  }

  const capitalAction = action === 'mute' ? 'Muted' : 'Unmuted'

  const config: Prisma.MuteConfigGetPayload<true> =
    (await prisma.muteConfig.findUnique({
      where: {
        guildID: guild.id,
      },
    })) ?? CONFIG_DEFAULT

  const userHighestRole = executor.roles.highest
  const myHighestRole = me.roles.highest
  const mutedRole = findMutedRole(guild, config.roleID)

  if (!mutedRole) {
    const content = `No muted role found, specify a role using \`/mute_manage\` or set up a role with one of the following names: \`${mutedRoles.join(
      '`, `',
    )}\``

    return {
      success: false,
      members,
      content,
    }
  }

  const isOwner = executor.id === guild.ownerId
  if (!isOwner && mutedRole.comparePositionTo(userHighestRole) > 0) {
    return {
      success: false,
      members,
      content: `Your highest role needs to be higher than ${mutedRole} to ${action}`,
    }
  }

  const toAction: (GuildMember | User)[] = []
  const earlyFailed: MuteFail[] = []

  for (const memberOrUser of members) {
    if (memberOrUser instanceof User) {
      const userHasStoredRoles = await isMuted(guild, memberOrUser)

      if (action === 'mute' && userHasStoredRoles) {
        earlyFailed.push({ member: memberOrUser, reason: 'Already muted.' })
      } else if (action === 'unmute' && !userHasStoredRoles) {
        earlyFailed.push({ member: memberOrUser, reason: 'Not muted.' })
      } else {
        toAction.push(memberOrUser)
      }

      continue
    }

    const hasMutedRole = memberOrUser.roles.cache.get(mutedRole.id)
    const shouldHaveRole = action === 'unmute'

    if (memberOrUser.id === me.user.id) {
      earlyFailed.push({ member: memberOrUser, reason: 'This is me.' })
    } else if (memberOrUser.id === executor.user.id) {
      earlyFailed.push({ member: memberOrUser, reason: `You cannot ${action} yourself.` })
    } else if (!isOwner && memberOrUser.roles.highest.position >= userHighestRole.position) {
      earlyFailed.push({
        member: memberOrUser,
        reason: `You cannot ${action} someone with a higher or equal role to you.`,
      })
    } else if (memberOrUser.roles.highest.position >= myHighestRole.position) {
      earlyFailed.push({
        member: memberOrUser,
        reason: `I cannot ${action} someone with a higher or equal role to me.`,
      })
    } else if (hasMutedRole && !shouldHaveRole) {
      const userHasStoredRoles = await isMuted(guild, memberOrUser)

      if (userHasStoredRoles) {
        toAction.push(memberOrUser)
      } else {
        earlyFailed.push({ member: memberOrUser, reason: 'Already muted.' })
      }
    } else if (!hasMutedRole && shouldHaveRole) {
      earlyFailed.push({ member: memberOrUser, reason: 'Not muted.' })
    } else {
      toAction.push(memberOrUser)
    }
  }

  if (toAction.length === 0) {
    return {
      success: false,
      members,
      content: `No valid users to ${action}.\n${formatFails(earlyFailed)}`,
    }
  }

  const formattedReason = `${capitalAction} by ${executor.displayName}${reason ? ` for "${reason}"` : ''}`

  const { succeeded, failed, addendum, components } = await (action === 'mute'
    ? muteAction({
        guild,
        config,
        members: toAction,
        mutedRole,
        reason: formattedReason,
        channel: muteChannel,
        separateChannels: separateChannels,
        executor: executor,
      })
    : unmuteAction({
        guild,
        config,
        members: toAction,
        mutedRole,
        reason: formattedReason,
        sourceChannel,
        executor: executor,
      }))

  const totalFails = [...earlyFailed, ...failed]
  const succ = succeeded.length > 0 ? `\n${formatSuccesses(guild, succeeded, action)}` : ' Nobody!'
  const fail = totalFails.length > 0 ? `\n**Failed:**\n${formatFails(totalFails)}` : ''

  const content = `**${capitalAction}:**${succ}${fail}`
  const url = messageLink ?? sourceChannel
  const byLine = `By ${formatUser(executor)}${url ? ` in ${url}` : ''}${ephemeral ? ' (ephemeral)' : ''}`

  const formattedAddendum = addendum && addendum.length > 0 ? `\n${addendum}` : ''

  const formattedContentSuccess = `${content}\n${byLine}${formattedAddendum}`

  if (succeeded.length > 0) {
    if (formattedContentSuccess.length >= 1950) {
      await sendToLogChannel(guild, config.logChannelID, {
        content: `${capitalAction} ${plural('user', toAction.length)}\n${byLine}\nDetails are too long to show here, see attachment:`,
        files: [
          {
            name: `${action}-${Date.now()}.txt`,
            attachment: formattedContentSuccess,
          },
        ],
        allowedMentions: { parse: [] },
      })
    } else {
      await sendToLogChannel(guild, config.logChannelID, {
        content: `${content}\n${byLine}${formattedAddendum}`,
        allowedMentions: { parse: [] },
      })
    }
  }

  const formattedFeedback = `${content}${formattedAddendum}`

  if (formattedFeedback.length >= 1950) {
    return {
      success: true,
      members: succeeded.map((s) => s.member),
      content: `**${capitalAction}**: ${plural('user', succeeded.length)}\nDetails are too long to show here, see attachment:`,
      components: components ?? [],
    }
  }

  return {
    success: true,
    members: succeeded.map((s) => s.member),
    content: formattedFeedback,
    components: components ?? [],
  }
}

/**
 * Handle someone else (like a mod or a bot) removing the user's muted role.
 *
 * If we muted the user (and have roles stored for them), we'll restore their roles so that it works out in the end
 */
async function handleGuildMemberUpdate(
  _oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember,
) {
  const { guild } = newMember

  const config: Prisma.MuteConfigGetPayload<true> =
    (await prisma.muteConfig.findUnique({
      where: {
        guildID: guild.id,
      },
    })) ?? CONFIG_DEFAULT

  const mutedRole = findMutedRole(guild, config.roleID)

  // If we can't find the muted role then guild isn't configured
  if (!mutedRole) return
  // If the user has the muted role then we shouldn't restore anything
  if (newMember.roles.cache.get(mutedRole.id)) return

  if (!(await isMuted(guild, newMember))) return

  // We're in the middle of removing the muted role ourselves, ignore this
  const key = `${guild.id}:${newMember.id}`
  if (userBeingRestored.has(key)) {
    return
  }

  const entry = await findUserResponsibleForRemovingMute(newMember, mutedRole.id)

  // It's me! I already log unmutes
  if (entry?.executorId === newMember.client.user.id) {
    return
  }

  const { restoredRoles } = await restoreRoles(
    guild,
    newMember,
    mutedRole,
    `${entry?.executor?.username ?? '<unknown user>'} removed the muted role`,
  )

  const content = formatSuccesses(guild, [{ member: newMember, roles: restoredRoles }], 'unmute')
  const byLine = entry
    ? `By ${entry.executor ? formatUser(entry.executor) : '<unknown user>'}${entry.reason ? ` for "${entry.reason}"` : ''}`
    : 'By <unknown user>'

  await sendToLogChannel(guild, config.logChannelID, {
    content: `**Muted Role removed, restored previous roles:**\n${content}\n${byLine}`,
    allowedMentions: { parse: [] },
  })
}

async function handleGuildMemberAdd(member: GuildMember) {
  // Check if the user was muted and rejoined while muted
  // If they were muted, we need to reapply the muted role (including creating/rejoining them to mute channels)
  const muteInfo = await fetchMuteInfo(member.guild, member)

  // User not muted
  if (!muteInfo) return

  const { guild } = member
  const config: Prisma.MuteConfigGetPayload<true> =
    (await prisma.muteConfig.findUnique({
      where: {
        guildID: guild.id,
      },
    })) ?? CONFIG_DEFAULT

  const mutedRole = findMutedRole(guild, config.roleID)

  // If we can't find the muted role then guild isn't configured
  if (!mutedRole) return

  // Someone who was muted left, got unmuted by a mod, then rejoined
  // We should unmute them and log it
  if (muteInfo.removeOnJoin) {
    const executor = muteInfo.executor
      ? await guild.members.fetch(muteInfo.executor).catch(() => null)
      : null

    // Unmute them
    const { restoredRoles } = await restoreRoles(
      guild,
      member,
      mutedRole,
      `Unmute by ${executor?.user.username ?? '<unknown user>'}`,
    )

    const content = formatSuccesses(guild, [{ member, roles: restoredRoles }], 'unmute')
    const byLine = executor
      ? `By ${formatUser(executor)}${muteInfo.reason ? ` for "${muteInfo.reason}"` : ''}`
      : 'By <unknown user>'

    await sendToLogChannel(guild, config.logChannelID, {
      content: `**Unmuted user rejoined:**\n${content}\n${byLine}`,
      allowedMentions: { parse: [] },
    })

    return
  }

  const channel = muteInfo.muteChannel
    ? ((await guild.channels
        .fetch(muteInfo.muteChannel)
        .catch(() => null)) as NonThreadGuildTextBasedChannel | null)
    : null

  const res = await muteAction({
    guild,
    config,
    members: [member],
    mutedRole,
    reason: 'User rejoined while muted',
    channel,
    separateChannels: false,
  })

  if (channel) {
    await channel.send({
      content: `📥 ${formatUser(member)} rejoined while muted.`,
    })
  }

  const content = formatSuccesses(guild, res.succeeded, 'mute')

  await sendToLogChannel(guild, config.logChannelID, {
    content: `**Muted user rejoined:**\n${content}`,
    allowedMentions: { parse: [] },
  })
}

async function handleGuildMemberRemove(member: GuildMember | PartialGuildMember) {
  const muteInfo = await fetchMuteInfo(member.guild, member)

  if (!muteInfo || muteInfo.removeOnJoin) return

  if (muteInfo.muteChannel) {
    const channel = await member.guild.channels.fetch(muteInfo.muteChannel).catch(() => null)

    if (channel?.isTextBased()) {
      await channel.send({
        content: `📤 ${formatUser(member)} left the server while muted.`,
      })

      const otherUsers = await prisma.memberMutes.count({
        where: {
          guildID: member.guild.id,
          muteChannel: channel.id,
          userID: { not: member.user.id },
        },
      })

      if (otherUsers === 0) {
        await channel.send({
          content:
            'There are no more muted users left in this channel. You can now delete this channel.',
          components: [createDeleteChannelRow(muteInfo.executor)],
        })
      }
    }
  }
}

const WITHIN_TIME = 5 * SECOND

async function findUserResponsibleForRemovingMute(
  member: GuildMember,
  mutedRoleId: string,
): Promise<GuildAuditLogsEntry<AuditLogEvent.MemberRoleUpdate> | null> {
  const { guild } = member
  const me = await guild.members.fetchMe()

  if (!me.permissions.has('ViewAuditLog')) return null

  const auditLogs = await guild.fetchAuditLogs({
    type: AuditLogEvent.MemberRoleUpdate,
  })

  const now = Date.now()
  const timeLimit = now - WITHIN_TIME

  const entry = auditLogs.entries.find((entry) => {
    return (
      // Created within the last 5 seconds
      entry.createdTimestamp > timeLimit &&
      // Modified our member
      entry.targetId === member.id &&
      // Removed the muted role
      entry.changes.some(
        (change) =>
          change.key === '$remove' && (change.new as APIRole[])?.some((r) => r.id === mutedRoleId),
      )
    )
  })

  return entry ?? null
}

async function sendToLogChannel(
  guild: Guild,
  logChannelID: string | null,
  payload: Parameters<PartialTextBasedChannelFields['send']>[0],
) {
  if (!logChannelID) return

  const logChannel = await guild.channels.fetch(logChannelID).catch(() => null)

  if (logChannel?.isTextBased()) {
    await logChannel.send(payload)
  }
}

const TO_ALLOW: PermissionResolvable = ['ViewChannel', 'SendMessages']

interface MuteActionParams {
  guild: Guild
  config: Prisma.MuteConfigGetPayload<true>
  members: (GuildMember | User)[]
  mutedRole: Role
  reason: string
  channel?: NonThreadGuildTextBasedChannel | null
  separateChannels?: boolean
  executor?: GuildMember | null
}

async function muteAction({
  guild,
  config,
  members,
  mutedRole,
  reason,
  channel = null,
  separateChannels = false,
  executor = null,
}: MuteActionParams): Promise<ActionResult> {
  if (members.length === 0) {
    return { succeeded: [], failed: [] }
  }

  const succeeded: MuteSuccess[] = []
  const failed: MuteFail[] = []

  if (separateChannels) {
    // Recursively call muteAction on every single member individually, and then we can combine all the
    // ActionResults at the end
    const addendums: string[] = []
    const components: ActionRowBuilder<ButtonBuilder>[] = []

    const results = await Promise.all(
      members.map((member) =>
        muteAction({
          guild,
          config,
          members: [member],
          mutedRole,
          reason,
          channel: null,
          separateChannels: false,
          executor,
        }),
      ),
    )

    // Combine the results
    results.forEach((result) => {
      succeeded.push(...result.succeeded)
      failed.push(...result.failed)
      if (result.addendum) addendums.push(result.addendum)
      if (result.components) components.push(...result.components)
    })

    return {
      succeeded,
      failed,
      addendum: addendums.join('\n'),
      components,
    }
  }

  let hasAtLeastOneMember = false

  for (const memberOrUser of members) {
    const isMember = memberOrUser instanceof GuildMember

    if (isMember) {
      hasAtLeastOneMember = true
    }

    try {
      if (isMember && memberOrUser.roles.cache.has(mutedRole.id) && channel === null) {
        throw new Error('Already muted')
      }

      const previousRoles = await storeRoles(guild, memberOrUser, [mutedRole], executor)

      if (isMember) {
        const keepRoles = memberOrUser.roles.cache.filter((r) => r.managed).toJSON()
        await memberOrUser.roles.set([...keepRoles, mutedRole], reason)
      }

      succeeded.push({ member: memberOrUser, roles: previousRoles })
    } catch (e) {
      muteLogger.error(e, 'Failed to mute %s %s', isMember ? 'member' : 'user', memberOrUser.id)
      failed.push({ member: memberOrUser, reason: String(e) })
    }
  }

  if (
    // no need for a channel if nobody is in the server
    !hasAtLeastOneMember ||
    // no need to create new channels if we're not separating users
    !config.separateUsers ||
    // can't create a channel without a category
    !config.categoryID ||
    // no need to create a channel if nobody was successfully muted
    succeeded.length === 0
  ) {
    return { succeeded, failed }
  }

  // Create channels
  const category = await guild.channels.fetch(config.categoryID).catch(() => null)
  const formattedExecutor = formatUser(executor ?? (await guild.members.fetchMe()))
  let addendum = ''

  if (!category || category.type !== ChannelType.GuildCategory) {
    addendum = `The configured \`muted_category\` ${!category ? 'does not exist' : 'is not a category'}.`
  } else {
    try {
      let mutedChannel = channel

      // Check if we're at the cap of channels created in the category
      const limit = config.maxChannels ?? 50
      if (category.children.cache.size >= limit) {
        // Use the last channel in the category
        mutedChannel = category.children.cache
          .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
          .last() as NonThreadGuildTextBasedChannel
      }

      if (!mutedChannel) {
        const firstUser = succeeded[0].member
        const user = getUser(firstUser)

        const replaceMap = new Map<string, string>([
          ['{user}', user.username],
          ['{user_id}', user.id],
        ])

        let channelName = (config.nameTemplate ?? 'muted-{user}').replaceAll(
          /{\w+}/g,
          (match) => replaceMap.get(match) ?? match,
        )

        if (channelName.includes('{i}')) {
          const existingChannels = await guild.channels
            .fetch()
            .then((c) => Array.from(c.values()).map((c) => c?.name))

          // We already checked if we were at the channel limit, so we know there's a free name available
          // i.e. if there's 25+ channels and the limit is 25, then the fallback logic above already picked a muteChannel and this block never runs
          // if there's 24 channels and the limit is 25, there's at least 1 channel name that's free
          // even if the names aren't sequential or continuous (e.g. muted-1, muted-2, muted-4), there's always a free name (muted-3) that this block will find
          // in a sort-of "empty pigeonhole" scenario
          for (let i = 1; i <= limit; i++) {
            const possibleName = channelName.replace('{i}', i.toString())
            if (!existingChannels.includes(possibleName)) {
              channelName = possibleName
              break
            }
          }
        }

        // Get the parent category perms instead of adding an extra API call to sync
        const parentPermissions = category.permissionOverwrites.cache.map<OverwriteData>(
          (o) => o.toJSON() as OverwriteData,
        )

        mutedChannel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: category,
          reason: 'User muted',
          topic: config.channelTopic ?? '',
          permissionOverwrites: parentPermissions,
        })

        // We deny view channel to the muted role since user overrides take precedence and
        // allowing any muted user to view the channel defeats the purpose of separating users
        // (while mods might want to show muted users some other channels in that category)

        // Ideally, we'd calculate the perms and pass it to the channel create call, but Discord
        // doesn't like that and will return a "Missing Permissions" error even if we have every
        // permission needed (and allows us to edit in the exact same changes later!)
        // You can get around this by giving the bot admin, but that's a solution in the same way as
        // "installing a 'door' by blowing up your wall" is a solution

        // Block other muted users so they can't see the channel
        // Add in the user overrides so they can see the channel
        const cached = mutedChannel.permissionOverwrites.cache
        const newOverwrites = cached.map<OverwriteData>((o) => o.toJSON() as OverwriteData)

        newOverwrites.push({
          id: mutedRole.id,
          type: OverwriteType.Role,
          deny: cached.get(mutedRole.id)?.deny.add('ViewChannel') ?? 'ViewChannel',
        })

        newOverwrites.push(
          ...succeeded.map<OverwriteData>((s) => ({
            id: s.member.id,
            type: OverwriteType.Member,
            allow: cached.get(s.member.id)?.allow.add(TO_ALLOW) ?? TO_ALLOW,
            deny: cached.get(s.member.id)?.deny.remove(TO_ALLOW) ?? [],
          })),
        )

        await mutedChannel.permissionOverwrites.set(newOverwrites)

        if (config.starterMessage) {
          const mentions = members.map((m) => m.toString()).join(', ')

          const replaceMap = new Map<string, string>([
            ['{mention}', mentions],
            ['{executor}', formattedExecutor],
            ['{reason}', reason ?? 'No reason provided'],
          ])

          const starterMessage = config.starterMessage.replaceAll(
            /{\w+}/g,
            (match) => replaceMap.get(match) ?? match,
          )

          if (starterMessage.length >= 1950) {
            await mutedChannel.send({
              files: [
                {
                  name: 'starter-message.txt',
                  attachment: starterMessage,
                },
              ],
            })
          } else {
            await mutedChannel.send(starterMessage)
          }
        }
      }

      const formattedLog = `🔇 ${succeeded.map((s) => formatUser(s.member)).join(', ')} ${succeeded.length > 1 ? 'have' : 'has'} been muted by ${formattedExecutor}`

      if (formattedLog.length >= 1950) {
        await mutedChannel.send({
          files: [
            {
              name: 'mute-log.txt',
              attachment: formattedLog,
            },
          ],
        })
      } else {
        await mutedChannel.send(formattedLog)
      }

      await prisma.memberMutes.updateMany({
        where: {
          guildID: guild.id,
          userID: { in: succeeded.map((s) => getUser(s.member).id) },
        },
        data: {
          muteChannel: mutedChannel.id,
          executor: executor?.user.id ?? null,
        },
      })
    } catch (e) {
      addendum = `Failed to create muted channel: ${String(e)}`
    }
  }

  return {
    succeeded,
    failed,
    addendum,
  }
}

interface UnmuteActionParams {
  guild: Guild
  config: Prisma.MuteConfigGetPayload<true>
  members: (GuildMember | User)[]
  mutedRole: Role
  reason: string
  sourceChannel?: GuildTextBasedChannel | null
  executor?: GuildMember | null
}

async function unmuteAction({
  guild,
  config,
  members,
  mutedRole,
  reason,
  sourceChannel = null,
  executor,
}: UnmuteActionParams): Promise<ActionResult> {
  if (members.length === 0) {
    return { succeeded: [], failed: [] }
  }

  const succeeded: MuteSuccess[] = []
  const failed: MuteFail[] = []
  const existingMutedChannels = new Set<string>()
  const channelToUsersMap = new Map<string, (GuildMember | User)[]>()

  for (const member of members) {
    try {
      const { restoredRoles, muteChannel } = await restoreRoles(guild, member, mutedRole, reason)
      succeeded.push({ member, roles: restoredRoles })

      if (muteChannel) {
        existingMutedChannels.add(muteChannel)
        const members = channelToUsersMap.get(muteChannel) ?? []
        members.push(member)
        channelToUsersMap.set(muteChannel, members)
      }
    } catch (e) {
      muteLogger.error(e, 'Failed to unmute user %s', member.id)
      failed.push({ member, reason: String(e) })
    }
  }

  if (!config.separateUsers || !config.categoryID || succeeded.length === 0) {
    return { succeeded, failed }
  }

  const formattedExecutor = formatUser(executor ?? (await guild.members.fetchMe()))
  let addendum = ''
  const components: ActionRowBuilder<ButtonBuilder>[] = []

  for (const existingChannel of existingMutedChannels) {
    const otherUsers = await prisma.memberMutes.count({
      where: {
        guildID: guild.id,
        muteChannel: existingChannel,
        userID: { notIn: succeeded.map((s) => getUser(s.member).id) },
      },
    })

    const channel = await guild.channels.fetch(existingChannel).catch(() => null)

    if (!channel || !channel.isTextBased() || channel.isThread()) {
      continue
    }

    const mutedMembers = channelToUsersMap.get(existingChannel) ?? []

    for (const member of mutedMembers) {
      await channel.permissionOverwrites.delete(member)
    }

    if (channel?.isTextBased()) {
      const formattedLog = `🔊 ${mutedMembers
        .map((s) => formatUser(s))
        .join(
          ', ',
        )} ${mutedMembers.length > 1 ? 'have' : 'has'} been unmuted by ${formattedExecutor}`

      if (formattedLog.length >= 1950) {
        await channel.send({
          files: [
            {
              name: 'unmute-log.txt',
              attachment: formattedLog,
            },
          ],
        })
      } else {
        await channel.send(formattedLog)
      }

      if (otherUsers === 0) {
        if (channel.id === sourceChannel?.id) {
          addendum =
            'Every muted user in this channel has been unmuted. You can now delete this channel.'
          components.push(createDeleteChannelRow(executor?.id))
        } else {
          await channel.send({
            content:
              'Every muted user in this channel has been unmuted. You can now delete this channel.',
            components: [createDeleteChannelRow(executor?.id)],
          })
        }
      }
    }
  }

  return { succeeded, failed, addendum, components }
}

/**
 * Store a member's current roles in the database, filters out the @'everyone role, managed roles, and any provided roles
 *
 * Accepts a user (not in the server), storing an empty array for their roles.
 *
 * @param memberOrUser The member to store roles for
 * @param ignoreRoles Roles to ignore and not store
 * @returns The roles that were stored
 */
async function storeRoles(
  guild: Guild,
  memberOrUser: GuildMember | User,
  ignoreRoles: Role[],
  executor: GuildMember | null = null,
): Promise<Role[]> {
  const { previousRoles } = (await fetchMuteInfo(guild, memberOrUser)) ?? {
    previousRoles: [],
  }
  const roles =
    memberOrUser instanceof GuildMember
      ? memberOrUser.roles.cache.filter((r) => !ignoreRoles.includes(r) && validRole(r, guild))
      : new Collection<string, Role>()

  await setStoredRoles(
    guild,
    memberOrUser,
    [...(previousRoles ?? []), ...roles.map((r) => r.id)],
    executor,
  )

  return roles.toJSON()
}

/**
 * Technically a mutex if you squint and also barely know what a mutex is
 *
 * The process of restoring a mute causes a guild member update, but if the bot tries to restore again
 * while the first restore is still happening it causes bad things. There is no point in queueing them
 * (since on success we'd just find out we have nothing to restore, and on failure conditions probably aren't
 * gonna magically align instantly after aside from API one-offs)
 */
const userBeingRestored = new Set<string>()

interface MuteRestoreInfo {
  restoredRoles: Role[]
  muteChannel: string | null
}

async function restoreRoles(
  guild: Guild,
  memberOrUser: GuildMember | User,
  mutedRole: Role,
  reason?: string,
): Promise<MuteRestoreInfo> {
  const key = `${guild.id}:${memberOrUser.id}`
  if (userBeingRestored.has(key)) {
    return {
      restoredRoles: [],
      muteChannel: null,
    }
  }

  userBeingRestored.add(key)

  try {
    const previousMute = await fetchMuteInfo(guild, memberOrUser)

    if (!previousMute) {
      // Remove the muted role if they have it just in case
      if (memberOrUser instanceof GuildMember && memberOrUser.roles.cache.has(mutedRole.id)) {
        await memberOrUser.roles.remove(mutedRole, reason)
      }

      return { restoredRoles: [], muteChannel: null }
    }

    const { previousRoles, muteChannel } = previousMute

    // Resolve all the roles in case one of them has since been deleted or something
    const resolvedStoredRoles = await Promise.all(
      previousRoles.map(async (r) => guild.roles.fetch(r).catch(() => null)),
    )

    const applyRoles = resolvedStoredRoles
      .filter(isDefined)
      .filter((r) => validRole(r, guild) && r.id !== mutedRole.id)

    // If the user isn't on the server, mark that we'll restore the roles on join and pretend it happened
    if (!(memberOrUser instanceof GuildMember)) {
      await markToRemoveOnJoin(guild, memberOrUser)
      return {
        restoredRoles: applyRoles,
        muteChannel,
      }
    }

    await memberOrUser.roles.remove(mutedRole, reason)
    muteLogger.info('Restoring roles for %s; %o; %o', memberOrUser.id, previousRoles, applyRoles)
    await memberOrUser.roles.add(applyRoles, reason)
    await deleteMuteInfo(guild, memberOrUser)
    return {
      restoredRoles: applyRoles,
      muteChannel,
    }
  } finally {
    userBeingRestored.delete(key)
  }
}

function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null
}

function validRole(role: Role, guild: Guild): boolean {
  return role.id !== guild.id && !role.managed
}

function formatSuccesses(guild: Guild, succeeded: MuteSuccess[], action: MuteAction): string {
  return (
    succeeded
      .map((success) => {
        const { member, roles } = success
        const act = action === 'mute' ? 'Removed' : 'Restored'

        const validRoles = (roles ?? []).filter((r) => validRole(r, guild))

        const restored =
          validRoles.length > 0
            ? `**${act}:** ${formatRoles(validRoles)}`
            : `No roles ${act.toLowerCase()}`

        const inGuild = member instanceof GuildMember
        const footer = inGuild
          ? ''
          : `\n> -# User not in server, ${action} will be applied if they rejoin`

        return `> ${formatUser(member, { mention: true })}\n> -# ${restored}${footer}`
      })
      .join('\n') || 'Nobody'
  )
}

function formatFails(failed: MuteFail[]): string {
  return failed
    .map((fail) => `> ${formatUser(fail.member, { mention: true })}\n> -# ${fail.reason}`)
    .join('\n')
}

function formatRoles(roles: Role[]): string {
  if (roles.length === 0) return 'None'

  return roles
    .toSorted((a, b) => b.position - a.position)
    .map((r) => r.toString())
    .join(', ')
}

const ROLE_SEPARATOR = ' '

interface MuteInfo {
  previousRoles: string[]
  muteChannel: string | null
  executor: string | null
  removeOnJoin: boolean
  reason: string | null
}

async function fetchMuteInfo(
  guild: Guild,
  memberOrUser: GuildMember | PartialGuildMember | User,
): Promise<MuteInfo | null> {
  const info = await prisma.memberMutes.findUnique({
    select: {
      previousRoles: true,
      muteChannel: true,
      executor: true,
      removeOnJoin: true,
      reason: true,
    },
    where: {
      guildID_userID: {
        guildID: guild.id,
        userID: memberOrUser.id,
      },
    },
  })

  return !info
    ? null
    : {
        previousRoles: info.previousRoles.split(ROLE_SEPARATOR).filter((v) => v.trim() !== ''),
        muteChannel: info.muteChannel,
        executor: info.executor,
        removeOnJoin: info.removeOnJoin,
        reason: info.reason,
      }
}

function markToRemoveOnJoin(guild: Guild, memberOrUser: GuildMember | User) {
  return prisma.memberMutes.updateMany({
    where: {
      guildID: guild.id,
      userID: memberOrUser.id,
    },
    data: {
      removeOnJoin: true,
    },
  })
}

function isMuted(guild: Guild, memberOrUser: GuildMember | User): Promise<boolean> {
  return prisma.memberMutes
    .count({
      where: {
        guildID: guild.id,
        userID: memberOrUser.id,
      },
    })
    .then((count) => count > 0)
}

function setStoredRoles(
  guild: Guild,
  memberOrUser: GuildMember | User,
  roles: string[],
  executor: GuildMember | null = null,
) {
  const previousRoles = roles.join(ROLE_SEPARATOR)

  return prisma.memberMutes.upsert({
    where: {
      guildID_userID: {
        guildID: guild.id,
        userID: memberOrUser.id,
      },
    },
    update: {
      previousRoles,
      executor: executor?.user.id ?? null,
      removeOnJoin: false,
    },
    create: {
      guildID: guild.id,
      userID: memberOrUser.id,
      previousRoles,
      executor: executor?.user.id ?? null,
    },
  })
}

function deleteMuteInfo(guild: Guild, memberOrUser: GuildMember | User) {
  return prisma.memberMutes.deleteMany({
    where: {
      guildID: guild.id,
      userID: memberOrUser.id,
    },
  })
}

function findMutedRole(guild: Guild, roleID: string | null): Role | null {
  return (
    guild.roles.cache.find((r) => roleID === r.id) ??
    guild.roles.cache.find((r) => mutedRoles.includes(r.name.toLowerCase())) ??
    null
  )
}

function getUser(memberOrUser: GuildMember | User): User {
  return memberOrUser instanceof GuildMember ? memberOrUser.user : memberOrUser
}

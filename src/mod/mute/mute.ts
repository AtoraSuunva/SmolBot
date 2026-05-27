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
  type CommandInteraction,
  type Guild,
  type GuildAuditLogsEntry,
  GuildMember,
  type GuildTextBasedChannel,
  InteractionContextType,
  MessageFlags,
  type OverwriteData,
  OverwriteType,
  type PartialGuildMember,
  type PartialTextBasedChannelFields,
  type PermissionResolvable,
  type Role,
  time,
  type UserContextMenuCommandInteraction,
} from 'discord.js'
import { DateTime } from 'luxon'
import {
  botHasPermissionsGuard,
  formatUser,
  getGuild,
  getMembers,
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
            content: "You don't have permission to do that.",
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
  member: GuildMember
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
  const members = await getMembers(interaction, 'members', true)
  const reason = interaction.options.getString('reason')
  const ephemeral = interaction.options.getBoolean('ephemeral') ?? false
  const channel = interaction.options.getChannel('channel') as NonThreadGuildTextBasedChannel | null
  const separateChannels = interaction.options.getBoolean('separate_channels') ?? false

  return runMute({
    interaction,
    action,
    members,
    reason,
    ephemeral,
    channel,
    separateChannels,
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
  members: GuildMember[]
  reason?: string | null
  ephemeral?: boolean
  channel?: NonThreadGuildTextBasedChannel | null
  separateChannels?: boolean
}

async function runMute({
  interaction,
  action,
  members,
  reason = null,
  ephemeral = false,
  channel = null,
  separateChannels = false,
}: InteractionMuteParams) {
  inGuildGuard(interaction)
  const guild = await getGuild(interaction, true)

  await botHasPermissionsGuard(interaction, ['ManageRoles'])

  const response = await interaction.deferReply({
    flags: ephemeral ? MessageFlags.Ephemeral : '0',
    withResponse: true,
  })

  const result = await muteMembers({
    guild,
    executor: interaction.member as GuildMember,
    action,
    members,
    reason,
    ephemeral,
    sourceChannel: interaction.channel,
    messageLink: responseMessageLink(interaction, response),
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
  members: GuildMember[]
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
  members: GuildMember[]
  content?: string
  components?: ActionRowBuilder<ButtonBuilder>[]
}

interface MuteMembersFailure {
  success: false
  members: GuildMember[]
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
      content: `Failed to resolve any members to ${action}, are they still in the server?`,
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

  const toAction: GuildMember[] = []
  const earlyFailed: MuteFail[] = []

  for (const member of members) {
    const hasMutedRole = member.roles.cache.get(mutedRole.id)
    const shouldHaveRole = action === 'unmute'

    if (member.id === me.user.id) {
      earlyFailed.push({ member, reason: 'This is me.' })
    } else if (member.id === executor.user.id) {
      earlyFailed.push({ member, reason: `You cannot ${action} yourself.` })
    } else if (!isOwner && member.roles.highest.position >= userHighestRole.position) {
      earlyFailed.push({
        member,
        reason: `You cannot ${action} someone with a higher or equal role to you.`,
      })
    } else if (member.roles.highest.position >= myHighestRole.position) {
      earlyFailed.push({
        member,
        reason: `I cannot ${action} someone with a higher or equal role to me.`,
      })
    } else if (hasMutedRole && !shouldHaveRole) {
      const userHasStoredRoles = await isMuted(member)

      if (userHasStoredRoles) {
        toAction.push(member)
      } else {
        earlyFailed.push({ member, reason: 'Already muted.' })
      }
    } else if (!hasMutedRole && shouldHaveRole) {
      earlyFailed.push({ member, reason: 'Not muted.' })
    } else {
      toAction.push(member)
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
        config,
        members: toAction,
        mutedRole,
        reason: formattedReason,
        channel: muteChannel,
        separateChannels: separateChannels,
        executor: executor,
      })
    : unmuteAction({
        config,
        members: toAction,
        mutedRole,
        reason: formattedReason,
        sourceChannel,
        executor: executor,
      }))

  const totalFails = [...earlyFailed, ...failed]
  const succ = succeeded.length > 0 ? `\n${formatSuccesses(succeeded, action)}` : ' Nobody!'
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

  if (!isMuted(newMember)) return

  const entry = await findUserResponsibleForRemovingMute(newMember, mutedRole.id)

  const { restoredRoles } = await restoreRoles(
    newMember,
    mutedRole,
    `${entry?.executor?.username ?? '<unknown user>'} removed the muted role`,
  )

  if (restoredRoles.length === 0) return

  const content = formatSuccesses([{ member: newMember, roles: restoredRoles }], 'unmute')
  const byLine = entry
    ? `By ${entry.executor ? formatUser(entry.executor) : '<unknown user>'}${entry.reason ? ` for "${entry.reason}"` : ''}`
    : 'By <unknown user>'

  await sendToLogChannel(guild, config.logChannelID, {
    content: `Muted Role removed, restored previous roles:\n${content}\n${byLine}`,
    allowedMentions: { parse: [] },
  })
}

async function handleGuildMemberAdd(member: GuildMember) {
  // Check if the user was muted and rejoined while muted
  // If they were muted, we need to reapply the muted role (including creating/rejoining them to mute channels)
  const muteInfo = await fetchMuteInfo(member)

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

  const channel = muteInfo.muteChannel
    ? ((await guild.channels
        .fetch(muteInfo.muteChannel)
        .catch(() => null)) as NonThreadGuildTextBasedChannel | null)
    : null

  await muteAction({
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
}

async function handleGuildMemberRemove(member: GuildMember | PartialGuildMember) {
  const muteInfo = await fetchMuteInfo(member)

  if (!muteInfo) return

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
  config: Prisma.MuteConfigGetPayload<true>
  members: GuildMember[]
  mutedRole: Role
  reason: string
  channel?: NonThreadGuildTextBasedChannel | null
  separateChannels?: boolean
  executor?: GuildMember | null
}

async function muteAction({
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

  for (const member of members) {
    try {
      if (member.roles.cache.has(mutedRole.id) && channel === null) {
        throw new Error('Already muted')
      }

      const previousRoles = await storeRoles(member, [mutedRole], executor)
      const keepRoles = member.roles.cache.filter((r) => r.managed).toJSON()
      await member.roles.set([...keepRoles, mutedRole], reason)
      succeeded.push({ member, roles: previousRoles })
    } catch (e) {
      muteLogger.error(e, 'Failed to mute user %s', member.id)
      failed.push({ member, reason: String(e) })
    }
  }

  if (!config.separateUsers || !config.categoryID || succeeded.length === 0) {
    return { succeeded, failed }
  }

  // Create channels
  const guild = members[0].guild
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

        let channelName = (config.nameTemplate ?? 'muted-{user}')
          .replace('{user}', firstUser.user.username)
          .replace('{user_id}', firstUser.user.id)

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
          const starterMessage = config.starterMessage
            .replace('{mention}', members.map((m) => m.user).join(', '))
            .replace('{executor}', formattedExecutor)

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
          userID: { in: succeeded.map((s) => s.member.user.id) },
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
  config: Prisma.MuteConfigGetPayload<true>
  members: GuildMember[]
  mutedRole: Role
  reason: string
  sourceChannel?: GuildTextBasedChannel | null
  executor?: GuildMember
}

async function unmuteAction({
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
  const channelToMembersMap = new Map<string, GuildMember[]>()

  for (const member of members) {
    try {
      const { restoredRoles, muteChannel } = await restoreRoles(member, mutedRole, reason)
      succeeded.push({ member, roles: restoredRoles })

      if (muteChannel) {
        existingMutedChannels.add(muteChannel)
        const members = channelToMembersMap.get(muteChannel) ?? []
        members.push(member)
        channelToMembersMap.set(muteChannel, members)
      }
    } catch (e) {
      muteLogger.error(e, 'Failed to unmute user %s', member.id)
      failed.push({ member, reason: String(e) })
    }
  }

  if (!config.separateUsers || !config.categoryID || succeeded.length === 0) {
    return { succeeded, failed }
  }

  const guild = members[0].guild
  const formattedExecutor = formatUser(executor ?? (await guild.members.fetchMe()))
  let addendum = ''
  const components: ActionRowBuilder<ButtonBuilder>[] = []

  for (const existingChannel of existingMutedChannels) {
    const otherUsers = await prisma.memberMutes.count({
      where: {
        guildID: guild.id,
        muteChannel: existingChannel,
        userID: { notIn: succeeded.map((s) => s.member.user.id) },
      },
    })

    const channel = await guild.channels.fetch(existingChannel).catch(() => null)

    if (!channel || !channel.isTextBased() || channel.isThread()) {
      continue
    }

    const mutedMembers = channelToMembersMap.get(existingChannel) ?? []

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
 * Store a member's current roles in the database, filters out the @everyone role, managed roles, and any provided roles
 * @param member The member to store roles for
 * @param ignoreRoles Roles to ignore and not store
 * @returns The roles that were stored
 */
async function storeRoles(
  member: GuildMember,
  ignoreRoles: Role[],
  executor: GuildMember | null = null,
): Promise<Role[]> {
  const { guild } = member
  const { previousRoles } = (await fetchMuteInfo(member)) ?? {
    previousRoles: [],
  }
  const roles = member.roles.cache.filter((r) => !ignoreRoles.includes(r) && validRole(r, guild))

  await setStoredRoles(member, [...(previousRoles ?? []), ...roles.map((r) => r.id)], executor)

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
  member: GuildMember,
  mutedRole: Role,
  reason?: string,
): Promise<MuteRestoreInfo> {
  const key = `${member.guild.id}:${member.id}`
  if (userBeingRestored.has(key)) {
    return {
      restoredRoles: [],
      muteChannel: null,
    }
  }

  userBeingRestored.add(key)

  try {
    const { guild } = member
    const previousMute = await fetchMuteInfo(member)

    if (!previousMute) {
      return { restoredRoles: [], muteChannel: null }
    }

    const { previousRoles, muteChannel } = previousMute

    // Resolve all the roles in case one of them has since been deleted or something
    const resolvedStoredRoles = await Promise.all(
      previousRoles.map(async (r) => member.guild.roles.fetch(r).catch(() => null)),
    )

    const applyRoles = resolvedStoredRoles
      .filter(isDefined)
      .filter((r) => validRole(r, guild) && r.id !== mutedRole.id)

    await member.roles.remove(mutedRole, reason)
    muteLogger.info('Restoring roles for %s; %o; %o', member.id, previousRoles, applyRoles)
    await member.roles.add(applyRoles, reason)
    await deleteMuteInfo(member)
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

function formatSuccesses(succeeded: MuteSuccess[], action: MuteAction): string {
  return (
    succeeded
      .map((success) => {
        const { member, roles } = success
        const { guild } = member
        const act = action === 'mute' ? 'Removed' : 'Restored'

        const validRoles = (roles ?? []).filter((r) => validRole(r, guild))

        const restored =
          validRoles.length > 0
            ? `**${act}:** ${formatRoles(validRoles)}`
            : `No roles ${act.toLowerCase()}`

        return `> ${formatUser(member, { mention: true })}\n> -# ${restored}`
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
}

async function fetchMuteInfo(member: GuildMember | PartialGuildMember): Promise<MuteInfo | null> {
  const info = await prisma.memberMutes.findUnique({
    select: {
      previousRoles: true,
      muteChannel: true,
      executor: true,
    },
    where: {
      guildID_userID: {
        guildID: member.guild.id,
        userID: member.user.id,
      },
    },
  })

  return !info
    ? null
    : {
        previousRoles: info.previousRoles.split(ROLE_SEPARATOR).filter((v) => v.trim() !== ''),
        muteChannel: info.muteChannel,
        executor: info.executor,
      }
}

function isMuted(member: GuildMember): Promise<boolean> {
  return prisma.memberMutes
    .count({
      where: {
        guildID: member.guild.id,
        userID: member.user.id,
      },
    })
    .then((count) => count > 0)
}

function setStoredRoles(member: GuildMember, roles: string[], executor: GuildMember | null = null) {
  const previousRoles = roles.join(ROLE_SEPARATOR)

  return prisma.memberMutes.upsert({
    where: {
      guildID_userID: {
        guildID: member.guild.id,
        userID: member.user.id,
      },
    },
    update: {
      previousRoles,
      executor: executor?.user.id ?? null,
    },
    create: {
      guildID: member.guild.id,
      userID: member.user.id,
      previousRoles,
      executor: executor?.user.id ?? null,
    },
  })
}

function deleteMuteInfo(member: GuildMember) {
  return prisma.memberMutes.deleteMany({
    where: {
      guildID: member.guild.id,
      userID: member.user.id,
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

import {
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  codeBlock,
  InteractionContextType,
  type Awaitable,
  type ChatInputCommandInteraction,
  type GuildMember,
  type PermissionResolvable,
  type User,
  type VoiceState,
} from 'discord.js'
import {
  escapeAllMarkdown,
  formatUser,
  getMember,
  SleetSlashCommand,
  SleetSlashSubcommand,
} from 'sleetcord'

import { prisma } from '../helpers/db.js'

const mute = new SleetSlashSubcommand(
  {
    name: 'mute',
    description: 'Server mute a user',
    options: [
      {
        name: 'user',
        description: 'The user to server mute',
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      {
        name: 'reason',
        description: 'The reason for server muting the user',
        type: ApplicationCommandOptionType.String,
        max_length: 256,
      },
    ],
  },
  {
    run: makeVCAction('mute'),
  },
)

const unmute = new SleetSlashSubcommand(
  {
    name: 'unmute',
    description: 'Server unmute a user',
    options: [
      {
        name: 'user',
        description: 'The user to server unmute',
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      {
        name: 'reason',
        description: 'The reason for server unmuting the user',
        type: ApplicationCommandOptionType.String,
        max_length: 256,
      },
    ],
  },
  {
    run: makeVCAction('unmute'),
  },
)

const deafen = new SleetSlashSubcommand(
  {
    name: 'deafen',
    description: 'Server deafen a user',
    options: [
      {
        name: 'user',
        description: 'The user to server deafen',
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      {
        name: 'reason',
        description: 'The reason for server deafening the user',
        type: ApplicationCommandOptionType.String,
        max_length: 256,
      },
    ],
  },
  {
    run: makeVCAction('deafen'),
  },
)

const undeafen = new SleetSlashSubcommand(
  {
    name: 'undeafen',
    description: 'Server undeafen a user',
    options: [
      {
        name: 'user',
        description: 'The user to server undeafen',
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      {
        name: 'reason',
        description: 'The reason for server undeafening the user',
        type: ApplicationCommandOptionType.String,
        max_length: 256,
      },
    ],
  },
  {
    run: makeVCAction('undeafen'),
  },
)

export const vc = new SleetSlashCommand(
  {
    name: 'vc',
    description: 'Voice channel commands',
    options: [mute, unmute, deafen, undeafen],
    contexts: [InteractionContextType.Guild],
    integration_types: [ApplicationIntegrationType.GuildInstall],
    default_member_permissions: ['MuteMembers', 'DeafenMembers'],
  },
  {
    voiceStateUpdate: handleVoiceStateUpdate,
  },
)

/** Verbs you can do to members */
type VCVerb = 'mute' | 'unmute' | 'deafen' | 'undeafen'
/** An action applied to a guild member */
type VCAction = (member: GuildMember, reason: string) => Awaitable<unknown>

/** The past tense form of each VC verb, for messages */
const VerbPast: Record<VCVerb, string> = {
  mute: 'muted',
  unmute: 'unmuted',
  deafen: 'deafened',
  undeafen: 'undeafened',
}

/** Map a VC verb to its corresponding action */
const ActionMap: Record<VCVerb, VCAction> = {
  mute: (m, r) => !m.voice.serverMute && m.voice.setMute(true, r),
  unmute: (m, r) => m.voice.serverMute && m.voice.setMute(false, r),
  deafen: (m, r) => !m.voice.serverDeaf && m.voice.setDeaf(true, r),
  undeafen: (m, r) => m.voice.serverDeaf && m.voice.setDeaf(false, r),
}

const PermissionMap: Record<VCVerb, PermissionResolvable> = {
  mute: 'MuteMembers',
  unmute: 'MuteMembers',
  deafen: 'DeafenMembers',
  undeafen: 'DeafenMembers',
}

/** A map of which VC verbs cancel each other out (e.g., mute will cancel an unmute) */
const VerbCancels: Record<VCVerb, VCVerb> = {
  mute: 'unmute',
  unmute: 'mute',
  deafen: 'undeafen',
  undeafen: 'deafen',
}

/**
 * We can't action a user who isn't in a voice channel, so if they arent in a VC we need to wait until they join one.
 *
 * This function also checks for duplicate actions (we can't mute someone twice) and for actions that cancel each other out (e.g., muting and unmuting).
 * @param member The member to action
 * @param verb The action to apply to the member
 * @param reason The reason for the action, if provided
 * @returns A promise that resolves when the action has been queued
 */
async function queueVCAction(
  member: GuildMember,
  verb: VCVerb,
  executor: User,
  reason: string | null,
): Promise<string> {
  // First check for duplicate actions, i.e. someone else is already unmuting the user
  const existingAction = await prisma.vcActionQueue.findFirst({
    where: {
      userID: member.id,
      guildID: member.guild.id,
      verb,
    },
  })

  if (existingAction) {
    const executor = await member.client.users.fetch(existingAction.executorID)

    return `**Already queued!**\n> This user is already queued to be ${VerbPast[verb]} by ${formatUser(executor, { mention: false })}${reason ? ' for ' + reason : ''}.`
  }

  // Check if our action cancels out an existing action
  const cancelingVerb = VerbCancels[verb]
  const cancelingAction = await prisma.vcActionQueue.findFirst({
    where: {
      userID: member.id,
      guildID: member.guild.id,
      verb: cancelingVerb,
    },
  })

  if (cancelingAction) {
    await prisma.vcActionQueue.delete({
      where: {
        userID_guildID_verb: {
          userID: member.id,
          guildID: member.guild.id,
          verb: cancelingVerb,
        },
      },
    })

    const executor = await member.client.users.fetch(cancelingAction.executorID)

    return `**Cancelled queued ${cancelingVerb}!**\n> This user was queued to be ${VerbPast[cancelingVerb]} by ${formatUser(executor, { mention: false })}${reason ? ' for ' + reason : ''}`
  }

  await prisma.vcActionQueue.create({
    data: {
      userID: member.id,
      guildID: member.guild.id,
      verb,
      executorID: executor.id,
      reason,
    },
  })

  return `**Queued ${verb}!**\n> Member not in voice channel\n> Queued server ${verb} for ${formatUser(member.user)}${reason ? ` for reason: ${reason}` : ''}.\n> This action will be applied the next time the user joins a voice channel.`
}

async function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
  // User still in VC
  if (oldState.channelId === newState.channelId) return
  // User left VC
  if (!newState.channelId) return

  // User joined VC
  const guild = newState.guild
  const member = newState.member ?? (await guild.members.fetch(newState.id))

  const queuedActions = await prisma.vcActionQueue.findMany({
    where: {
      userID: member.id,
      guildID: guild.id,
    },
  })

  for (const action of queuedActions) {
    try {
      const executor = await guild.client.users.fetch(action.executorID)
      const auditLogReason = `By ${formatUser(executor, { markdown: false, mention: false })}${action.reason ? ` for reason: ${action.reason}` : ''}`

      const botHasPermission =
        guild?.members.me?.permissions.has(PermissionMap[action.verb as VCVerb]) ?? false

      if (member.manageable && botHasPermission) {
        await ActionMap[action.verb as VCVerb](member, auditLogReason)
      }

      await prisma.vcActionQueue.delete({
        where: {
          userID_guildID_verb: {
            userID: member.id,
            guildID: guild.id,
            verb: action.verb,
          },
        },
      })
    } catch {}
  }
}

function makeVCAction(verb: VCVerb) {
  return async (interaction: ChatInputCommandInteraction) => {
    const member = await getMember(interaction, 'user', true)
    const reason = interaction.options.getString('reason')

    if (!member.manageable) {
      await interaction.reply({
        content: `I cannot ${verb} ${formatUser(member.user)} because their highest role is above mine.`,
        allowedMentions: { parse: [] },
      })
      return
    }

    const botHasPermission =
      interaction.guild?.members.me?.permissions.has(PermissionMap[verb]) ?? false

    if (!botHasPermission) {
      await interaction.reply({
        content: `I do not have permission to ${verb} members.`,
        allowedMentions: { parse: [] },
      })
      return
    }

    if (member.voice.channel) {
      const auditLogReason = `By ${formatUser(interaction.user, { markdown: false })}${reason ? ` for reason: ${reason}` : ''}`
      await ActionMap[verb](member, auditLogReason)
      await interaction.reply({
        content: `Server ${VerbPast[verb]} ${formatUser(member.user)}${reason ? ` for reason: ${reason}` : ''}`,
        allowedMentions: { users: [member.id] },
      })
      return
    }

    try {
      const result = await queueVCAction(member, verb, interaction.user, reason)

      await interaction.reply({
        content: result,
        allowedMentions: { users: [member.id] },
      })
    } catch (error) {
      const errorMessage = escapeAllMarkdown(Error.isError(error) ? error.message : String(error))

      await interaction.reply({
        content: `An error occurred while queuing the VC action:\n${codeBlock('js', errorMessage)}`,
        allowedMentions: { parse: [] },
      })
    }
  }
}

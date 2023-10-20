import { ActionLog, ActionLogConfig } from '@prisma/client'
import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
  Guild,
  User,
} from 'discord.js'
import {
  AutocompleteHandler,
  SleetSlashCommand,
  formatUser,
  getGuild,
} from 'sleetcord'
import { prisma } from '../../util/db.js'
import { capitalize, plural } from '../../util/format.js'
import { sleep } from '../../util/functions.js'
import {
  ActionLogEntry,
  collapseSequence,
  fetchActionLogConfigFor,
  formatToLog,
  markActionlogArchiveDirty,
  resolveIDs,
} from './utils.js'

const MAX_IDS = 50

const actionIDAutocomplete: AutocompleteHandler<string> = async ({
  interaction,
  value,
}) => {
  const { guild, client } = interaction

  if (!guild) {
    return []
  }

  try {
    if (value === '') {
      const latestActions = await prisma.actionLog.findMany({
        where: {
          guildID: guild.id,
          validUntil: null,
        },
        orderBy: {
          actionID: 'desc',
        },
        take: 5,
      })

      return (
        await Promise.all(
          latestActions.map(async (action) => ({
            name: `#${action.actionID} [${capitalize(action.action)}] — ${
              action.userID
                ? formatUser(await client.users.fetch(action.userID), {
                    markdown: false,
                    mention: false,
                    escape: false,
                  })
                : 'unknown user'
            }`.slice(0, 100),
            value: action.actionID.toString(),
          })),
        )
      ).filter((option) => option.value.length <= 100)
    }

    const ids = await resolveIDs(guild, value, MAX_IDS)

    if (ids.length > MAX_IDS) {
      return [
        {
          name: `Too many IDs to reason at once, try <= ${MAX_IDS}`,
          value: '',
        },
      ]
    }

    const collapsed = collapseSequence(ids)

    if (collapsed.length > 100) {
      return [
        {
          name: `Result is too long to display!`,
          value: '',
        },
      ]
    }

    return [
      {
        name: collapsed,
        value: collapsed,
      },
    ]
  } catch (error) {
    return []
  }
}

export const actionReason = new SleetSlashCommand(
  {
    name: 'reason',
    description: 'Reason an action',
    dm_permission: false,
    default_member_permissions: [
      'BanMembers',
      'KickMembers',
      'ModerateMembers',
    ],
    options: [
      {
        name: 'action_id',
        description: 'The ID of the action to edit',
        type: ApplicationCommandOptionType.String,
        autocomplete: actionIDAutocomplete,
        required: true,
      },
      {
        name: 'reason',
        description: 'The reason for the warning',
        type: ApplicationCommandOptionType.String,
        required: true,
        max_length: 1500,
      },
      {
        name: 'ephemeral',
        description:
          'Whether to only show the response to you (default: false)',
        type: ApplicationCommandOptionType.Boolean,
      },
    ],
  },
  {
    run: warningsEditRun,
  },
)

async function warningsEditRun(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)

  const actionString = interaction.options.getString('action_id', true)
  const reason = interaction.options.getString('reason', true)
  const ephemeral = interaction.options.getBoolean('ephemeral') ?? false

  await interaction.deferReply({
    ephemeral,
  })

  const actionIDs = await resolveIDs(guild, actionString)
  const config = await fetchActionLogConfigFor(guild.id, true)

  if (actionIDs.length === 0) {
    await interaction.editReply({
      content: 'No actions to reason found',
    })
    return
  }

  const results: EditActionLog[] = []

  for (const id of actionIDs) {
    results.push(await editAction(guild, config, id, reason, interaction.user))
    if (results.length !== actionIDs.length) {
      // Add a small delay before doing the next one to avoid ratelimiting as hard
      await sleep(500)
    }
  }

  if (results.length === 0) {
    await interaction.editReply({
      content: 'Somehow, nothing managed to be reasoned',
    })
    return
  }

  const log: string[] = []
  const successes = results.filter((result) => result.success)

  if (successes.length > 0) {
    const formattedAction =
      successes.length === 1
        ? `action #${successes[0].id}`
        : plural('action', successes.length)

    log.push(`Changed reason for ${formattedAction} to${formatReason(reason)}`)
    await markActionlogArchiveDirty(guild.id)
  }

  const failures = results.length - successes.length

  if (failures > 0) {
    log.push(
      `Failed to reason ${plural('action', failures)}:\n> ${results
        .filter((result): result is EditActionLogFailure => !result.success)
        .map((result) => `**${result.id}**: ${result.message}`)
        .join('\n> ')}`,
    )
  }

  const formattedContent = log.join('\n\n')
  let content = formattedContent
  const files = []

  if (formattedContent.length > 2000) {
    content = 'See attached file for reason log'
    files.push({
      name: 'reason-log.txt',
      attachment: Buffer.from(formattedContent),
    })
  }

  await interaction.editReply({
    content,
    files,
  })
}

function formatReason(reason: string): string {
  if (reason.includes('\n')) {
    return `:\n> ${reason.replace(/\n/g, '\n> ')}`
  } else {
    return ` "${reason}"`
  }
}

interface EditActionLogSuccess {
  id: number
  success: true
}

interface EditActionLogFailure {
  id: number
  success: false
  message: string
}

type EditActionLog = EditActionLogSuccess | EditActionLogFailure

async function editAction(
  guild: Guild,
  config: ActionLogConfig,
  actionID: number,
  reason: string,
  reasonBy: User,
): Promise<EditActionLog> {
  const oldAction = await prisma.actionLog.findFirst({
    where: {
      guildID: guild.id,
      actionID,
      validUntil: null,
    },
  })

  if (!oldAction) {
    return {
      id: actionID,
      success: false,
      message: 'This action does not exist',
    }
  }

  const mergedAction: ActionLog = {
    action: oldAction.action,
    guildID: guild.id,
    actionID: actionID,
    version: oldAction.version,
    userID: oldAction.userID,
    reason: reason,
    reasonByID: reasonBy.id,
    moderatorID: oldAction.moderatorID ?? reasonBy.id,
    channelID: oldAction.channelID,
    messageID: oldAction.messageID,
    createdAt: oldAction.createdAt,
    validUntil: null,
  }

  await updateActionLog(guild.id, mergedAction)

  const entry: ActionLogEntry = {
    id: oldAction.actionID,
    action: mergedAction.action as ActionLogEntry['action'],
    user: mergedAction.userID
      ? await guild.client.users.fetch(mergedAction.userID)
      : null,
    reason: mergedAction.reason,
    reasonBy: mergedAction.reasonByID
      ? await guild.client.users.fetch(mergedAction.reasonByID)
      : null,
    responsibleModerator: mergedAction.moderatorID
      ? await guild.client.users.fetch(mergedAction.moderatorID)
      : null,
  }

  if (oldAction.messageID === null) {
    // Either wasn't logged before or failed to log
    // In which case we should create a new log
    if (config.logChannelID === null) {
      // Although if there is no log channel, we can't do anything
      return {
        id: actionID,
        success: false,
        message: 'This action was not logged and no log channel is configured',
      }
    }

    const logChannel = guild.channels.cache.get(config.logChannelID)

    if (!logChannel?.isTextBased()) {
      return {
        id: actionID,
        success: false,
        message: 'The log channel is not a text channel',
      }
    }

    const log = formatToLog(entry)

    try {
      await logChannel
        .send({
          content: log,
          allowedMentions: {
            parse: [],
          },
        })
        .then((message) =>
          prisma.actionLog.update({
            where: {
              guildID_actionID_version: {
                guildID: guild.id,
                actionID: oldAction.actionID,
                version: oldAction.version + 1,
              },
            },
            data: {
              messageID: message.id,
            },
          }),
        )
    } catch (e) {
      return {
        id: actionID,
        success: false,
        message: `Failed to log action to channel: ${e}`,
      }
    }

    return {
      id: actionID,
      success: true,
    }
  }

  const channel = guild.channels.cache.get(oldAction.channelID)

  if (!channel?.isTextBased()) {
    return {
      id: actionID,
      success: false,
      message:
        'The channel this action was logged to seems to have been deleted, or is not a text channel',
    }
  }

  if (
    guild.members.me &&
    !channel.permissionsFor(guild.members.me).has('SendMessages')
  ) {
    return {
      id: actionID,
      success: false,
      message:
        'I do not have permission to send messages in the channel this action was logged to',
    }
  }

  try {
    await channel.messages.edit(oldAction.messageID, {
      content: formatToLog(entry),
      allowedMentions: {
        parse: [],
      },
    })
  } catch (e) {
    return {
      id: actionID,
      success: false,
      message: `Failed to edit message: ${e}`,
    }
  }

  return {
    id: actionID,
    success: true,
  }
}

/**
 * Create a new action version by marking the old ones as all now invalid and creating a new one that's valid
 *
 * The newly inserted action automatically has a version 1 greater than the latest
 * @param guildID The guild ID that the action belongs to
 * @param newAction The new action to create
 * @returns The newly created action entry
 */
export async function updateActionLog(
  guildID: string,
  newAction: ActionLog,
): Promise<ActionLog> {
  // Transaction since we shouldn't be able to mark the old log as expired while erroring on the new log
  return await prisma.$transaction(async (tx) => {
    // Mark the old action as having expired just now
    await tx.actionLog.updateMany({
      where: {
        guildID,
        actionID: newAction.actionID,
        validUntil: null,
      },
      data: {
        validUntil: new Date(),
      },
    })

    // Get the latest version number
    const latestVersion = await tx.actionLog.findFirst({
      where: {
        guildID,
        actionID: newAction.actionID,
      },
      select: {
        version: true,
      },
      orderBy: {
        version: 'desc',
      },
    })

    const latestNumber = (latestVersion?.version ?? 0) + 1

    // Then make the new action
    return tx.actionLog.create({
      data: {
        ...newAction,
        version: latestNumber,
      },
    })
  })
}

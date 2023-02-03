import {
  ApplicationCommandOptionType,
  ChannelType,
  ChatInputCommandInteraction,
  escapeMarkdown,
  PrivateThreadChannel,
  PublicThreadChannel,
  ThreadEditData,
} from 'discord.js'
import { formatUser, getChannel, SleetSlashCommand } from 'sleetcord'

export const lock_thread = new SleetSlashCommand(
  {
    name: 'lock_thread',
    description: 'Locks a thread',
    dm_permission: false,
    default_member_permissions: ['ManageThreads'],
    options: [
      {
        name: 'reason',
        description: 'The reason for locking the thread',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: 'thread',
        description: 'The thread to lock',
        type: ApplicationCommandOptionType.Channel,
        channel_types: [
          ChannelType.PublicThread,
          ChannelType.PrivateThread,
          ChannelType.AnnouncementThread,
        ],
      },
      {
        name: 'ephemeral',
        description:
          'Send lock feedback as an ephemeral message (default: True)',
        type: ApplicationCommandOptionType.Boolean,
      },
    ],
  },
  {
    run: runLockThread,
  },
)

const logToChannels: Record<string, string> = {
  // parent channel: log channel
  '969756986319183923': '982924658355625994',
  '986100624892514374': '982924658355625994',
}

async function logToChannel(
  interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
  thread: PublicThreadChannel | PrivateThreadChannel,
  reason: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const logChannelId = logToChannels[thread.parentId!]

  if (!logChannelId) return

  const formattedReason = [
    `**Locked Thread:** ${escapeMarkdown(thread.name)}`,
    `**Locked By:** ${formatUser(interaction.user)}`,
    thread.url,
    `**Reason:** ${reason}`,
  ].join('\n')

  const channel = await interaction.guild?.channels.fetch(logChannelId)

  if (!channel || !channel.isTextBased()) {
    return
  }

  return channel.send({ content: formattedReason })
}

async function runLockThread(interaction: ChatInputCommandInteraction) {
  const thread =
    (await getChannel(interaction, 'thread')) ?? interaction.channel
  const reason = interaction.options.getString('reason', true)
  const formattedReason = `Locked by ${interaction.user.tag}: ${reason}`
  const ephemeral = interaction.options.getBoolean('ephemeral') ?? true

  if (interaction.channel?.isThread() && interaction.channel.locked) {
    // We can't reply to interactions in locked threads, it just doesn't work
    return
  }

  if (!thread) {
    return interaction.reply({
      content: 'Please provide a thread to lock',
      ephemeral: true,
    })
  }

  if (!interaction.inGuild()) {
    return interaction.reply({
      content: 'You can only use this command in a server',
      ephemeral: true,
    })
  }

  if (!thread.isThread()) {
    return interaction.reply({
      content: 'You can only lock threads & forum posts',
      ephemeral: true,
    })
  }

  if (thread.archived && thread.locked) {
    return interaction.reply({
      content: 'This thread is already archived & locked',
      ephemeral: true,
    })
  }

  if (!thread.editable) {
    return interaction.reply({
      content: 'I cannot edit this thread',
      ephemeral: true,
    })
  }

  const defer = interaction.deferReply({ ephemeral })

  if (!ephemeral) {
    await defer
    interaction.editReply({
      content: `Locking thread ${thread} for "${reason}"...`,
    })
  }

  try {
    const threadEditData: ThreadEditData = {}

    if (!thread.archived) {
      threadEditData.archived = true
    }

    if (!thread.locked) {
      threadEditData.locked = true
    }

    await thread.edit({
      ...threadEditData,
      reason: formattedReason,
    })
  } catch (error) {
    await defer
    return interaction.editReply({
      content: `An error occurred while locking the thread: ${error}`,
    })
  }

  await logToChannel(interaction, thread, reason)
  await defer

  return interaction.editReply({
    content: `Locked thread ${thread} for "${reason}"`,
  })
}

import {
  ApplicationCommandOptionType,
  ChannelType,
  ChatInputCommandInteraction,
  escapeMarkdown,
  PrivateThreadChannel,
  PublicThreadChannel,
} from 'discord.js'
import { formatUser, getChannel, SleetSlashCommand } from 'sleetcord'

export const lock_post = new SleetSlashCommand(
  {
    name: 'lock_post',
    description: 'Locks a forum post',
    dm_permission: false,
    default_member_permissions: ['ManageThreads'],
    options: [
      {
        name: 'post',
        description: 'The post to lock',
        type: ApplicationCommandOptionType.Channel,
        channel_types: [ChannelType.GuildPublicThread],
        required: true,
      },
      {
        name: 'reason',
        description: 'The reason for locking the post',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
  {
    run: runLockPost,
  },
)

const logToChannels: Record<string, string> = {
  // parent channel: log channel
  '969756986319183923': '982924658355625994',
  '986100624892514374': '982924658355625994',
}

async function logToChannel(
  interaction: ChatInputCommandInteraction<'cached' | 'raw'>,
  post: PublicThreadChannel | PrivateThreadChannel,
  reason: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const logChannelId = logToChannels[post.parentId!]

  if (!logChannelId) return

  const formattedReason = [
    `**Locked Thread:** ${escapeMarkdown(post.name)}`,
    `**Locked By:** ${formatUser(interaction.user)}`,
    post.url,
    `**Reason:** ${reason}`,
  ].join('\n')

  const channel = await interaction.guild?.channels.fetch(logChannelId)

  if (!channel || !channel.isTextBased()) {
    return
  }

  return channel.send({ content: formattedReason })
}

async function runLockPost(interaction: ChatInputCommandInteraction) {
  const post = await getChannel(interaction, 'post', true)
  const reason = interaction.options.getString('reason', true)
  const formattedReason = `Locked by ${interaction.user.tag}: ${reason}`

  if (!interaction.inGuild()) {
    return interaction.reply({
      content: 'You can only use this command in a server',
      ephemeral: true,
    })
  }

  if (!post.isThread()) {
    return interaction.reply({
      content: 'You can only lock forum posts',
      ephemeral: true,
    })
  }

  if (post.locked) {
    return interaction.reply({
      content: 'This post is already locked',
      ephemeral: true,
    })
  }

  const defer = interaction.deferReply({ ephemeral: true })

  try {
    await post.edit({
      archived: true,
      locked: true,
      reason: formattedReason,
    })
  } catch (error) {
    await defer
    return interaction.editReply({
      content: `An error occurred while locking the post: ${error}`,
    })
  }

  await logToChannel(interaction, post, reason)
  await defer

  return interaction.editReply({
    content: `Locked post ${post} for reason ${reason}`,
  })
}

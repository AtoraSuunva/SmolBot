import {
  ApplicationCommandOptionType,
  type AttachmentPayload,
  ChannelType,
  type ChatInputCommandInteraction,
  type ForumChannel,
  InteractionContextType,
  MessageFlags,
  type ThreadChannel,
} from 'discord.js'
import { SleetSlashCommand, SleetSlashSubcommand, getGuild } from 'sleetcord'
import { prisma } from '../util/db.js'
import { formatConfig, makeForumTagFormatter } from '../util/format.js'
import { createTagAutocomplete } from './modmail/ticket/create_button.js'

const enable = new SleetSlashSubcommand(
  {
    name: 'enable',
    description: 'Enable auto tagging for a forum channel',
    options: [
      {
        name: 'forum',
        description: 'The forum channel to auto tag posts in',
        type: ApplicationCommandOptionType.Channel,
        channel_types: [ChannelType.GuildForum],
        required: true,
      },
      {
        name: 'tag',
        description: 'The tag to auto apply',
        type: ApplicationCommandOptionType.String,
        autocomplete: createTagAutocomplete('forum'),
        required: true,
      },
    ],
  },
  {
    run: runEnable,
  },
)

const disable = new SleetSlashSubcommand(
  {
    name: 'disable',
    description: 'Disable auto tagging for a forum channel',
    options: [
      {
        name: 'forum',
        description: 'The forum channel to disable auto tagging for',
        type: ApplicationCommandOptionType.Channel,
        channel_types: [ChannelType.GuildForum],
        required: true,
      },
    ],
  },
  {
    run: runDisable,
  },
)

const config = new SleetSlashSubcommand(
  {
    name: 'config',
    description: 'View all channels with auto tagging enabled',
  },
  {
    run: runConfig,
  },
)

export const auto_tag = new SleetSlashCommand(
  {
    name: 'auto_tag',
    description: 'Configure automatic tagging for forum posts',
    contexts: [InteractionContextType.Guild],
    default_member_permissions: ['ManageChannels'],
    options: [enable, disable, config],
  },
  {
    threadCreate: handleThreadCreate,
  },
)

async function runEnable(interaction: ChatInputCommandInteraction) {
  const forum = interaction.options.getChannel('forum', true, [
    ChannelType.GuildForum,
  ])
  const tag = interaction.options.getString('tag', true)
  const guild = await getGuild(interaction, true)

  // Check if the bot has Manage Channel permissions
  const botMember = await guild.members.fetchMe()
  if (!botMember.permissionsIn(forum).has('ManageChannels')) {
    return interaction.reply({
      content:
        'I need the Manage Channels permission in the target forum channel to auto-tag posts.',
      flags: MessageFlags.Ephemeral,
    })
  }

  const tagExists = forum.availableTags.find((t) => t.id === tag)
  if (!tagExists) {
    return interaction.reply({
      content: 'The specified tag does not exist in this forum channel.',
      flags: MessageFlags.Ephemeral,
    })
  }

  // Update or create the config
  const newConfig = await prisma.autoTagConfig.upsert({
    where: {
      guildID_channelID: {
        guildID: guild.id,
        channelID: forum.id,
      },
    },
    update: {
      tagID: tag,
    },
    create: {
      guildID: guild.id,
      channelID: forum.id,
      tagID: tag,
    },
  })

  const tagFormatter = makeForumTagFormatter(forum)

  return interaction.reply({
    content: formatConfig({
      config: newConfig,
      guild,
      formatters: {
        tagID: tagFormatter,
      },
    }),
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  })
}

async function runDisable(interaction: ChatInputCommandInteraction) {
  const forum = interaction.options.getChannel('forum', true, [
    ChannelType.GuildForum,
  ])
  const guild = await getGuild(interaction, true)

  const oldConfig = await prisma.autoTagConfig.findUnique({
    where: {
      guildID_channelID: {
        guildID: guild.id,
        channelID: forum.id,
      },
    },
  })

  if (!oldConfig) {
    return interaction.reply({
      content: 'Auto-tagging is not enabled for this channel.',
      flags: MessageFlags.Ephemeral,
    })
  }

  await prisma.autoTagConfig.delete({
    where: {
      guildID_channelID: {
        guildID: guild.id,
        channelID: forum.id,
      },
    },
  })

  return interaction.reply({
    content: `Auto-tagging has been disabled for ${forum}.`,
    flags: MessageFlags.Ephemeral,
  })
}

async function runConfig(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)

  const configs = await prisma.autoTagConfig.findMany({
    where: {
      guildID: guild.id,
    },
  })

  if (configs.length === 0) {
    return interaction.reply({
      content: 'No channels have auto-tagging enabled.',
      flags: MessageFlags.Ephemeral,
    })
  }

  const configList = await Promise.all(
    configs.map(async (config) => {
      const channel =
        (await interaction.guild?.channels.fetch(config.channelID)) ?? null

      return formatConfig({
        config,
        guild,
        formatters: {
          tagID: channel
            ? makeForumTagFormatter(channel as ForumChannel)
            : (t) => String(t),
        },
      })
    }),
  )

  let content = `Auto-tagging is enabled in the following channels:\n${configList.join('\n')}`
  let files: AttachmentPayload[] = []

  if (content.length > 1900) {
    files = [
      {
        attachment: Buffer.from(content),
        name: 'auto-tagging.txt',
      },
    ]

    content =
      'Auto-tagging is enabled in the following channels (content too long, see attachment):'
  }

  return interaction.reply({
    content,
    files,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  })
}

async function handleThreadCreate(
  thread: ThreadChannel,
  newlyCreated: boolean,
) {
  if (!thread.parent?.isThreadOnly() || !newlyCreated) return

  const config = await prisma.autoTagConfig.findUnique({
    where: {
      guildID_channelID: {
        guildID: thread.guild.id,
        channelID: thread.parent.id,
      },
    },
  })

  if (!config) return

  if (thread.appliedTags?.includes(config.tagID)) return

  try {
    // Get current tags and add the auto tag
    const currentTags = thread.appliedTags || []
    await thread.setAppliedTags([...currentTags, config.tagID])
  } catch {
    // ignore
  }
}

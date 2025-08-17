import { stringify } from 'csv-stringify'
import {
  type AnyThreadChannel,
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  AttachmentBuilder,
  ChannelType,
  type ChatInputCommandInteraction,
  InteractionContextType,
} from 'discord.js'
import { botHasPermissionsGuard, SleetSlashCommand } from 'sleetcord'
import { baseLogger } from 'sleetcord-common'

const THREADABLE_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
] as const

const purgePostsLogger = baseLogger.child({ module: 'purge_posts' })

export const purge_threads = new SleetSlashCommand(
  {
    name: 'purge_threads',
    description: 'Purge threads from a forum channel',
    contexts: [InteractionContextType.Guild],
    default_member_permissions: ['ManageThreads'],
    integration_types: [ApplicationIntegrationType.GuildInstall],
    options: [
      {
        name: 'forum',
        description: 'The channel to purge threads from',
        type: ApplicationCommandOptionType.Channel,
        channel_types: [...THREADABLE_CHANNEL_TYPES],
        required: true,
      },
      {
        name: 'count',
        description: 'Max number of threads to purge (default: 100)',
        type: ApplicationCommandOptionType.Integer,
        min_value: 1,
        max_value: 300,
      },
      {
        name: 'dry_run',
        description:
          'Preview the threads that would be deleted without actually deleting them (default: false)',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'title_contains',
        description: 'Only purge threads with titles containing this text',
        type: ApplicationCommandOptionType.String,
      },
      {
        name: 'author',
        description: 'Only purge threads created by this user',
        type: ApplicationCommandOptionType.User,
      },
    ],
  },
  {
    run: runPurgePosts,
  },
)

async function runPurgePosts(interaction: ChatInputCommandInteraction) {
  await botHasPermissionsGuard(interaction, ['ManageThreads'])

  const channel = interaction.options.getChannel(
    'forum',
    true,
    THREADABLE_CHANNEL_TYPES,
  )
  const count = interaction.options.getInteger('count') ?? 100
  const dryRun = interaction.options.getBoolean('dry_run') ?? false
  const titleContains = interaction.options.getString('title_contains')
  const author = interaction.options.getUser('author')

  await interaction.deferReply()

  const threads = await channel.threads.fetch()

  const toDelete: AnyThreadChannel[] = []

  for (const thread of threads.threads.values()) {
    if (titleContains && !thread.name.includes(titleContains)) continue
    if (author && thread.ownerId !== author.id) continue

    toDelete.push(thread)

    if (toDelete.length >= count) break
  }

  if (toDelete.length < 1) {
    await interaction.editReply('No threads found to delete.')
    return
  }

  const found = `Found ${toDelete.length} threads to delete...`

  let checked = 0
  let deleted = 0
  let failed = 0
  const deleteLength = toDelete.length

  const stringifier = stringify({
    header: true,
    columns: [{ key: 'status' }, { key: 'name' }, { key: 'id' }],
    escape_formulas: true,
  })

  if (!dryRun) {
    await interaction.editReply(found)

    for (const thread of toDelete) {
      try {
        await thread.delete()
        deleted++
        stringifier.write({
          status: 'deleted',
          name: thread.name,
          id: thread.id,
        })
      } catch (e) {
        purgePostsLogger.error(`Failed to delete thread ${thread.id}`, e)
        failed++
        stringifier.write({
          status: 'failed',
          name: thread.name,
          id: thread.id,
        })
      }

      checked++

      // Update every 10 threads checked, but not if it's the last one (since we're going to edit it again immediately)
      if (checked % 10 === 0 && checked !== deleteLength) {
        await interaction.editReply(
          `${found} (${deleted} deleted, ${checked}/${deleteLength} threads done${failed > 0 ? `, ${failed} failed` : ''})`,
        )
      }
    }
  }

  const threadFile = new AttachmentBuilder(stringifier, {
    name: 'deleted_threads.csv',
  })

  const verb = dryRun ? 'Would delete' : 'Deleted'

  await interaction.editReply({
    content: `${verb} ${dryRun ? toDelete.length : deleted} threads${failed > 0 ? `, failed to delete ${failed}` : ''}:`,
    files: [threadFile],
  })
}

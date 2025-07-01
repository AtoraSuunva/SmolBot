import { stringify } from 'csv-stringify'
import {
  ApplicationIntegrationType,
  AttachmentBuilder,
  type ChatInputCommandInteraction,
  GatewayOpcodes,
  InteractionContextType,
  MessageFlags,
  SnowflakeUtil,
} from 'discord.js'
import {
  type ClientEventHandlers,
  getGuild,
  SleetSlashCommand,
} from 'sleetcord'
import { MINUTE } from 'sleetcord-common'

export const export_users = new SleetSlashCommand(
  {
    name: 'export_users',
    description: 'Export all users in the server into a CSV file',
    contexts: [InteractionContextType.Guild],
    integration_types: [ApplicationIntegrationType.GuildInstall],
    default_member_permissions: ['ManageGuild'],
    options: [],
  },
  {
    run: runExportUsers,
  },
)

const DEFAULT_TIMEOUT = 2 * MINUTE

async function runExportUsers(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const stringifier = stringify({
    header: true,
    columns: [
      { key: 'id' },
      { key: 'globalName' },
      { key: 'username' },
      { key: 'discriminator' },
      { key: 'joinedAt' },
    ],
    escape_formulas: true,
  })

  const nonce = SnowflakeUtil.generate().toString()

  guild.shard.send({
    op: GatewayOpcodes.RequestGuildMembers,
    d: {
      guild_id: guild.id,
      presences: false,
      nonce,
      query: '',
      limit: 0,
    },
  })

  let i = 0
  const handler: ClientEventHandlers['guildMembersChunk'] = (
    members,
    _,
    chunk,
  ) => {
    if (chunk.nonce !== nonce) return

    i++

    for (const member of members.values()) {
      stringifier.write({
        id: member.id,
        globalName: member.user.globalName,
        username: member.user.username,
        discriminator: member.user.discriminator,
        joinedAt: member.joinedAt?.toISOString(),
      })
    }

    timeout.refresh()

    if (members.size < 1_000 || i === chunk.count) {
      guild.client.off('guildMembersChunk', handler)
      stringifier.end()
    }
  }

  const timeout = setTimeout(() => {
    stringifier.destroy(new Error('Export timed out, try again later.'))
  }, DEFAULT_TIMEOUT)

  guild.client.on('guildMembersChunk', handler)

  stringifier.on('error', (err) => {
    clearTimeout(timeout)
    guild.client.off('guildMembersChunk', handler)
    interaction.editReply({
      content: `Failed to export users: ${err.message}`,
    })
  })

  const data: Buffer[] = []

  stringifier.on('readable', () => {
    let row: unknown
    // biome-ignore lint/suspicious/noAssignInExpressions: this is evil
    while ((row = stringifier.read()) !== null) {
      data.push(row as Buffer)
    }
  })

  stringifier.on('finish', () => {
    clearTimeout(timeout)
    console.log('Finished exporting users.')
    interaction
      .editReply({
        content: 'Exported users successfully.',
        files: [
          new AttachmentBuilder(Buffer.concat(data), { name: 'members.csv' }),
        ],
      })
      .catch((err) => {
        console.error('Failed to send export reply:', err)
      })
      .finally(() => {
        // do nothing
      })
  })
}

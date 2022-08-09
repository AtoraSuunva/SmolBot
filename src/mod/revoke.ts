import {
  Guild,
  GuildBan,
  Invite,
  EmbedBuilder,
  User,
  ChatInputCommandInteraction,
  ApplicationCommandOptionType,
} from 'discord.js'
import {
  botHasPermissions,
  formatUser,
  getGuild,
  getUser,
  inGuild,
  SleetSlashCommand,
} from 'sleetcord'

export const revoke = new SleetSlashCommand(
  {
    name: 'revoke',
    description: 'Revoke all invites from a specific user',
    default_member_permissions: ['BanMembers'],
    dm_permission: false,
    options: [
      {
        name: 'from',
        type: ApplicationCommandOptionType.User,
        description: 'Revoke invites from this user',
        required: true,
      },
    ],
  },
  {
    run: runRevoke,
    guildBanAdd: runBanRevoke,
  },
)

async function runRevoke(
  interaction: ChatInputCommandInteraction,
): Promise<unknown> {
  inGuild(interaction)
  await botHasPermissions(interaction, ['ManageGuild'])

  await interaction.deferReply()

  const guild = await getGuild(interaction, true)
  const user = await getUser(interaction, 'from', true)

  const revoked = await revokeInvitesFor(guild, user)
  const embed = formatInviteEmbed(user, revoked)

  return interaction.editReply({ embeds: [embed] })
}

// TODO: store this somewhere that isn't just a map
// Map of guildID -> channelID to do and log invite revokes on ban in
const banRevokeIn = new Map<string, string>([
  ['120330239996854274', '797336365284065300'],
])

async function runBanRevoke(ban: GuildBan): Promise<void> {
  const { guild, user } = ban
  if (!banRevokeIn.has(guild.id)) return
  const logChannelID = banRevokeIn.get(guild.id)
  const logChannel = logChannelID
    ? guild.channels.cache.get(logChannelID)
    : undefined

  const revoked = await revokeInvitesFor(guild, user)

  if (revoked.length === 0) return

  const embed = formatInviteEmbed(user, revoked)

  if (logChannel && logChannel.isTextBased()) {
    logChannel.send({ embeds: [embed] })
  }
}

/**
 * Fetches all invites from a guild and then revokes the ones created by the specified user
 * @param guild The guild to revoke invites in
 * @param user The user to revoke invites for
 * @returns An array of revoked invites
 */
async function revokeInvitesFor(guild: Guild, user: User): Promise<Invite[]> {
  const invites = await guild.invites.fetch()
  const toRevoke = invites.filter(i => i.inviterId === user.id)

  if (toRevoke.size === 0) {
    return []
  }

  const revoked: Invite[] = []

  for (const i of toRevoke.values()) {
    if (!i.deletable) continue
    await i.delete()
    revoked.push(i)
  }

  return revoked
}

/**
 * Formats data into a pretty embed to send respond with
 * @param user The user that had their invites revoked
 * @param invites The invites that were revoked
 * @returns An EmbedBuilder that can be sent detailing the revoked invites
 */
function formatInviteEmbed(user: User, invites: Invite[]): EmbedBuilder {
  const inviteList: string[] = []

  for (const i of invites) {
    inviteList.push(
      [
        `[${i.code}]`,
        `[#${i.channel?.name ?? 'unknown channel'}] `,
        `Uses: <${i.uses}/${i.maxUses === 0 ? '\u{221E}' : i.maxUses}>, `,
        i.createdAt ? `Created: ${i.createdAt.toLocaleString()}, ` : '',
        i.expiresAt
          ? `Expires: ${i.expiresAt.toLocaleString()}`
          : 'Expires: Never',
      ].join(''),
    )
  }

  if (inviteList.length === 0) {
    inviteList.push('No invites found or revoked.')
  }

  return new EmbedBuilder()
    .setAuthor({
      name: formatUser(user, { markdown: false }),
      iconURL: user.displayAvatarURL(),
    })
    .setColor('#f44336')
    .setTitle('Revoked Invites:')
    .setDescription('```md\n' + inviteList.join('\n') + '```')
}

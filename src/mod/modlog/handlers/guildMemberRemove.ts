import { EmbedBuilder, GuildMember, PartialGuildMember } from 'discord.js'
import { SleetModule, formatUser } from 'sleetcord'
import { EVENT_COLORS, formatLog, getValidatedConfigFor } from '../utils.js'
import prettyMilliseconds from 'pretty-ms'

export const logGuildMemberRemove = new SleetModule(
  {
    name: 'logGuildMemberRemove',
  },
  {
    guildMemberRemove: handleGuildMemberRemove,
  },
)

async function handleGuildMemberRemove(
  member: GuildMember | PartialGuildMember,
) {
  const conf = await getValidatedConfigFor(member.guild)
  if (!conf) return

  const { config, channel } = conf
  if (!config.memberRemove) return

  const roles = config.memberRemoveRoles
    ? member.roles.cache
        .filter((r) => r.id !== member.guild.id)
        .map((r) => r.name)
        .join(', ')
    : ''

  const joinedAgo =
    member.joinedTimestamp !== null
      ? prettyMilliseconds(member.joinedTimestamp, { unitCount: 3 })
      : 'some unknown time'

  const embed = new EmbedBuilder()
    .setDescription(
      `**${member.guild.memberCount.toLocaleString()}** Members\n${
        roles ? '**Roles**:' + roles : ''
      }`,
    )
    .setColor(EVENT_COLORS.memberRemove)
    .setFooter({
      text: `Joined ${joinedAgo} ago`,
    })
    .setTimestamp(new Date())

  channel.send({
    content: formatLog('📤', 'Member Remove', formatUser(member.user)),
    embeds: [embed],
  })
}

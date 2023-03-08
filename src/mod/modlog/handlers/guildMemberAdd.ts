import { ModLogConfig } from '@prisma/client'
import {
  Client,
  Collection,
  EmbedBuilder,
  Guild,
  GuildMember,
  GuildTextBasedChannel,
  Invite,
} from 'discord.js'
import prettyMilliseconds from 'pretty-ms'
import { formatUser, SleetModule } from 'sleetcord'
import { prisma } from '../../../util/db.js'
import { EVENT_COLORS, formatLog, getConfigFor, HOURS_MS } from '../utils.js'

export const logGuildMemberAdd = new SleetModule(
  {
    name: 'logGuildMemberAdd',
  },
  {
    ready,
    guildMemberAdd,
  },
)

type InviteCollection = Collection<string, Invite>
const invitesCache = new Map<Guild, InviteCollection>()

async function ready(client: Client) {
  const guildIDs = await prisma.modLogConfig.findMany({
    select: {
      guildID: true,
    },
    where: {
      enabled: true,
    },
  })

  for (const guildID of guildIDs) {
    const guild = await client.guilds.fetch(guildID.guildID)
    invitesCache.set(guild, await guild.invites.fetch())
  }
}

type ConfigChecker = (config: ModLogConfig) => boolean

async function getValidatedConfigFor(
  guild: Guild,
  checker: ConfigChecker = () => true,
): Promise<{ config: ModLogConfig; channel: GuildTextBasedChannel } | null> {
  const config = await getConfigFor(guild)

  if (!config || !config.enabled || !checker(config)) return null

  const channel = guild.channels.cache.get(config.channelID)

  if (!channel || !channel.isTextBased()) return null

  return { config, channel }
}

async function guildMemberAdd(member: GuildMember) {
  const { guild } = member
  const conf = await getValidatedConfigFor(guild, (config) => config.memberAdd)
  if (!conf) return
  const { config, channel } = conf

  const msg = `${formatUser(member.user)} ${member.user}`

  const userCreatedAt = Date.now() - member.user.createdTimestamp

  const newAccount =
    config.memberAddNew * HOURS_MS > userCreatedAt
      ? ' | :warning: New Account!'
      : ''

  const inviters = config.memberAddInvite
    ? await getPossibleInvites(member)
    : null

  const inviteMessage = inviters?.size
    ? `| :mailbox_with_mail: ${formatInviters(inviters)}`
    : ''

  const embed = new EmbedBuilder()
    .setDescription(
      `**${guild.memberCount.toLocaleString()}** Members ${newAccount} ${inviteMessage}`,
    )
    .setColor(EVENT_COLORS.memberAdd)
    .setFooter({
      text: `${prettyMilliseconds(userCreatedAt)} old`,
      iconURL: member.user.displayAvatarURL(),
    })
    .setTimestamp(new Date())

  await channel.send({
    content: formatLog('📥', 'Member Join', msg),
    embeds: [embed],
  })
}

async function getPossibleInvites(
  member: GuildMember,
): Promise<InviteCollection | null> {
  const { guild } = member

  const cachedInvites = invitesCache.get(guild)
  const newInvites = await guild.invites.fetch()
  invitesCache.set(guild, newInvites)

  if (!cachedInvites) return null

  return newInvites.filter((i) => {
    const ci = cachedInvites.get(i.code)
    return (
      // Only consider invites with >0 uses
      i.uses !== null &&
      i.uses > 0 &&
      // And if it's new (not cached) OR has more uses than the cached version
      (!ci || (ci.uses && i.uses > ci?.uses))
    )
  })
}

function formatInviters(invites: InviteCollection): string {
  return invites
    .map((i) => {
      const inviter = i.inviter ? formatUser(i.inviter) : '<null>'
      const maxUses = i.maxUses ? `/${i.maxUses}` : ''

      return `${inviter} {\`${i.code}\`} [\`${i.uses}${maxUses}\`]`
    })
    .join(', ')
}

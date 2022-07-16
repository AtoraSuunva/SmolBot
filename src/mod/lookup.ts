import {
  APIApplication,
  ApplicationCommandOptionType,
} from 'discord-api-types/v10'
import {
  Client,
  CommandInteraction,
  DiscordAPIError,
  Formatters,
  GuildPreview,
  Invite,
  MessageEmbed,
  SnowflakeUtil,
  User,
  UserFlags,
  Util,
  Widget,
} from 'discord.js'
import { SleetSlashCommand, formatUser, isLikelyID } from 'sleetcord'
import { fetch } from 'undici'

export const lookup = new SleetSlashCommand(
  {
    name: 'lookup',
    description: 'Lookup a user, guild, or invite',
    options: [
      {
        name: 'data',
        description: 'The data to lookup (user ID, guild ID, invite code)',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
  {
    run: runLookup,
  },
)

async function runLookup(interaction: CommandInteraction) {
  const { client } = interaction
  const data = interaction.options.getString('data', true)

  await interaction.deferReply()

  let error

  if (isLikelyID(data)) {
    // Probably an ID, check if it's a user or guild
    try {
      const user = await client.users.fetch(data)
      return sendUserLookup(interaction, user)
    } catch (e) {
      error = e
    }

    try {
      const guild = await fetchGuild(client, data)

      if ('message' in guild) {
        return interaction.editReply(guild.message)
      }

      if (guild instanceof Widget) {
        if (guild.instantInvite) {
          return sendInviteLookup(
            interaction,
            await client.fetchInvite(guild.instantInvite),
          )
        } else {
          return sendGuildWidgetLookup(interaction, guild)
        }
      }

      return sendGuildPreviewLookup(interaction, guild)
    } catch (e) {
      error = e
    }
  } else {
    // Likely an invite code
    try {
      const invite = await client.fetchInvite(data)
      return sendInviteLookup(interaction, invite)
    } catch (e) {
      error = e
    }
  }

  interaction.editReply(`Failed to do lookup, got:\n> ${String(error)}`)
}

type GuildExists = { exists: true; message: string }
type GuildData = GuildExists | GuildPreview | Widget

/**
 * Tries to get info about a guild from just an ID, using the widget
 * @param client The client to use for the request
 * @param guildId The guild ID to fetch with
 * @returns Guild data if the guild ID is valid, either "this exists" or details if the widget exists
 * @throws Error if the guild ID is invalid
 */
async function fetchGuild(client: Client, guildId: string): Promise<GuildData> {
  try {
    return await client.fetchGuildPreview(guildId)
  } catch (e) {
    // ignore
  }

  try {
    return await client.fetchGuildWidget(guildId)
  } catch (e) {
    if (e instanceof DiscordAPIError && e.httpStatus === 403) {
      const snowflake = SnowflakeUtil.deconstruct(guildId)
      return {
        exists: true,
        message: `Guild found with ID "\`${guildId}\`", no more information found.\nGuild created at: ${formatCreatedAt(
          snowflake.date,
        )}`,
      }
    }
  }

  throw new Error('Failed to fetch guild preview and widget.')
}

const rpcUrl = (app: string) =>
  `https://discord.com/api/applications/${app}/rpc`
const oAuthUrl = (app: string, permissions: string, scopes: string[]) =>
  `https://discord.com/oauth2/authorize?client_id=${app}&permissions=${permissions}&scope=${encodeURIComponent(
    scopes.join(' '),
  )}`

/**
 * Try to get some details about a bot using the RPC api info
 * @param app The application to lookup
 * @returns RPC details for a bot/application, if available
 * @throws Error if the application is not a bot or doesn't exist, *or* if the bot is old enough that bot ID != application ID
 */
async function getRPCDetails(app: string): Promise<APIApplication> {
  const res = await fetch(rpcUrl(app))

  if (res.status === 404) {
    throw new Error('No application found or snowflake incorrect.')
  } else if (res.status === 200) {
    return res.json() as Promise<APIApplication>
  }

  throw new Error('Failed to fetch application RPC details.')
}

const Badges = {
  DISCORD_EMPLOYEE: '<:BadgeStaff:909313939911897138>',
  PARTNERED_SERVER_OWNER: '<:BadgePartner:909313940725571604>',
  HYPESQUAD_EVENTS: '<:BadgeHypeSquadEvents:909313941178548246>',
  BUGHUNTER_LEVEL_1: '<:BadgeBugHunter:909313942407483402>',
  HOUSE_BRAVERY: '<:BadgeBravery:909313943233789972>',
  HOUSE_BRILLIANCE: '<:BadgeBrilliance:909313944047468544>',
  HOUSE_BALANCE: '<:BadgeBalance:909313944869564416>',
  EARLY_SUPPORTER: '<:BadgeEarlySupporter:909313946132029440>',
  TEAM_USER: '[Team User]',
  BUGHUNTER_LEVEL_2: '<:BadgeBugHunterLvl2:909313947172233266>',
  VERIFIED_BOT: '<:VerifiedBot:910427927160709180>',
  EARLY_VERIFIED_DEVELOPER:
    '<:BadgeEarlyVerifiedBotDeveloper:909313948355018752>',
  DISCORD_CERTIFIED_MODERATOR: '<:BadgeCertifiedMod:909313949332275300>',
  BOT_HTTP_INTERACTIONS: '[HTTP Interactions]',
}

/**
 * Pretty-format badges by turning them into emojis!
 * @param user The user to get details for
 * @returns An array of badge emojis/text that can be displayed
 */
function getUserBadgeEmojis(user: User): string[] {
  if (!user.flags) return []

  const badges = []

  for (const [key, flag] of Object.entries(UserFlags.FLAGS)) {
    if (key !== 'VERIFIED_BOT' && user.flags.has(flag) && key in Badges) {
      badges.push(Badges[key as keyof typeof Badges])
    }
  }

  return badges
}

/**
 * Send a lookup about a user, including extra details for bot users
 * @param interaction The interaction to edit
 * @param user The user ID to lookup
 */
async function sendUserLookup(
  interaction: CommandInteraction,
  user: User,
): Promise<void> {
  if (!(user instanceof User)) {
    return void interaction.editReply('Did not find info for that user.')
  }

  const rawUser = '``' + Util.escapeInlineCode(user.tag) + '``'
  const badges = getUserBadgeEmojis(user)
  const formattedBadges =
    badges.length > 0 ? `\n**Badges:** ${badges.join(' ')}` : ''

  const embed = new MessageEmbed()
    .setTitle(formatUser(user, { id: false, markdown: false }))
    .setThumbnail(user.displayAvatarURL({ size: 4096 }))
    .setDescription(
      `**ID:** ${user.id}\n**Raw Username:** ${rawUser}${formattedBadges}`,
    )
    .addField('Created at:', formatCreatedAt(user.createdAt))

  if (user.bot) {
    const verifiedBot = user.flags?.has('VERIFIED_BOT')

    let rpc = null
    try {
      rpc = await getRPCDetails(user.id)
    } catch (e) {
      rpc = null
    }

    const details = []

    if (verifiedBot) {
      details.push(`${Badges.VERIFIED_BOT} **Verified Bot**`)
    }

    if (rpc) {
      const availability = rpc.bot_public ? 'Public' : 'Private'
      details.push(
        `**${availability}** [(Invite)](${oAuthUrl(
          rpc.id,
          rpc.install_params?.permissions ?? '0',
          rpc.install_params?.scopes ?? ['bot'],
        )})\n`,
        `> ${rpc.description.trim().replaceAll(/\n/g, '\n> ')}`,
      )

      if (rpc.terms_of_service_url) {
        details.push(`[Terms of Service](${rpc.terms_of_service_url})`)
      }

      if (rpc.privacy_policy_url) {
        details.push(`[Privacy Policy](${rpc.privacy_policy_url})`)
      }

      if (rpc.guild_id) {
        details.push(`**Guild:** \`${rpc.guild_id}\``)
      }

      if (rpc.tags) {
        details.push(`**Tags:** \`${rpc.tags.join(', ')}\``)
      }
    } else {
      details.push('No RPC information available. This bot is likely too old.')
    }

    const formattedDetails = details.join('\n')
    embed.addField('Bot Details:', formattedDetails)
  }

  interaction.editReply({ embeds: [embed] })
}

const ONLINE = '<:i_online:468214881623998464>'
const OFFLINE = '<:i_offline2:468215162244038687>'

function sendInviteLookup(
  interaction: CommandInteraction,
  invite: Invite,
): void {
  const { guild, code, presenceCount, memberCount } = invite

  if (!guild) {
    return void interaction.editReply(
      'Failed to fetch the guild for that invite...',
    )
  }

  const embed = new MessageEmbed().setFooter({
    text: 'Source: Invite',
  })

  if (guild.description) {
    embed.setDescription(guild.description)
  }

  embed.setTitle(`:incoming_envelope:  Invite: ${code}`)
  embed.addField(
    `Guild Info:`,
    `${guild.name}\n**ID:** ${guild.id}\n[#${invite.channel.name}](http://discord.com)`,
    true,
  )

  const ratio = ((presenceCount / memberCount) * 100).toFixed(0)
  embed.addField(
    'Members:',
    `${ONLINE} **${presenceCount}** Online (${ratio}%)\n` +
      `${OFFLINE} **${memberCount}** Total`,
    true,
  )

  embed.addField('Created at:', formatCreatedAt(guild.createdAt))

  if (guild.icon) {
    // We just checked for an icon above, so this should never be null
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    embed.setThumbnail(guild.iconURL({ size: 4096 })!)
  }

  if (guild.features.length > 0) {
    embed.addField(
      'Features:',
      Formatters.codeBlock(guild.features.sort().join(', ')),
    )
  }

  const images = []

  if (guild.splash) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    images.push(`[Splash](${guild.splashURL({ size: 4096 })})`)
  }

  if (guild.banner) {
    images.push(`[Banner](${guild.bannerURL({ size: 4096 })})`)
  }

  if (images.length > 0) {
    embed.addField('Images:', images.join('\n'), true)
  }

  embed.addField('Verification Level:', guild.verificationLevel, true)

  if (guild.vanityURLCode) {
    embed.addField(
      'Vanity URL:',
      `[/${guild.vanityURLCode}](https://discord.gg/${guild.vanityURLCode})`,
      true,
    )
  }

  if (invite.inviter) {
    embed.addField('Inviter:', `${formatUser(invite.inviter)}`, true)
  }

  interaction.editReply({ embeds: [embed] })
}

function sendGuildWidgetLookup(
  interaction: CommandInteraction,
  widget: Widget,
) {
  const created = SnowflakeUtil.deconstruct(widget.id).date

  const embed = new MessageEmbed()
    // The docs specify that `.name` is a string and exists, but the types don't. Bug?
    .setTitle(`Guild: ${(widget as unknown as { name: string }).name}`)
    .addField('ID:', widget.id, true)
    .addField('Invite:', widget.instantInvite ?? 'No invite', true)
    .addField('Channels:', `${widget.channels.size} channels`, true)
    .addField('Members:', `${widget.presenceCount} online`, true)
    .addField('Created at:', formatCreatedAt(created))
    .setFooter({
      text: 'Source: Guild Widget',
    })

  interaction.editReply({ embeds: [embed] })
}

function sendGuildPreviewLookup(
  interaction: CommandInteraction,
  preview: GuildPreview,
) {
  const embed = new MessageEmbed()
    .setTitle(`Guild: ${preview.name}`)
    .addField('ID:', preview.id, true)
    .setFooter({
      text: 'Source: Guild Preview',
    })

  if (preview.description) {
    embed.setDescription(preview.description)
  }

  const {
    approximateMemberCount: memberCount,
    approximatePresenceCount: presenceCount,
  } = preview
  const ratio = ((presenceCount / memberCount) * 100).toFixed(0)
  embed
    .addField(
      'Members:',
      `${ONLINE} **${presenceCount}** Online (${ratio}%)\n` +
        `${OFFLINE} **${memberCount}** Total`,
      true,
    )
    .addField('Created at:', formatCreatedAt(preview.createdAt))

  if (preview.icon) {
    // We just checked for an icon above, so this should never be null
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    embed.setThumbnail(preview.iconURL({ size: 4096 })!)
  }

  if (preview.features.length > 0) {
    embed.addField(
      'Features:',
      Formatters.codeBlock(preview.features.sort().join(', ')),
    )
  }

  if (preview.emojis.size > 0) {
    let emojis = preview.emojis
      .first(100)
      .map(e => e.toString())
      .join(' ')

    if (emojis.length > 1024) {
      emojis = trimToLast(emojis.substring(0, 1024), ' ')
    }

    embed.addField('Emojis:', emojis)
  }

  if (preview.stickers.size > 0) {
    embed.addField(
      'Stickers:',
      Formatters.codeBlock(
        preview.stickers
          .first(20)
          .map(s => s.name)
          .join(', '),
      ),
    )
  }

  const images: string[] = []

  if (preview.splash) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const splash = preview.splashURL({ size: 4096 })!
    images.push(`[Splash](${splash})`)
  }

  if (preview.discoverySplash) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const discoverySplash = preview.discoverySplashURL({ size: 4096 })!
    images.push(`[Discovery Splash](${discoverySplash})`)
  }

  if (images.length > 0) {
    embed.addField('Images:', images.join('\n'), true)
  }

  interaction.editReply({ embeds: [embed] })
}

/**
 * Trims a string to the last occurance of a substring
 *
 * @example
 * trimToLast('abcdefg', 'd') // 'abc'
 *
 * @param string The string to trim
 * @param substring The substring to trim at the last occurance of
 * @returns The string, trimmed right before the last occurance
 */
function trimToLast(string: string, substring: string): string {
  const index = string.lastIndexOf(substring)
  if (index === -1) {
    return string
  }
  return string.substring(0, index)
}

// TODO: global time util
function formatCreatedAt(date: Date): string {
  return date.toString()
}

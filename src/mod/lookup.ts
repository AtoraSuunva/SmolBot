import {
  Client,
  CommandInteraction,
  DiscordAPIError,
  GuildPreview,
  Invite,
  EmbedBuilder,
  SnowflakeUtil,
  User,
  UserFlags,
  Widget,
  escapeInlineCode,
  ChatInputCommandInteraction,
  codeBlock,
  GuildPreviewEmoji,
  Collection,
  Sticker,
  ChannelType,
  GuildNSFWLevel,
  ApplicationCommandOptionType,
  APIApplication,
  GuildVerificationLevel,
} from 'discord.js'
import { fetch } from 'undici'
import { SleetSlashCommand, formatUser, isLikelyID } from 'sleetcord'

export const lookup = new SleetSlashCommand(
  {
    name: 'lookup',
    description: 'Lookup a user, guild, or invite :)',
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

async function runLookup(interaction: ChatInputCommandInteraction) {
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
    if (e instanceof DiscordAPIError && e.status === 403) {
      return {
        exists: true,
        message: `Guild found with ID "\`${guildId}\`", no more information found.\nGuild created at: ${formatCreatedAt(
          snowflakeToDate(guildId),
        )}`,
      }
    }
  }

  throw new Error('Failed to fetch guild preview and widget.')
}

/**
 * Try to fetch a guild preview for a guild
 * @param client The client to use for the request
 * @param guildId The guild ID to fetch with
 * @returns Either a GuildPreview (if available) or null
 */
async function tryFetchGuildPreview(
  client: Client,
  guildId: string,
): Promise<GuildPreview | null> {
  try {
    return await client.fetchGuildPreview(guildId)
  } catch (e) {
    return null
  }
}

const rpcUrl = (app: string) =>
  `https://discord.com/api/applications/${app}/rpc`
const oAuthUrl = (app: string, permissions: string, scopes: string[]) =>
  `https://discord.com/oauth2/authorize?client_id=${app}&permissions=${permissions}&scope=${encodeURIComponent(
    scopes.join(' '),
  )}`

/**
 * Try to get some details about a bot using the RPC API info
 * @param app The application to lookup
 * @returns RPC details for a bot/application, if available
 * @throws Error if the application is not a bot or doesn't exist, *or* if the bot is old enough that bot ID != application ID
 */
async function fetchRPCDetails(app: string): Promise<APIApplication> {
  const res = await fetch(rpcUrl(app))

  if (res.status === 404) {
    throw new Error('No application found or snowflake incorrect.')
  } else if (res.status === 200) {
    return res.json() as Promise<APIApplication>
  }

  throw new Error('Failed to fetch application RPC details.')
}

/**
 * Try to fetch some details about a bot using the RPC API info, returning null on failure
 * @param app The application to lookup
 * @returns RPC details for a bot/application, if available
 */
async function tryFetchRPCDetails(app: string): Promise<APIApplication | null> {
  try {
    return await fetchRPCDetails(app)
  } catch {
    return null
  }
}

const Badges: Record<keyof typeof UserFlags, string> = {
  Staff: '<:BadgeStaff:909313939911897138>',
  Partner: '<:BadgePartner:909313940725571604>',
  Hypesquad: '<:BadgeHypeSquadEvents:909313941178548246>',
  BugHunterLevel1: '<:BadgeBugHunter:909313942407483402>',
  HypeSquadOnlineHouse1: '<:BadgeBravery:909313943233789972>',
  HypeSquadOnlineHouse2: '<:BadgeBrilliance:909313944047468544>',
  HypeSquadOnlineHouse3: '<:BadgeBalance:909313944869564416>',
  PremiumEarlySupporter: '<:BadgeEarlySupporter:909313946132029440>',
  TeamPseudoUser: '[Team User]',
  BugHunterLevel2: '<:BadgeBugHunterLvl2:909313947172233266>',
  VerifiedBot: '<:VerifiedBot:910427927160709180>',
  VerifiedDeveloper: '<:BadgeEarlyVerifiedBotDeveloper:909313948355018752>',
  CertifiedModerator: '<:BadgeCertifiedMod:909313949332275300>',
  BotHTTPInteractions: '[HTTP Interactions]',
  Spammer: '[Spammer]',
  Quarantined: '[Quarantined]',
}

/**
 * Pretty-format badges by turning them into emojis!
 * @param user The user to get details for
 * @returns An array of badge emojis/text that can be displayed
 */
function getUserBadgeEmojis(user: User): string[] {
  if (!user.flags) return []

  const badges: string[] = []

  // Object.entries(UserFlags) returns an array of:
  //   - ['StringName', bit]
  //   - ['BitString', 'StringName']
  // Where 'StringName' is 'Staff', 'Partner', etc.
  //       bit is 0b1, 0b10, 0b100, etc. (1, 2, 4, etc.)
  //       'BitString' is '1', '2', '4' etc.
  // UserFlags is both a map 'string' -> bit and bit -> 'string'
  for (const [key, flag] of Object.entries(UserFlags)) {
    if (
      typeof flag === 'number' &&
      key !== 'VerifiedBot' &&
      user.flags.has(flag) &&
      key in Badges
    ) {
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

  const rawUser = '``' + escapeInlineCode(user.tag) + '``'
  const badges = getUserBadgeEmojis(user)
  const formattedBadges =
    badges.length > 0 ? `\n**Badges:** ${badges.join(' ')}` : ''

  const embed = new EmbedBuilder()
    .setTitle(formatUser(user, { id: false, markdown: false }))
    .setThumbnail(user.displayAvatarURL({ size: 4096 }))
    .setDescription(
      `**ID:** ${user.id}\n**Raw Username:** ${rawUser}${formattedBadges}`,
    )
    .addFields([
      { name: 'Created at:', value: formatCreatedAt(user.createdAt) },
    ])

  if (user.bot) {
    const verifiedBot = user.flags?.has('VerifiedBot')
    const rpc = await tryFetchRPCDetails(user.id)
    const details: string[] = []

    if (verifiedBot) {
      details.push(`${Badges.VerifiedBot} **Verified Bot**`)
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
    embed.addFields([{ name: 'Bot Details:', value: formattedDetails }])
  }

  interaction.editReply({ embeds: [embed] })
}

const ONLINE = '<:i_online:468214881623998464>'
const OFFLINE = '<:i_offline2:468215162244038687>'
const PARTNERED = '<:ServerPartnered:842194494161027100>'
const VERIFIED = '<:ServerVerifiedIcon:751159037378297976>'

/**
 * Send a guild or group DM invite based on which kind of invite it is
 * @param interaction The interaction to edit
 * @param invite The invite to use
 */
async function sendInviteLookup(
  interaction: CommandInteraction,
  invite: Invite,
): Promise<void> {
  if (invite.guild) {
    // Guild Invite
    return sendGuildInviteLookup(interaction, invite)
  } else {
    // Group DM invite? Maybe something else?
    return sendGroupDMInviteLookup(interaction, invite)
  }
}

/**
 * Sends all available information about a guild using an invite and Guild Preview API (if available)
 * @param interaction The interaction to edit
 * @param invite The invite to fetch information from
 */
async function sendGuildInviteLookup(
  interaction: CommandInteraction,
  invite: Invite,
): Promise<void> {
  const { guild, code, presenceCount, memberCount } = invite

  if (!guild) {
    return void interaction.editReply('Not a guild invite!')
  }

  const preview = await tryFetchGuildPreview(interaction.client, guild.id)
  const ratio = ((presenceCount / memberCount) * 100).toFixed(0)
  const guildIcons = [
    guild.partnered ? PARTNERED : '',
    guild.verified ? VERIFIED : '',
  ].filter(v => !!v)
  const guildPrepend = guildIcons.length > 0 ? `${guildIcons.join(' ')} ` : ''

  const embed = new EmbedBuilder()
    .setTitle(`:incoming_envelope:  Guild Invite: ${code}`)
    .setThumbnail(guild.iconURL({ size: 4096 }))
    .setDescription(guild.description)
    .addFields([
      {
        name: `Guild Info:`,
        value: `${guildPrepend}${guild.name}\n**ID:** ${guild.id}\n[#${
          invite.channel?.name ?? 'unknown channel'
        }](http://discord.com)`,
        inline: true,
      },
      {
        name: 'Members:',
        value:
          `${ONLINE} **${presenceCount.toLocaleString()}** Online (${ratio}%)\n` +
          `${OFFLINE} **${memberCount.toLocaleString()}** Total`,
        inline: true,
      },
      {
        name: 'Guild Created At:',
        value: formatCreatedAt(guild.createdAt),
      },
    ])
    .setFooter({
      text: `Source: Invite${preview ? ' & Guild Preview' : ''}`,
    })

  if (invite.expiresAt) {
    embed.addFields([
      {
        name: 'Invite Expires At:',
        value: formatExpiresAt(invite.expiresAt),
      },
    ])
  }

  if (invite.inviter) {
    embed.addFields([
      { name: 'Inviter:', value: formatUser(invite.inviter), inline: true },
    ])
  }

  if (guild.features.length > 0) {
    embed.addFields([
      {
        name: 'Features:',
        value: codeBlock(guild.features.sort().join(', ')),
      },
    ])
  }

  if (preview) {
    if (preview.emojis.size > 0) {
      embed.addFields([
        {
          name: `Emojis (${preview.emojis.size}):`,
          value: formatPreviewEmojis(preview.emojis),
        },
      ])
    }

    if (preview.stickers.size > 0) {
      embed.addFields([
        {
          name: `Stickers (${preview.stickers.size}):`,
          value: formatStickers(preview.stickers),
        },
      ])
    }
  }

  const images: string[] = []

  if (guild.splash) {
    images.push(`[Splash](${guild.splashURL({ size: 4096 })})`)
  }

  if (guild.banner) {
    images.push(`[Banner](${guild.bannerURL({ size: 4096 })})`)
  }

  if (images.length > 0) {
    embed.addFields([
      {
        name: 'Images:',
        value: images.join(' — '),
        inline: true,
      },
    ])
  }

  embed.addFields([
    {
      name: 'Verification Level:',
      value: VerificationLevelMap[guild.verificationLevel],
      inline: true,
    },
    {
      name: 'NSFW Level:',
      value: NSFWLevelMap[guild.nsfwLevel],
      inline: true,
    },
  ])

  if (guild.premiumSubscriptionCount !== null) {
    embed.addFields({
      name: 'Boosts:',
      value: guild.premiumSubscriptionCount?.toLocaleString() ?? '0',
      inline: true,
    })
  }

  if (guild.vanityURLCode) {
    embed.addFields([
      {
        name: 'Vanity URL:',
        value: `[/${guild.vanityURLCode}](https://discord.gg/${guild.vanityURLCode})`,
        inline: true,
      },
    ])
  }

  // TODO: add in blank fields to align things? do i even bother?

  // There's also the welcome screen but meh

  interaction.editReply({ embeds: [embed] })
}

/**
 * Sends all available information about a Group DM using an invite
 * @param interaction The interaction to reply to
 * @param invite The invite to send data for
 */
async function sendGroupDMInviteLookup(
  interaction: CommandInteraction,
  invite: Invite,
): Promise<void> {
  const { code, guild } = invite

  if (guild) {
    return void interaction.editReply('Not a group DM invite!')
  }

  if (!invite.channel || invite.channel.type !== ChannelType.GroupDM) {
    return void interaction.editReply('Failed to fetch group DM channel!')
  }

  const createdAt = snowflakeToDate(invite.channel.id)

  const embed = new EmbedBuilder()
    .setTitle(`:incoming_envelope:  Group DM Invite: ${code}`)
    .setThumbnail(invite.channel.iconURL({ size: 4096 }))
    .setFooter({
      text: `Source: Invite`,
    })
    .addFields([
      {
        name: 'Group DM Info:',
        value: invite.channel?.name ?? 'unknown group dm',
        inline: true,
      },
      {
        name: 'Members',
        value: `${OFFLINE} **${invite.memberCount.toLocaleString()}** Members`,
        // There's also a list of member usernames, display this somehow?
        inline: true,
      },
      {
        name: 'GDM Created At:',
        value: formatCreatedAt(createdAt),
      },
    ])

  if (invite.expiresAt) {
    embed.addFields([
      {
        name: 'Invite Expires At:',
        value: formatExpiresAt(invite.expiresAt),
      },
    ])
  }

  if (invite.inviter) {
    embed.addFields([{ name: 'Inviter:', value: formatUser(invite.inviter) }])
  }

  interaction.editReply({ embeds: [embed] })
}

/**
 * Sends all available information about a guild using the Widget API
 * @param interaction The interaction to reply to
 * @param widget The widget to pull information from
 */
function sendGuildWidgetLookup(
  interaction: CommandInteraction,
  widget: Widget,
) {
  const created = snowflakeToDate(widget.id)
  const embed = new EmbedBuilder()
    // The docs specify that `.name` is a string and exists, but the types don't. Bug?
    .setTitle(`Guild: ${(widget as unknown as { name: string }).name}`)
    .addFields([
      { name: 'ID:', value: widget.id, inline: true },
      {
        name: 'Invite:',
        value: widget.instantInvite ?? 'No invite',
        inline: true,
      },
      {
        name: 'Channels:',
        value: `${widget.channels.size} channels`,
        inline: true,
      },
      {
        name: 'Members:',
        value: `${widget.presenceCount.toLocaleString()} online`,
        inline: true,
      },
      { name: 'Guild Created At:', value: formatCreatedAt(created) },
    ])
    .setFooter({
      text: 'Source: Guild Widget',
    })

  interaction.editReply({ embeds: [embed] })
}

/**
 * Sends all available information from a guild using the guild preview API
 * @param interaction The interaction to reply to
 * @param preview The guild preview to display info for
 */
function sendGuildPreviewLookup(
  interaction: CommandInteraction,
  preview: GuildPreview,
) {
  const {
    approximateMemberCount: memberCount,
    approximatePresenceCount: presenceCount,
  } = preview
  const ratio = ((presenceCount / memberCount) * 100).toFixed(0)

  const embed = new EmbedBuilder()
    .setTitle(`Guild: ${preview.name}`)
    .setThumbnail(preview.iconURL({ size: 4096 }))
    .setDescription(preview.description)
    .addFields([
      { name: 'ID:', value: preview.id, inline: true },
      {
        name: 'Members:',
        value:
          `${ONLINE} **${presenceCount.toLocaleString()}** Online (${ratio}%)\n` +
          `${OFFLINE} **${memberCount.toLocaleString()}** Total`,
        inline: true,
      },
      { name: 'Guild Created At:', value: formatCreatedAt(preview.createdAt) },
    ])
    .setFooter({
      text: 'Source: Guild Preview',
    })

  if (preview.features.length > 0) {
    embed.addFields([
      {
        name: 'Features:',
        value: codeBlock(preview.features.sort().join(', ')),
      },
    ])
  }

  if (preview.emojis.size > 0) {
    embed.addFields([
      { name: 'Emojis:', value: formatPreviewEmojis(preview.emojis) },
    ])
  }

  if (preview.stickers.size > 0) {
    embed.addFields([
      {
        name: 'Stickers:',
        value: formatStickers(preview.stickers),
      },
    ])
  }

  const images: string[] = []

  if (preview.splash) {
    const splash = preview.splashURL({ size: 4096 })
    images.push(`[Splash](${splash})`)
  }

  if (preview.discoverySplash) {
    const discoverySplash = preview.discoverySplashURL({ size: 4096 })
    images.push(`[Discovery Splash](${discoverySplash})`)
  }

  if (images.length > 0) {
    embed.addFields([
      { name: 'Images:', value: images.join('\n'), inline: true },
    ])
  }

  interaction.editReply({ embeds: [embed] })
}

/**
 * Format a colletion of emojis into a string for display
 * @param emojis GuildPreview emojis as a Collection
 * @returns A string representation of the emojis
 */
function formatPreviewEmojis(
  emojis: Collection<string, GuildPreviewEmoji>,
): string {
  let formattedEmojis = emojis
    .first(100)
    .map(e => e.toString())
    .join(' ')

  if (formattedEmojis.length > 1024) {
    formattedEmojis = trimToLast(formattedEmojis.substring(0, 1024), ' ')
  }

  return formattedEmojis
}

/**
 * Format a Collection of stickers into a string for display
 * @param stickers Guild stickers as a Collection
 * @returns A string representation of the stickers
 */
function formatStickers(stickers: Collection<string, Sticker>): string {
  return stickers
    .first(20)
    .map(s => `[${s.name}](${s.url})`)
    .join(', ')
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

/**
 * Parse a Discord Snowflake into a JS Date
 * @param snowflake The Snowflake to parse
 * @returns A JS Date representing the Snowflake
 */
function snowflakeToDate(snowflake: string): Date {
  return new Date(Number(SnowflakeUtil.deconstruct(snowflake).timestamp))
}

// TODO: global time util
function formatCreatedAt(date: Date): string {
  return date.toString()
}

function formatExpiresAt(date: Date): string {
  return date.toString()
}

/** A map of GuildVerificationLevel to displayable strings */
const VerificationLevelMap: Record<GuildVerificationLevel, string> = {
  [GuildVerificationLevel.None]: 'None',
  [GuildVerificationLevel.Low]: 'Low',
  [GuildVerificationLevel.Medium]: 'Medium',
  [GuildVerificationLevel.High]: 'High',
  [GuildVerificationLevel.VeryHigh]: 'Very High',
}

/** A map of GuildNSFWLevel to displayable strings */
const NSFWLevelMap: Record<GuildNSFWLevel, string> = {
  [GuildNSFWLevel.Default]: 'Default',
  [GuildNSFWLevel.Explicit]: 'Explicit',
  [GuildNSFWLevel.Safe]: 'Safe',
  [GuildNSFWLevel.AgeRestricted]: 'Age Restricted',
}

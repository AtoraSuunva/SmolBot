import {
  type APIApplication,
  type APIApplicationEmoji,
  type APIUser,
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ApplicationFlags,
  ApplicationIntegrationType,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  ChannelType,
  type ChatInputCommandInteraction,
  type Client,
  type Collection,
  ComponentType,
  ContainerBuilder,
  DiscordAPIError,
  type GuildFeature,
  GuildNSFWLevel,
  type GuildPreview,
  type GuildPreviewEmoji,
  GuildVerificationLevel,
  GuildWidgetStyle,
  type Interaction,
  InteractionContextType,
  type Invite,
  MediaGalleryBuilder,
  MessageFlags,
  Routes,
  SectionBuilder,
  SeparatorBuilder,
  SnowflakeUtil,
  type Sticker,
  TextDisplayBuilder,
  type User,
  UserFlags,
  type UserFlagsBitField,
  Widget,
  hyperlink,
  inlineCode,
  time,
} from 'discord.js'
import prettyMilliseconds from 'pretty-ms'
import { SleetSlashCommand, escapeAllMarkdown, isLikelyID } from 'sleetcord'
import { notNullish } from 'sleetcord-common'
import { mapComponents } from '../../util/components.js'
import { plural } from '../../util/format.js'
import { syncApplicationEmojis } from '../../util/syncEmojis.js'

const Emotes = await syncApplicationEmojis('lookup', {
  //------------------------------
  online: './src/mod/lookup/emojis/online.png',
  offline: './src/mod/lookup/emojis/offline.png',
  // #region: Badges
  staff: './src/mod/lookup/emojis/user_badges/staff.png',
  partner: './src/mod/lookup/emojis/user_badges/partner.png',
  hypesquad: './src/mod/lookup/emojis/user_badges/hypesquad.png',
  bug_hunter_level_1:
    './src/mod/lookup/emojis/user_badges/bug_hunter_level_1.png',
  hypesquad_bravery:
    './src/mod/lookup/emojis/user_badges/hypesquad_bravery.png',
  hypesquad_brilliance:
    './src/mod/lookup/emojis/user_badges/hypesquad_brilliance.png',
  hypesquad_balance:
    './src/mod/lookup/emojis/user_badges/hypesquad_balance.png',
  early_supporter: './src/mod/lookup/emojis/user_badges/early_supporter.png',
  team_pseudo_user: './src/mod/lookup/emojis/user_badges/team_pseudo_user.png',
  bug_hunter_level_2:
    './src/mod/lookup/emojis/user_badges/bug_hunter_level_2.png',
  verified_bot: './src/mod/lookup/emojis/user_badges/verified_bot.png',
  early_verified_bot_developer:
    './src/mod/lookup/emojis/user_badges/early_verified_bot_developer.png',
  moderator_programs_alumni:
    './src/mod/lookup/emojis/user_badges/moderator_programs_alumni.png',
  bot_http_interactions:
    './src/mod/lookup/emojis/user_badges/bot_http_interactions.png',
  active_developer: './src/mod/lookup/emojis/user_badges/active_developer.png',

  // Not officially documented, but "known"
  spammer: './src/mod/lookup/emojis/user_badges/spammer.png',
  quarantined: './src/mod/lookup/emojis/user_badges/quarantined.png',
  collaborator: './src/mod/lookup/emojis/user_badges/collaborator.png',
  disable_premium: './src/mod/lookup/emojis/user_badges/disable_premium.png',
  has_unread_urgent_messages:
    './src/mod/lookup/emojis/user_badges/has_unread_urgent_messages.png',
  mfa_sms: './src/mod/lookup/emojis/user_badges/mfa_sms.png',
  premium_promo_dismissed:
    './src/mod/lookup/emojis/user_badges/premium_promo_dismissed.png',
  restricted_collaborator:
    './src/mod/lookup/emojis/user_badges/restricted_collaborator.png',
  // #endregion: Badges
  // #region: Feature icons
  animated_banner: './src/mod/lookup/emojis/guild_features/animated_banner.png',
  animated_icon: './src/mod/lookup/emojis/guild_features/animated_icon.png',
  app_command_permissions_v2:
    './src/mod/lookup/emojis/guild_features/application_command_permissions_v2.png',
  auto_moderation: './src/mod/lookup/emojis/guild_features/auto_moderation.png',
  banner: './src/mod/lookup/emojis/guild_features/banner.png',
  community: './src/mod/lookup/emojis/guild_features/community.png',
  creator_monetizable_provisional:
    './src/mod/lookup/emojis/guild_features/creator_monetizable_provisional.png',
  creator_store_page:
    './src/mod/lookup/emojis/guild_features/creator_store_page.png',
  developer_support_server:
    './src/mod/lookup/emojis/guild_features/developer_support_server.png',
  discoverable: './src/mod/lookup/emojis/guild_features/discoverable.png',
  featureable: './src/mod/lookup/emojis/guild_features/featureable.png',
  has_directory_entry:
    './src/mod/lookup/emojis/guild_features/has_directory_entry.png',
  hub: './src/mod/lookup/emojis/guild_features/hub.png',
  invite_splash: './src/mod/lookup/emojis/guild_features/invite_splash.png',
  invites_disabled:
    './src/mod/lookup/emojis/guild_features/invites_disabled.png',
  linked_to_hub: './src/mod/lookup/emojis/guild_features/linked_to_hub.png',
  member_verification_gate_enabled:
    './src/mod/lookup/emojis/guild_features/member_verification_gate_enabled.png',
  monetization_enabled:
    './src/mod/lookup/emojis/guild_features/monetization_enabled.png', // duplicate of creator_monetizable_provisional
  more_stickers: './src/mod/lookup/emojis/guild_features/more_stickers.png',
  news: './src/mod/lookup/emojis/guild_features/news.png',
  partnered: './src/mod/lookup/emojis/guild_features/partnered.png',
  preview_enabled: './src/mod/lookup/emojis/guild_features/preview_enabled.png',
  private_threads: './src/mod/lookup/emojis/guild_features/private_threads.png',
  relay_enabled: './src/mod/lookup/emojis/guild_features/relay_enabled.png',
  role_icons: './src/mod/lookup/emojis/guild_features/role_icons.png',
  role_subscriptions_purchaseable:
    './src/mod/lookup/emojis/guild_features/role_subscriptions_available_for_purchase.png', // duplicate of creator_monetizable_provisional
  role_subscriptions_enabled:
    './src/mod/lookup/emojis/guild_features/role_subscriptions_enabled.png', // duplicate of creator_monetizable_provisional
  ticketed_events_enabled:
    './src/mod/lookup/emojis/guild_features/ticketed_events_enabled.png',
  vanity_url: './src/mod/lookup/emojis/guild_features/vanity_url.png',
  verified: './src/mod/lookup/emojis/guild_features/verified.png',
  vip_regions: './src/mod/lookup/emojis/guild_features/vip_regions.png',
  welcome_screen_enabled:
    './src/mod/lookup/emojis/guild_features/welcome_screen_enabled.png',
  more_soundboard: './src/mod/lookup/emojis/guild_features/more_soundboard.png',
  raid_alerts_disabled:
    './src/mod/lookup/emojis/guild_features/raid_alerts_disabled.png',
  soundboard: './src/mod/lookup/emojis/guild_features/soundboard.png',
  // #endregion: Feature icons
  //------------------------------
})

export const lookup = new SleetSlashCommand(
  {
    name: 'lookup',
    description: 'Lookup a user, guild, or invite :)',
    contexts: [
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel,
    ],
    integration_types: [
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall,
    ],
    options: [
      {
        name: 'data',
        description: 'The data to lookup (user ID, guild ID, invite code)',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: 'ephemeral',
        type: ApplicationCommandOptionType.Boolean,
        description: 'Only show the result to you (default: False)',
      },
    ],
  },
  {
    run: runLookup,
    interactionCreate,
  },
)

const LOOKUP_ID = 'lookup'

async function interactionCreate(interaction: Interaction) {
  if (
    interaction.isButton() &&
    interaction.customId.startsWith(`${LOOKUP_ID}:`)
  ) {
    const ephemeral = interaction.message.flags.has('Ephemeral')

    const [, data] = interaction.customId.split(':')
    await lookupAndRespond(interaction, data, ephemeral).catch(() => {
      /* ignore */
    })

    // Then disable the button
    // With components v2 this is a little more complicated, since removing all components just
    // removes all the content. So we need to find the button (via customId) and disable it

    const { components } = interaction.message

    const newComponents = mapComponents(components, (component) => {
      if (
        component.type === ComponentType.Button &&
        component.customId === interaction.customId
      ) {
        return new ButtonBuilder(component.data)
          .setDisabled(true)
          .setStyle(ButtonStyle.Secondary)
      }

      return component
    })

    // We can't edit the ephemeral message directly, we would need to update it in response to the interaction
    // But lookupAndRespond already responds to the message
    if (!ephemeral) {
      await interaction.message
        .edit({
          components: newComponents,
        })
        .catch(() => {
          /* ignore */
        })
    }
  }
}

async function runLookup(interaction: ChatInputCommandInteraction) {
  const data = interaction.options.getString('data', true)
  const ephemeral = interaction.options.getBoolean('ephemeral') ?? false

  await lookupAndRespond(interaction, data, ephemeral)
}

type LookupInteraction = ChatInputCommandInteraction | ButtonInteraction

async function lookupAndRespond(
  interaction: LookupInteraction,
  data: string,
  ephemeral: boolean,
) {
  const { client } = interaction

  await interaction.deferReply({
    flags: ephemeral ? MessageFlags.Ephemeral : '0',
  })

  let error: unknown | null

  if (isLikelyID(data)) {
    // Probably an ID, check if it's a user or guild
    try {
      const user = await fetchUser(client, data)
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
        }

        return sendGuildWidgetLookup(interaction, guild)
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

  await interaction.editReply(`Failed to do lookup, got:\n> ${String(error)}`)
}

// TODO: remove this hack once clans are supported in discord.js
type APIUserWithClan = APIUser & { clan?: UserClan }

interface UserDetails {
  apiUser: APIUserWithClan
  user: User
}

/**
 * Represents a user's clan information.
 */
interface UserClan {
  /**
   * The ID of the user's primary clan.
   */
  identity_guild_id: string

  /**
   * Indicates whether the user is displaying their clan tag.
   */
  identity_enabled: boolean

  /**
   * The text of the user's clan tag. Limited to 4 characters.
   */
  tag: string

  /**
   * The clan badge hash.
   */
  badge: string
}

async function fetchUser(client: Client, id: string): Promise<UserDetails> {
  const apiUser = (await client.rest.get(Routes.user(id))) as APIUserWithClan
  // biome-ignore lint/complexity/useLiteralKeys: we're accessing a private function
  const user = client.users['_add'](apiUser, true)

  return { apiUser, user }
}

function clanBadgeUrl(clan: UserClan, size = 2048): string {
  // https://cdn.discordapp.com/clan-badges/[guild_id]/[badge_hash].[ext]?size=2048
  const ext = clan.badge.startsWith('a_') ? 'gif' : 'png'
  return `https://cdn.discordapp.com/clan-badges/${clan.identity_guild_id}/${clan.badge}.${ext}?size=${size}`
}

interface GuildExists {
  exists: boolean
  message: string
}
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
    if (e instanceof DiscordAPIError) {
      if (e.status === 403) {
        return {
          exists: true,
          message: `Guild found with ID "\`${guildId}\`", no more information found.\nGuild created: ${formatDate(
            snowflakeToDate(guildId),
          )}`,
        }
      }

      if (e.status === 404) {
        return {
          exists: false,
          message: `No guild with ID "\`${guildId}\`" not found.`,
        }
      }
    }
  }

  throw new Error('Failed to fetch guild preview and widget.')
}

const rpcUrl = (app: string) =>
  `https://discord.com/api/applications/${app}/rpc`
const oAuthUrl = (app: string) =>
  `https://discord.com/oauth2/authorize?client_id=${app}`
const oAuthUrlScoped = (app: string, permissions: string, scopes: string[]) =>
  `${oAuthUrl(app)}&permissions=${permissions}&scope=${encodeURIComponent(
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
  }

  if (res.status === 200) {
    return res.json() as Promise<APIApplication>
  }

  throw new Error('Failed to fetch application RPC details.')
}

/**
 * Pretty-format badges by turning them into emojis!
 * @param flags The flags to get details for
 * @returns An array of badge emojis/text that can be displayed
 */
function getUserBadgeEmojis(
  flags: UserFlagsBitField | null,
): (APIApplicationEmoji | string)[] {
  if (!flags) return []

  const badges: (APIApplicationEmoji | string)[] = []

  // Object.entries(UserFlags) returns an array of:
  //   - ['StringName', bit]
  //   - ['BitString', 'StringName']
  // Where 'StringName' is 'Staff', 'Partner', etc.
  //       bit is 0b1, 0b10, 0b100, etc. (1, 2, 4, etc.)
  //       'BitString' is '1', '2', '4' etc.
  // UserFlags is both a map 'string' -> bit and bit -> 'string'
  for (const [key, flag] of Object.entries(UserFlags)) {
    if (typeof flag === 'number' && key !== 'VerifiedBot' && flags.has(flag)) {
      badges.push(Badges[key as keyof typeof Badges] || key)
    }
  }

  return badges
}

const Badges: Record<keyof typeof UserFlags, APIApplicationEmoji> = {
  Staff: Emotes.staff,
  Partner: Emotes.partner,
  Hypesquad: Emotes.hypesquad,
  BugHunterLevel1: Emotes.bug_hunter_level_1,
  HypeSquadOnlineHouse1: Emotes.hypesquad_bravery,
  HypeSquadOnlineHouse2: Emotes.hypesquad_brilliance,
  HypeSquadOnlineHouse3: Emotes.hypesquad_balance,
  PremiumEarlySupporter: Emotes.early_supporter,
  TeamPseudoUser: Emotes.team_pseudo_user,
  BugHunterLevel2: Emotes.bug_hunter_level_2,
  VerifiedBot: Emotes.verified_bot,
  VerifiedDeveloper: Emotes.early_verified_bot_developer,
  CertifiedModerator: Emotes.moderator_programs_alumni,
  BotHTTPInteractions: Emotes.bot_http_interactions,
  ActiveDeveloper: Emotes.active_developer,

  // Not officially documented, but "known"
  Spammer: Emotes.spammer,
  Quarantined: Emotes.quarantined,
  Collaborator: Emotes.collaborator,
  DisablePremium: Emotes.disable_premium,
  HasUnreadUrgentMessages: Emotes.has_unread_urgent_messages,
  MFASMS: Emotes.mfa_sms,
  PremiumPromoDismissed: Emotes.premium_promo_dismissed,
  RestrictedCollaborator: Emotes.restricted_collaborator,
}

/**
 * Serialize a flag bitfield into an array of strings representing which flags are enabled, e.g.
 * `["GatewayMessageContentLimited", "ApplicationCommandBadge"]`
 * @param flags The flags bitfield to get details for
 * @returns An array of strings representing the flags in the bitfield
 */
function getRPCFlags(flags: ApplicationFlags | null): string[] {
  if (!flags) return []

  const stringFlags: string[] = []

  for (const [key, flag] of Object.entries(ApplicationFlags)) {
    if (typeof flag === 'number' && flags & flag) {
      stringFlags.push(key)
    }
  }

  return stringFlags
}

/**
 * Send a lookup about a user, including extra details for bot users
 * @param interaction The interaction to edit
 * @param user The user ID to lookup
 */
async function sendUserLookup(
  interaction: LookupInteraction,
  userDetails: UserDetails,
): Promise<void> {
  const container = await createUserLookupInfo(userDetails)

  await interaction.editReply({
    flags: MessageFlags.IsComponentsV2,
    components: [container],
  })
}

async function createUserLookupInfo(
  userDetails: UserDetails,
  { minimal = false }: { minimal?: boolean } = {},
) {
  const { user, apiUser } = userDetails

  const displayNameLine = `## ${escapeAllMarkdown(user.displayName)}${user.bot ? ' [APP]' : ''}`
  const tagLine = `### ${escapeAllMarkdown(user.tag)}`

  const details = [`**ID:** \`${user.id}\``]

  const badges = getUserBadgeEmojis(user.flags)

  if (badges.length > 0) {
    details.push(`**Badges:** ${badges.join(' ')}`)
  }

  const container = new ContainerBuilder()

  if (typeof user.accentColor === 'number') {
    container.setAccentColor(user.accentColor)
  }

  const avatarURL = user.avatarURL({ size: 4096 })
  const bannerURL = user.bannerURL({ size: 256 })
  const fullSizeBannerURL = user.bannerURL({ size: 4096 })
  const avatarDecorationURL = user.avatarDecorationURL({ size: 4096 })

  if (!minimal && bannerURL) {
    const bannerGallery = new MediaGalleryBuilder({
      items: [
        {
          media: {
            url: bannerURL,
          },
        },
      ],
    })

    container.addMediaGalleryComponents(bannerGallery)
  }

  const links = [
    avatarURL ? `${hyperlink('Avatar', avatarURL)}` : '',
    fullSizeBannerURL ? `${hyperlink('Banner', fullSizeBannerURL)}` : '',
    avatarDecorationURL
      ? `${hyperlink('Avatar Decoration', avatarDecorationURL)}`
      : '',
  ]
    .filter((t) => !!t)
    .join(' | ')

  if (links) {
    details.push(`**Images:** ${links}`)
  }

  const section = new SectionBuilder({
    accessory: {
      type: ComponentType.Thumbnail,
      media: {
        url: user.displayAvatarURL({ size: 4096 }),
      },
    },
    components: [
      {
        type: ComponentType.TextDisplay,
        content: displayNameLine,
      },
      {
        type: ComponentType.TextDisplay,
        content: tagLine,
      },
      {
        type: ComponentType.TextDisplay,
        content: details.join('\n'),
      },
    ],
  })

  container.addSectionComponents(section)

  const createdAt = new TextDisplayBuilder({
    content: `**Created**:\n${formatDate(user.createdAt)}`,
  })

  if (minimal) {
    container.addSectionComponents(
      new SectionBuilder({
        components: [
          {
            type: ComponentType.TextDisplay,
            content: `**Created**:\n${formatDate(user.createdAt)}`,
          },
        ],
        accessory: {
          type: ComponentType.Button,
          custom_id: `${LOOKUP_ID}:${user.id}`,
          style: ButtonStyle.Secondary,
          emoji: {
            name: '🔎',
          },
          label: 'Lookup User',
        },
      }),
    )
  } else {
    container.addTextDisplayComponents(createdAt)
  }

  if (!minimal) {
    const buttonRow = new ActionRowBuilder<ButtonBuilder>()

    if (apiUser.clan) {
      const { clan } = apiUser
      const clanBadge = clanBadgeUrl(clan)

      const section = new SectionBuilder({
        accessory: {
          type: ComponentType.Thumbnail,
          media: {
            url: clanBadge,
          },
        },
        components: [
          {
            type: ComponentType.TextDisplay,
            content: `**Tag:** ${inlineCode(clan.tag)}`,
          },
          {
            type: ComponentType.TextDisplay,
            content: `**Guild:** ${inlineCode(clan.identity_guild_id)}`,
          },
          {
            type: ComponentType.TextDisplay,
            content: `**Images:** ${hyperlink('Badge', clanBadge)}`,
          },
        ],
      })

      container.addSeparatorComponents(new SeparatorBuilder())
      container.addSectionComponents(section)
      buttonRow.addComponents(
        new ButtonBuilder()
          .setEmoji('🔎')
          .setLabel('Lookup Guild')
          .setStyle(ButtonStyle.Secondary)
          .setCustomId(`${LOOKUP_ID}:${clan.identity_guild_id}`),
      )
    }

    if (user.bot) {
      const verifiedBot = user.flags?.has('VerifiedBot')
      const rpc = await fetchRPCDetails(user.id).catch(() => null)
      const details: string[] = ['## **Bot Info:**']

      if (verifiedBot) {
        details.push(`${Badges.VerifiedBot} **Verified Bot**\n`)
      }

      if (rpc) {
        const availability = rpc.bot_public ? 'Public' : 'Private'

        const inviteUrl = oAuthUrl(rpc.id)
        buttonRow.addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('Invite')
            .setURL(inviteUrl),
        )

        const inviteUrlScoped = oAuthUrlScoped(
          rpc.id,
          rpc.install_params?.permissions ?? '0',
          rpc.install_params?.scopes ?? ['bot'],
        )
        buttonRow.addComponents(
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('Invite (Scoped)')
            .setURL(inviteUrlScoped),
        )

        details.push(
          `**${availability} Bot**`,
          `> ${rpc.description.trim().replaceAll(/\n/g, '\n> ')}\n`,
        )

        if (rpc.terms_of_service_url) {
          buttonRow.addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel('Terms of Service')
              .setURL(rpc.terms_of_service_url),
          )
        }

        if (rpc.privacy_policy_url) {
          buttonRow.addComponents(
            new ButtonBuilder()
              .setStyle(ButtonStyle.Link)
              .setLabel('Privacy Policy')
              .setURL(rpc.privacy_policy_url),
          )
        }

        if (rpc.guild_id) {
          details.push(`**Guild:** \`${rpc.guild_id}\``)
        }

        if (rpc.tags) {
          details.push(
            `**Tags:** ${rpc.tags.filter(notNullish).map(inlineCode).join(', ')}`,
          )
        }

        const flags = getRPCFlags(rpc.flags)

        if (flags.length > 0) {
          details.push(`**Flags:** ${flags.map(inlineCode).join(', ')}`)
        }

        buttonRow.addComponents([
          new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('RPC Details')
            .setURL(rpcUrl(rpc.id)),
        ])
      } else {
        details.push(
          'No RPC information available. This bot is likely too old.',
        )
      }

      container.addSeparatorComponents(
        new SeparatorBuilder({
          divider: true,
        }),
      )

      container.addTextDisplayComponents(
        new TextDisplayBuilder({
          content: details.join('\n').trim(),
        }),
      )
    }

    if (buttonRow.components.length > 0) {
      container.addActionRowComponents(buttonRow)
    }
  }

  return container
}

/**
 * Send a guild or group DM invite based on which kind of invite it is
 * @param interaction The interaction to edit
 * @param invite The invite to use
 */
async function sendInviteLookup(
  interaction: LookupInteraction,
  invite: Invite,
): Promise<void> {
  if (invite.guild) {
    // Guild Invite
    return sendGuildInviteLookup(interaction, invite)
  }

  // Group DM invite? Maybe something else?
  return sendGroupDMInviteLookup(interaction, invite)
}

/**
 * Sends all available information about a guild using an invite and Guild Preview API (if available)
 * @param interaction The interaction to edit
 * @param invite The invite to fetch information from
 */
async function sendGuildInviteLookup(
  interaction: LookupInteraction,
  invite: Invite,
): Promise<void> {
  const { guild, code, presenceCount, memberCount } = invite

  if (!guild) {
    return void interaction.editReply('Not a guild invite!').catch(() => {
      /* ignore */
    })
  }

  const preview = await interaction.client
    .fetchGuildPreview(guild.id)
    .catch(() => null)
  const ratio = ((presenceCount / memberCount) * 100).toFixed(0)
  const guildIcons = [
    guild.partnered ? Emotes.partnered : '',
    guild.verified ? Emotes.verified : '',
  ].filter((v) => !!v)
  const guildPrepend = guildIcons.length > 0 ? `${guildIcons.join(' ')} ` : ''

  const container = new ContainerBuilder()

  const inviteInfo = [
    `# Invite: ${inlineCode(code)}`,
    `${hyperlink(`#${invite.channel?.name ?? 'Unknown Channel'}`, `https://discord.com/channels/${guild.id}/${invite.channelId}`)}`,
  ]

  if (invite.expiresAt) {
    inviteInfo.push(`**Expires:** ${formatDate(invite.expiresAt)}`)
  }

  if (guild.splash) {
    container.addMediaGalleryComponents({
      type: ComponentType.MediaGallery,
      items: [
        {
          media: {
            // biome-ignore lint/style/noNonNullAssertion: we just checked the url exists
            url: guild.splashURL({ size: 256 })!,
          },
        },
      ],
    })
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder({
      content: inviteInfo.join('\n'),
    }),
  )

  const guildInfo = [
    `## Guild: ${guildPrepend}${escapeAllMarkdown(guild.name)}`,
    `**ID:** ${inlineCode(guild.id)}`,
    `${Emotes.online} **${presenceCount.toLocaleString()}** Online (${ratio}%)`,
    `${Emotes.offline} **${memberCount.toLocaleString()}** Members`,
    `**Created:** ${formatDate(guild.createdAt)}`,
  ]

  if (guild.features.length > 0) {
    guildInfo.push(
      `**Features:** (${guild.features.length}) ${formatGuildFeatures(guild.features)}`,
    )
  }

  if (preview) {
    if (preview.emojis.size > 0) {
      guildInfo.push(
        `**Emojis:** (${preview.emojis.size}) ${formatPreviewEmojis(preview.emojis)}`,
      )
    }

    if (preview.stickers.size > 0) {
      guildInfo.push(
        `**Stickers:** (${preview.stickers.size}) ${formatStickers(preview.stickers)}`,
      )
    }
  }

  const images: string[] = []

  if (guild.splash) {
    // biome-ignore lint/style/noNonNullAssertion: we just checked the url exists
    images.push(`[Splash](${guild.splashURL({ size: 4096 })!})`)
  }

  if (guild.banner) {
    // biome-ignore lint/style/noNonNullAssertion: we just checked the url exists
    images.push(`[Banner](${guild.bannerURL({ size: 4096 })!})`)
  }

  if (images.length > 0) {
    guildInfo.push(`**Images:** ${images.join(' — ')}`)
  }

  guildInfo.push(
    `**Verification Level:** ${VerificationLevelMap[guild.verificationLevel]}`,
  )
  guildInfo.push(`**NSFW Level:** ${NSFWLevelMap[guild.nsfwLevel]}`)

  if (guild.premiumSubscriptionCount !== null) {
    guildInfo.push(
      `**Boosts:** ${guild.premiumSubscriptionCount.toLocaleString()}`,
    )
  }

  if (guild.vanityURLCode) {
    guildInfo.push(
      `**Vanity URL:** ${hyperlink(`/${guild.vanityURLCode}`, `https://discord.gg/${guild.vanityURLCode}`)}`,
    )
  }

  const guildSection = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder({
      content: guildInfo.join('\n'),
    }),
  )

  const guildIcon = guild.iconURL({ size: 4096 })

  if (guildIcon) {
    guildSection.setThumbnailAccessory({
      type: ComponentType.Thumbnail,
      media: {
        url: guildIcon,
      },
    })
  }

  container.addSeparatorComponents(new SeparatorBuilder())

  if (guild.banner) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder({
        items: [
          {
            media: {
              // biome-ignore lint/style/noNonNullAssertion: we just checked the url exists
              url: guild.bannerURL({ size: 256 })!,
            },
          },
        ],
      }),
    )
  }

  container.addSectionComponents(guildSection)

  if (guild.description) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder({
        content: `>>> ${escapeAllMarkdown(guild.description)}`,
      }),
    )
  }

  if (invite.inviter) {
    const userDetails = await fetchUser(interaction.client, invite.inviter.id)
    const userContainer = await createUserLookupInfo(userDetails, {
      minimal: true,
    })

    container
      .addSeparatorComponents(new SeparatorBuilder())
      .spliceComponents(
        container.components.length,
        0,
        userContainer.components,
      )
  }

  container
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder({
        content: `-# Source: Invite${preview ? ' & Guild Preview' : ''}`,
      }),
    )

  await interaction.editReply({
    flags: MessageFlags.IsComponentsV2,
    components: [container],
  })
}

/**
 * Sends all available information about a Group DM using an invite
 * @param interaction The interaction to reply to
 * @param invite The invite to send data for
 */
async function sendGroupDMInviteLookup(
  interaction: LookupInteraction,
  invite: Invite,
): Promise<void> {
  const { code, guild } = invite

  if (guild) {
    await interaction.editReply('Not a group DM invite!')
    return
  }

  if (!invite.channel || invite.channel.type !== ChannelType.GroupDM) {
    await interaction.editReply('Failed to fetch group DM channel!')
    return
  }

  const createdAt = snowflakeToDate(invite.channel.id)
  const iconURL = invite.channel.iconURL({ size: 4096 })

  const container = new ContainerBuilder()

  const gdmInfo = [
    `# Group DM Invite: ${inlineCode(code)}`,
    `**ID:** ${inlineCode(invite.channel.id)}`,
    `${hyperlink(
      `#${invite.channel.name ?? 'Unknown Channel'}`,
      `https://discord.com/channels/@me/${invite.channel.id}`,
    )}`,
    `${Emotes.offline} ${plural('Member', invite.memberCount)}`,
    `**Icon:** ${iconURL ? hyperlink('Icon', iconURL) : 'None'}`,
    `**Created At:** ${formatDate(createdAt)}`,
    `**Expires At:** ${
      invite.expiresAt ? formatDate(invite.expiresAt) : 'Never'
    }`,
  ]

  if (iconURL) {
    container.addSectionComponents(
      new SectionBuilder({
        accessory: {
          type: ComponentType.Thumbnail,
          media: {
            url: iconURL,
          },
        },
        components: [
          {
            type: ComponentType.TextDisplay,
            content: gdmInfo.join('\n'),
          },
        ],
      }),
    )
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder({
        content: gdmInfo.join('\n'),
      }),
    )
  }

  if (invite.inviter) {
    const userDetails = await fetchUser(interaction.client, invite.inviter.id)
    const userContainer = await createUserLookupInfo(userDetails, {
      minimal: true,
    })

    container
      .addSeparatorComponents(new SeparatorBuilder())
      .spliceComponents(
        container.components.length,
        0,
        userContainer.components,
      )
  }

  container
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder({
        content: '-# Source: Group DM Invite',
      }),
    )

  await interaction.editReply({
    flags: MessageFlags.IsComponentsV2,
    components: [container],
  })
}

/**
 * Sends all available information about a guild using the Widget API
 * @param interaction The interaction to reply to
 * @param widget The widget to pull information from
 */
async function sendGuildWidgetLookup(
  interaction: LookupInteraction,
  widget: Widget,
) {
  const container = new ContainerBuilder()

  const widgetInfo = [
    `# ${widget.name}`,
    `**ID:** ${inlineCode(widget.id)}`,
    `${Emotes.online} ${widget.presenceCount.toLocaleString()} online`,
    `**Channels:** ${widget.channels.size.toLocaleString()}`,
    `**Created At:** ${formatDate(snowflakeToDate(widget.id))}`,
  ]

  container.addTextDisplayComponents(
    new TextDisplayBuilder({
      content: widgetInfo.join('\n'),
    }),
  )

  if (widget.instantInvite) {
    container
      .addSeparatorComponents(new SeparatorBuilder())
      .addSectionComponents(
        new SectionBuilder()
          .setButtonAccessory(
            new ButtonBuilder()
              .setCustomId(`${LOOKUP_ID}:${widget.instantInvite}`)
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('🔎')
              .setLabel('Lookup Invite'),
          )
          .addTextDisplayComponents(
            new TextDisplayBuilder({
              content: `**Invite:** ${hyperlink(
                widget.instantInvite,
                `https://discord.gg/${widget.instantInvite}`,
              )}`,
            }),
          ),
      )
  }

  container
    .addMediaGalleryComponents(
      new MediaGalleryBuilder({
        items: [
          {
            media: {
              url: widget.imageURL(GuildWidgetStyle.Banner3),
            },
          },
        ],
      }),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder({
        content: '-# Source: Guild Widget',
      }),
    )

  await interaction.editReply({
    flags: MessageFlags.IsComponentsV2,
    components: [container],
  })
}

/**
 * Sends all available information from a guild using the guild preview API
 * @param interaction The interaction to reply to
 * @param preview The guild preview to display info for
 */
async function sendGuildPreviewLookup(
  interaction: LookupInteraction,
  preview: GuildPreview,
) {
  const {
    approximateMemberCount: memberCount,
    approximatePresenceCount: presenceCount,
  } = preview
  const ratio = ((presenceCount / memberCount) * 100).toFixed(0)

  const container = new ContainerBuilder()

  const previewInfo = [
    `# Guild: ${preview.name}`,
    `**ID:** ${inlineCode(preview.id)}`,
    `${Emotes.online} **${presenceCount.toLocaleString()}** Online (${ratio}%)`,
    `${Emotes.offline} **${memberCount.toLocaleString()}** Total Members`,
    `**Created:** ${formatDate(preview.createdAt)}`,
  ]

  if (preview.features.length > 0) {
    previewInfo.push(
      `**Features:** (${preview.features.length}) ${formatGuildFeatures(preview.features)}`,
    )
  }

  if (preview.emojis.size > 0) {
    previewInfo.push(
      `**Emojis:** (${preview.emojis.size}) ${formatPreviewEmojis(preview.emojis)}`,
    )
  }

  if (preview.stickers.size > 0) {
    previewInfo.push(
      `**Stickers:** (${preview.stickers.size}) ${formatStickers(preview.stickers)}`,
    )
  }

  const images: string[] = []

  if (preview.splash) {
    // biome-ignore lint/style/noNonNullAssertion: we just checked the url exists
    images.push(`[Splash](${preview.splashURL({ size: 4096 })!})`)
  }

  if (preview.discoverySplash) {
    images.push(
      // biome-ignore lint/style/noNonNullAssertion: we just checked the url exists
      `[Discovery Splash](${preview.discoverySplashURL({ size: 4096 })!})`,
    )

    container.addMediaGalleryComponents(
      new MediaGalleryBuilder({
        items: [
          {
            media: {
              // biome-ignore lint/style/noNonNullAssertion: we just checked the url exists
              url: preview.discoverySplashURL({ size: 256 })!,
            },
          },
        ],
      }),
    )
  }

  if (images.length > 0) {
    previewInfo.push(`**Images:** ${images.join(' — ')}`)
  }

  if (preview.description) {
    previewInfo.push(`>>> ${escapeAllMarkdown(preview.description)}`)
  }

  const previewSection = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder({
      content: previewInfo.join('\n'),
    }),
  )

  const previewIcon = preview.iconURL({ size: 4096 })

  if (previewIcon) {
    previewSection.setThumbnailAccessory({
      type: ComponentType.Thumbnail,
      media: {
        url: previewIcon,
      },
    })
  }

  container
    .addSectionComponents(previewSection)
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder({
        content: '-# Source: Guild Preview',
      }),
    )

  await interaction.editReply({
    flags: MessageFlags.IsComponentsV2,
    components: [container],
  })
}

/**
 * Format a collection of emojis into a string for display
 * @param emojis GuildPreview emojis as a Collection
 * @returns A string representation of the emojis
 */
function formatPreviewEmojis(
  emojis: Collection<string, GuildPreviewEmoji>,
): string {
  let formattedEmojis = emojis
    .first(10)
    .map((e) => `[${e.name}](${e.imageURL()})`)
    .join(', ')

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
  let formattedStickers = stickers
    .first(10)
    .map((s) => `[${s.name}](${s.url})`)
    .join(', ')

  if (formattedStickers.length > 1024) {
    formattedStickers = trimToLast(formattedStickers.substring(0, 1024), ', ')
  }

  return formattedStickers
}

/**
 * Trims a string to the last occurrence of a substring
 *
 * @example
 * trimToLast('abcdefg', 'd') // 'abc'
 *
 * @param string The string to trim
 * @param substring The substring to trim at the last occurrence of
 * @returns The string, trimmed right before the last occurrence
 */
function trimToLast(string: string, substring: string): string {
  const index = string.lastIndexOf(substring)
  if (index === -1) {
    return string
  }
  return `${string.substring(0, index)}...`
}

/**
 * Parse a Discord Snowflake into a JS Date
 * @param snowflake The Snowflake to parse
 * @returns A JS Date representing the Snowflake
 */
function snowflakeToDate(snowflake: string): Date {
  return new Date(SnowflakeUtil.timestampFrom(snowflake))
}

function formatDate(date: Date): string {
  const now = Date.now()
  const then = date.getTime()
  let msTime = 0
  let relativeString = '?'

  if (now < then) {
    msTime = then - now
    relativeString = 'left'
  } else {
    msTime = now - then
    relativeString = 'ago'
  }

  return `${prettyMilliseconds(msTime)} ${relativeString} (${time(
    date,
    'R',
  )})\n${time(date, 'F')}`
}

/** A map of GuildVerificationLevel to displayable strings */
const VerificationLevelMap: Record<GuildVerificationLevel, string> = {
  [GuildVerificationLevel.None]: 'None',
  [GuildVerificationLevel.Low]: 'Low (Verified Email)',
  [GuildVerificationLevel.Medium]: 'Medium (Registered for 5+ minutes)',
  [GuildVerificationLevel.High]: 'High (Server Member for 10+ minutes)',
  [GuildVerificationLevel.VeryHigh]: 'Very High (Verified Phone)',
}

/** A map of GuildNSFWLevel to displayable strings */
const NSFWLevelMap: Record<GuildNSFWLevel, string> = {
  [GuildNSFWLevel.Default]: 'Default',
  [GuildNSFWLevel.Explicit]: 'Explicit',
  [GuildNSFWLevel.Safe]: 'Safe',
  [GuildNSFWLevel.AgeRestricted]: 'Age Restricted',
}

function formatGuildFeatures(features: `${GuildFeature}`[]): string {
  if (features.length === 0) {
    return 'No features enabled'
  }

  const feats = features
    .sort()
    .map((f) => GuildFeaturesMap[f])
    .filter(notNullish)
  const formattedFeats = feats.join(' ')

  return formattedFeats.length > 1024
    ? `${trimToLast(formattedFeats.substring(0, 1024), ' ')}...`
    : formattedFeats
}

const GuildFeaturesMap: Record<`${GuildFeature}`, APIApplicationEmoji> = {
  ANIMATED_BANNER: Emotes.animated_banner,
  ANIMATED_ICON: Emotes.animated_icon,
  APPLICATION_COMMAND_PERMISSIONS_V2: Emotes.app_command_permissions_v2,
  AUTO_MODERATION: Emotes.auto_moderation,
  BANNER: Emotes.banner,
  COMMUNITY: Emotes.community,
  CREATOR_MONETIZABLE_PROVISIONAL: Emotes.creator_monetizable_provisional,
  CREATOR_STORE_PAGE: Emotes.creator_store_page,
  DEVELOPER_SUPPORT_SERVER: Emotes.developer_support_server,
  DISCOVERABLE: Emotes.discoverable,
  FEATURABLE: Emotes.featureable,
  HAS_DIRECTORY_ENTRY: Emotes.has_directory_entry,
  HUB: Emotes.hub,
  INVITE_SPLASH: Emotes.invite_splash,
  INVITES_DISABLED: Emotes.invites_disabled,
  LINKED_TO_HUB: Emotes.linked_to_hub,
  MEMBER_VERIFICATION_GATE_ENABLED: Emotes.member_verification_gate_enabled,
  MONETIZATION_ENABLED: Emotes.monetization_enabled,
  MORE_STICKERS: Emotes.more_stickers,
  NEWS: Emotes.news,
  PARTNERED: Emotes.partnered,
  PREVIEW_ENABLED: Emotes.preview_enabled,
  PRIVATE_THREADS: Emotes.private_threads,
  RELAY_ENABLED: Emotes.relay_enabled,
  ROLE_ICONS: Emotes.role_icons,
  ROLE_SUBSCRIPTIONS_AVAILABLE_FOR_PURCHASE:
    Emotes.role_subscriptions_purchaseable,
  ROLE_SUBSCRIPTIONS_ENABLED: Emotes.role_subscriptions_enabled,
  TICKETED_EVENTS_ENABLED: Emotes.ticketed_events_enabled,
  VANITY_URL: Emotes.vanity_url,
  VERIFIED: Emotes.verified,
  VIP_REGIONS: Emotes.vip_regions,
  WELCOME_SCREEN_ENABLED: Emotes.welcome_screen_enabled,
  MORE_SOUNDBOARD: Emotes.more_soundboard,
  RAID_ALERTS_DISABLED: Emotes.raid_alerts_disabled,
  SOUNDBOARD: Emotes.soundboard,
}

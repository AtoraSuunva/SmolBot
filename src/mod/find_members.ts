import {
  type APIGuildMember,
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  type ChatInputCommandInteraction,
  type Collection,
  ComponentType,
  type Guild,
  type GuildMember,
  type Interaction,
  InteractionContextType,
  MessageFlags,
  type RestOrArray,
  type Snowflake,
  UserSelectMenuBuilder,
  type UserSelectMenuInteraction,
  cleanCodeBlockContent,
  codeBlock,
} from 'discord.js'
import {
  type AutocompleteHandler,
  PreRunError,
  SleetSlashCommand,
  formatUser,
  getGuild,
} from 'sleetcord'
import { getComponentsOfType } from '../util/components.js'
import { tableFormat } from '../util/format.js'
import { workerMatch } from '../util/regexWorker.js'

interface MemberMatch {
  name: string
  value: string
  globalName: string | null
  username: string
  nickname: string | null
  id: string
  member: GuildMember | APIGuildMember
}

const userAutocomplete: AutocompleteHandler<string> = async ({
  interaction,
  value,
}) => {
  if (!interaction.inGuild()) {
    return []
  }

  const guild = await getGuild(interaction, true)
  const members = await fetchMembers(guild)
  const matcher = makePartialMatcher(value, false)

  return (await matchMembers(members, matcher)).map((m) => ({
    name: m.name,
    value: m.value,
  }))
}

const REGEX_TIMEOUT = 100

export const find_members = new SleetSlashCommand(
  {
    name: 'find_members',
    description:
      'Find members in the server by username, global name, or nickname',
    contexts: [InteractionContextType.Guild],
    integration_types: [ApplicationIntegrationType.GuildInstall],
    options: [
      {
        name: 'name',
        description:
          'Find members with this name (default is case-insensitive partial match)',
        type: ApplicationCommandOptionType.String,
        autocomplete: userAutocomplete,
      },
      {
        name: 'regex',
        description: `Use a regex to match, overrides name and exact_match (${REGEX_TIMEOUT}ms timeout, 'v' flag)`,
        type: ApplicationCommandOptionType.String,
      },
      {
        name: 'exact_match',
        description: 'Only show exact matches (default: False)',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'case_sensitive',
        description: 'Match case-sensitively (default: False)',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'match_bot',
        description: 'Match against bots (default: False)',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'match_username',
        description: 'Match against usernames (default: True)',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'match_global_name',
        description: 'Match against global names (default: True)',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'match_nickname',
        description: 'Match against nicknames (default: True)',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'ephemeral',
        description: 'Only show the result to you (default: False)',
        type: ApplicationCommandOptionType.Boolean,
      },
    ],
  },
  {
    run: runFindMembers,
    interactionCreate: handleInteractionCreate,
  },
)

const USER_SELECT_ID = 'find_members:user'
const MENTION_ID = 'find_members:mention'
const ID_ID = 'find_members:id'

const MENTION_BUTTON = new ButtonBuilder()
  .setCustomId(MENTION_ID)
  .setEmoji('🪪')
  .setLabel('Mention')
  .setStyle(ButtonStyle.Secondary)
const ID_BUTTON = new ButtonBuilder()
  .setCustomId(ID_ID)
  .setEmoji('🆔')
  .setLabel('ID')
  .setStyle(ButtonStyle.Secondary)
const ACTION_BUTTON_ROW = new ActionRowBuilder<ButtonBuilder>().addComponents([
  MENTION_BUTTON,
  ID_BUTTON,
])

function createUserSelect(...users: RestOrArray<Snowflake>) {
  const userSelect = new UserSelectMenuBuilder()
    .setCustomId(USER_SELECT_ID)
    .setMinValues(1)
    .setMaxValues(25)
    .setPlaceholder('Members to action')
    .addDefaultUsers(...users)

  return new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(userSelect)
}

async function runFindMembers(interaction: ChatInputCommandInteraction) {
  const name = interaction.options.getString('name')
  const regex = interaction.options.getString('regex')

  if ((!name && !regex) || (name && regex)) {
    throw new PreRunError(
      'You must provide either a name or a regex (but not both).',
    )
  }

  const exactMatch = interaction.options.getBoolean('exact_match') ?? false
  const caseSensitive =
    interaction.options.getBoolean('case_sensitive') ?? false

  let regexPattern: RegExp | null = null
  if (regex) {
    try {
      regexPattern = new RegExp(regex, caseSensitive ? 'v' : 'vi')
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      throw new PreRunError(
        `Invalid regex pattern:\n${codeBlock('js', cleanCodeBlockContent(message))}`,
      )
    }
  }

  const matchBot = interaction.options.getBoolean('match_bot') ?? true
  const matchUsername = interaction.options.getBoolean('match_username') ?? true
  const matchGlobalName =
    interaction.options.getBoolean('match_global_name') ?? true
  const matchNickname = interaction.options.getBoolean('match_nickname') ?? true

  const ephemeral = interaction.options.getBoolean('ephemeral') ?? false

  await interaction.deferReply({
    flags: ephemeral ? MessageFlags.Ephemeral : '0',
  })

  const guild = await getGuild(interaction, true)
  const members = await fetchMembers(guild)

  let matcher: Matcher
  if (regexPattern) {
    matcher = async (memberName: string) => {
      try {
        return await workerMatch(regexPattern, memberName, REGEX_TIMEOUT)
      } catch (e) {
        return false
      }
    }
  } else if (exactMatch) {
    if (caseSensitive) {
      matcher = async (memberName: string) => memberName === name
    } else {
      const lName = name?.toLowerCase()
      matcher = async (memberName: string) => memberName.toLowerCase() === lName
    }
  } else {
    matcher = makePartialMatcher(name ?? '', caseSensitive)
  }

  const matches = await matchMembers(members, matcher, {
    matchBot,
    matchUsername,
    matchGlobalName,
    matchNickname,
  })

  if (matches.length === 0) {
    return interaction.editReply({
      content: 'No members found matching your query.',
    })
  }

  if (matches.length === 1) {
    return interaction.editReply({
      content: formatUser(matches[0].member),
      allowedMentions: { parse: [] },
    })
  }

  const selectRow = createUserSelect(
    matches
      .sort((a, b) => a.username.localeCompare(b.username))
      .slice(0, 25)
      .map((m) => m.member.user.id),
  )

  return interaction.editReply({
    content: `Multiple members matched:\n${resultFormat(matches)}`,
    allowedMentions: { parse: [] },
    components: [ACTION_BUTTON_ROW, selectRow],
  })
}

function handleInteractionCreate(interaction: Interaction) {
  if (
    interaction.isUserSelectMenu() &&
    interaction.customId === USER_SELECT_ID
  ) {
    handleUserSelectInteraction(interaction)
  } else if (interaction.isButton()) {
    switch (interaction.customId) {
      case MENTION_ID:
        handleMentionButton(interaction)
        break
      case ID_ID:
        handleIDButton(interaction)
        break
    }
  }
}

async function handleUserSelectInteraction(
  interaction: UserSelectMenuInteraction,
) {
  const members = interaction.members.map(formatSuggestion)

  const selectRow = createUserSelect(
    interaction.members
      .sort((a, b) => a.user.username.localeCompare(b.user.username))
      .map((m) => m.user.id),
  )

  interaction.reply({
    content: resultFormat(members),
    flags: MessageFlags.Ephemeral,
    components: [ACTION_BUTTON_ROW, selectRow],
  })
}

async function handleMentionButton(interaction: ButtonInteraction) {
  const members = await getInteractionMembers(interaction)

  interaction.reply({
    flags: MessageFlags.Ephemeral,
    content: members.map((m) => `<@${m}>`).join('\n') || 'No members selected',
  })
}

async function handleIDButton(interaction: ButtonInteraction) {
  const members = await getInteractionMembers(interaction)

  interaction.reply({
    flags: MessageFlags.Ephemeral,
    content: members.join('\n') || 'No members selected',
  })
}

async function getInteractionMembers(interaction: ButtonInteraction) {
  const userSelects = getComponentsOfType(
    interaction.message.components,
    ComponentType.UserSelect,
  )

  for (const component of userSelects) {
    if (component.customId === USER_SELECT_ID) {
      return component.data.default_values?.map((d) => d.id) ?? []
    }
  }

  return []
}

function resultFormat(data: MemberMatch[]): string {
  return codeBlock(
    'm',
    cleanCodeBlockContent(
      tableFormat(data, {
        keys: ['username', 'id', 'globalName', 'nickname'],
        columnsNames: {
          username: 'Username',
          id: 'ID',
          globalName: 'Global Name',
          nickname: 'Nickname',
        },
        showNullish: false,
        characterLimit: 1900,
      }),
    ),
  )
}

async function fetchMembers(guild: Guild) {
  if (guild.memberCount === guild.members.cache.size) {
    return guild.members.cache
  }

  return guild.members.fetch()
}

// Limit the number of autocomplete options returned
const MAX_MATCHES = 25

type Matcher = (memberName: string) => Promise<boolean>

interface MatchMemberOptions {
  /** The maximum number of matches to return */
  limit?: number
  /** Whether to match against bots */
  matchBot?: boolean
  /** Whether to match against usernames */
  matchUsername?: boolean
  /** Whether to match against global names */
  matchGlobalName?: boolean
  /** Whether to match against nicknames */
  matchNickname?: boolean
}

function makePartialMatcher(query: string, caseSensitive = true): Matcher {
  if (caseSensitive) {
    return async (memberName: string) => memberName.includes(query)
  }

  const lQuery = query.toLowerCase()
  return async (memberName: string) => memberName.toLowerCase().includes(lQuery)
}

/**
 * Try to match a query against every member in a guild, returning possible matches
 * @param guild The guild to search
 * @param query The query to search with. It will be searched for case-insensitively in tag and nickname
 * @param tryExactMatch Try for an exact match. If an exact match with a tag is found, only return that
 * @returns
 */
async function matchMembers(
  members: Collection<string, GuildMember>,
  matcher: Matcher,
  {
    limit = MAX_MATCHES,
    matchBot = false,
    matchUsername = true,
    matchGlobalName = true,
    matchNickname = true,
  }: MatchMemberOptions = {},
): Promise<MemberMatch[]> {
  const matches: GuildMember[] = []

  limit = Math.min(limit, MAX_MATCHES)

  for (const m of members.values()) {
    if (!matchBot && m.user.bot) continue

    const globalName = m.user.globalName
    const tag = m.user.tag
    const nickname = m.nickname

    if (
      (matchGlobalName && globalName && (await matcher(globalName))) ||
      (matchUsername && (await matcher(tag))) ||
      (matchNickname && nickname && (await matcher(nickname)))
    ) {
      matches.push(m)
      if (matches.length >= limit) break
    }
  }

  return matches
    .map(formatSuggestion)
    .sort((a, b) => a.username.localeCompare(b.username))
}

function formatSuggestion(m: GuildMember | APIGuildMember): MemberMatch {
  if ('joined_at' in m) {
    return formatAPISuggestion(m)
  }

  const formattedUser = formatUser(m.user, {
    id: false,
    markdown: false,
    escapeMarkdown: false,
  })

  return {
    name: `${formattedUser}${m.nickname ? ` (Nickname: ${m.nickname})` : ''}`,
    value: m.user.globalName ?? m.user.tag,
    globalName: m.user.globalName,
    username: m.user.tag,
    nickname: m.nickname,
    id: m.user.id,
    member: m,
  }
}

function formatAPISuggestion(m: APIGuildMember): MemberMatch {
  const formattedUser = formatUser(m.user, {
    id: false,
    markdown: false,
    escapeMarkdown: false,
  })

  const tag =
    m.user.username + (m.user.discriminator ? `#${m.user.discriminator}` : '')

  return {
    name: `${formattedUser}${m.nick ? ` (Nickname: ${m.nick})` : ''}`,
    value: m.user.global_name ?? tag,
    globalName: m.user.global_name,
    username: tag,
    nickname: m.nick ?? null,
    id: m.user.id,
    member: m,
  }
}

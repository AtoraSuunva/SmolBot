import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
  codeBlock,
  escapeCodeBlock,
  escapeMarkdown,
  Guild,
  GuildMember,
} from 'discord.js'
import {
  AutocompleteHandler,
  formatUser,
  getGuild,
  SleetSlashCommand,
} from 'sleetcord'
import { tableFormat } from '../util/format.js'

interface MemberMatch {
  name: string
  value: string
  globalName: string | null
  username: string
  nickname: string | null
  id: string
}

const userAutocomplete: AutocompleteHandler<string> = async ({
  interaction,
  value,
}) => {
  if (!interaction.inGuild()) {
    return []
  }

  const guild = await getGuild(interaction, true)
  return (await matchMembers(guild, value)).map((m) => ({
    name: m.name,
    value: m.value,
  }))
}

export const idof = new SleetSlashCommand(
  {
    name: 'idof',
    description: 'Get the ID of a user.',
    dm_permission: false,
    options: [
      {
        name: 'user',
        description: 'The user to get the ID of.',
        type: ApplicationCommandOptionType.String,
        autocomplete: userAutocomplete,
        required: true,
      },
    ],
  },
  {
    run: runIdof,
  },
)

async function runIdof(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply()
  const user = interaction.options.getString('user', true)
  const guild = await getGuild(interaction, true)
  const matches = await matchMembers(guild, user, true)

  if (matches.length === 0) {
    return interaction.editReply(`No users found matching "${user}"`)
  } else if (matches.length === 1) {
    return interaction.editReply(matches[0].id)
  } else {
    return interaction.editReply(
      `Multiple users found matching "${escapeMarkdown(user)}":\n${resultFormat(
        matches,
      )}`,
    )
  }
}

function resultFormat(data: MemberMatch[]): string {
  return codeBlock(
    escapeCodeBlock(
      tableFormat(data, {
        keys: ['username', 'globalName', 'id', 'nickname'],
        columnsNames: {
          username: 'Username',
          globalName: 'Global Name',
          id: 'ID',
          nickname: 'Nickname',
        },
        showNullish: false,
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

/**
 * Try to match a query against every member in a guild, returning possible matches
 * @param guild The guild to search
 * @param query The query to search with. It will be searched for case-insensitively in tag and nickname
 * @param tryExactMatch Try for an exact match. If an exact match with a tag is found, only return that
 * @returns
 */
async function matchMembers(
  guild: Guild,
  query: string,
  tryExactMatch = false,
): Promise<MemberMatch[]> {
  const lowerValue = query.toLowerCase()
  const members = await fetchMembers(guild)

  const matches: GuildMember[] = []

  for (const m of members.values()) {
    if (
      tryExactMatch &&
      (m.user.globalName === query || m.user.tag === query)
    ) {
      return [formatSuggestion(m)]
    }

    if (
      !!m.user.globalName?.toLowerCase().includes(lowerValue) ||
      m.user.tag.toLowerCase().includes(lowerValue) ||
      m.nickname?.toLowerCase().includes(lowerValue)
    ) {
      matches.push(m)
      if (matches.length >= MAX_MATCHES) break
    }
  }

  return matches
    .map(formatSuggestion)
    .sort((a, b) => a.username.localeCompare(b.username))
}

function formatSuggestion(m: GuildMember): MemberMatch {
  const formattedUser = formatUser(m.user, {
    id: false,
    markdown: false,
    escape: false,
  })

  return {
    name: `${formattedUser}${m.nickname ? ` (Nickname: ${m.nickname})` : ''}`,
    value: m.user.globalName ?? m.user.tag,
    globalName: m.user.globalName,
    username: m.user.tag,
    nickname: m.nickname,
    id: m.user.id,
  }
}

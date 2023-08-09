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

interface MemberMatch {
  name: string
  value: string
  formatted: string
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
  const user = interaction.options.getString('user', true)
  const guild = await getGuild(interaction, true)
  const matches = await matchMembers(guild, user, true)

  if (matches.length === 0) {
    return interaction.reply(`No users found matching "${user}"`)
  } else if (matches.length === 1) {
    return interaction.reply(matches[0].id)
  } else {
    return interaction.reply(
      `Multiple users found matching "${escapeMarkdown(user)}":\n${tableFormat(
        matches,
      )}`,
    )
  }
}

function tableFormat(members: MemberMatch[]) {
  const longestName = Math.max(...members.map((m) => m.formatted.length))
  const longestId = Math.max(...members.map((m) => m.id.length))

  const header = `| ${'Username'.padEnd(longestName, ' ')} | ${'ID'.padEnd(
    longestId,
    ' ',
  )} | Nickname `
  const separator = `| ${'-'.repeat(longestName)} | ${'-'.repeat(
    longestId,
  )} | ${'-'.repeat(8)} `

  const rows = members.map((m) => {
    // +1 for the bidirectional marker character thing
    const bidiCount = (m.formatted.match(/\u200e/g) ?? []).length
    const name = m.formatted.padEnd(longestName + bidiCount, ' ')
    const id = m.id.padEnd(longestId, ' ')
    return `| ${name} | ${id} | ${m.nickname ?? ''}`
  })

  return codeBlock(
    escapeCodeBlock(`${header}\n${separator}\n${rows.join('\n')}`),
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
    .sort((a, b) => a.formatted.localeCompare(b.formatted))
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
    formatted: formattedUser,
    nickname: m.nickname,
    id: m.user.id,
  }
}

import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
  escapeMarkdown,
} from 'discord.js'
import { getGuild, SleetSlashCommand } from 'sleetcord'
import { SECOND } from 'sleetcord-common'
import { setTimeout } from 'timers/promises'
import { plural } from '../util/format.js'

export const count_members = new SleetSlashCommand(
  {
    name: 'count_members',
    description: 'Counts the number of members in a guild',
    dm_permission: false,
    options: [
      {
        name: 'name_contains',
        description: "Count members who's name contains this string",
        type: ApplicationCommandOptionType.String,
      },
    ],
  },
  {
    run: runCountMembers,
  },
)

async function runCountMembers(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)
  const nameContains = interaction.options.getString('name_contains')

  if (!nameContains) {
    const count = guild.memberCount
    return interaction.reply(
      `There ${plural('is', count, { includeCount: false })} ${plural(
        'member',
        count,
      )} in this guild.`,
    )
  }

  await interaction.deferReply()

  const members = await Promise.race([
    setTimeout(10 * SECOND),
    guild.members.fetch(),
  ])

  if (!members) {
    return interaction.editReply(
      'Timed out while trying to fetch members, try again later.',
    )
  }

  const nameContainsLower = nameContains.toLowerCase()
  const count = members.filter((member) =>
    member.user.username.toLowerCase().includes(nameContainsLower),
  ).size

  return interaction.editReply(
    `${plural('member', count)} ${plural('has', count, {
      includeCount: false,
    })} **"${escapeMarkdown(nameContains)}"** in their name.`,
  )
}

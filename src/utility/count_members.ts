import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
  escapeMarkdown,
} from 'discord.js'
import { getGuild, SleetSlashCommand } from 'sleetcord'
import { SECOND } from '../util/constants.js'
import { setTimeout } from 'timers/promises'

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
    return interaction.reply(
      `There are **${guild.memberCount.toLocaleString()}** members in this guild.`,
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
    `**${count.toLocaleString()}** member${
      count === 1 ? ' has' : 's have'
    } **"${escapeMarkdown(nameContains)}"** in their name.`,
  )
}

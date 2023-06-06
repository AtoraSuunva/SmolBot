import { stringify } from 'csv-stringify'
import {
  ApplicationCommandOptionType,
  AttachmentPayload,
  ChatInputCommandInteraction,
  User,
} from 'discord.js'
import { SleetSlashSubcommand, getGuild, getRoles, getUsers } from 'sleetcord'
import { prisma } from '../../util/db.js'

export const mark_joined = new SleetSlashSubcommand(
  {
    name: 'mark_joined',
    description:
      'Mark users as having joined the server. Filter options act as AND.',
    options: [
      {
        name: 'users',
        description:
          'The users to mark as having joined, @mention them. (Default: all users)',
        type: ApplicationCommandOptionType.String,
      },
      {
        name: 'roles',
        description:
          'The roles required to be marked as having joined, @mention them. (Default: no roles required)',
        type: ApplicationCommandOptionType.String,
      },
      {
        name: 'invert',
        description:
          "Invert the selection, instead mark users who DON'T match. (Default: False)",
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'remove',
        description: 'Marks users as never having joined. (Default: False)',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'dry-run',
        description:
          "Don't actually mark users, just show who would be marked. (Default: False)",
        type: ApplicationCommandOptionType.Boolean,
      },
    ],
  },
  {
    run: runMarkJoined,
  },
)

async function runMarkJoined(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)
  const users = await getUsers(interaction, 'users', false)
  const roles = await getRoles(interaction, 'roles', false)
  const invert = interaction.options.getBoolean('invert', false) ?? false
  const remove = interaction.options.getBoolean('remove', false) ?? false
  const dryRun = interaction.options.getBoolean('dry-run', false) ?? false

  const defer = interaction.deferReply()

  const toEdit = new Set<User>()
  const members = await guild.members.fetch()

  if (!users || roles || invert) {
    const userSet = new Set(users?.map((u) => u.id) ?? [])
    const roleSet = new Set(roles?.map((r) => r.id) ?? [])

    for (const member of members.values()) {
      const userMatches =
        (!users || userSet.has(member.user.id)) &&
        (!roles || member.roles.cache.some((r) => roleSet.has(r.id)))

      if (userMatches !== invert) {
        toEdit.add(member.user)
      }
    }
  } else {
    for (const user of users) {
      toEdit.add(user)
    }
  }

  const toEditArray = Array.from(toEdit.values())

  const files: AttachmentPayload[] =
    toEditArray.length === 0
      ? []
      : [
          {
            name: 'marked.csv',
            attachment: stringify(
              toEditArray.map((u) => ({ username: u.username, id: u.id })),
              {
                header: true,
              },
            ),
            description: 'Users marked',
          },
        ]

  if (dryRun) {
    await defer

    await interaction.editReply({
      content: `Would mark ${toEditArray.length} users as ${
        remove ? 'never having joined' : 'having joined'
      }.`,
      files,
    })

    return
  }

  if (remove) {
    await prisma.welcomeJoins.deleteMany({
      where: {
        guildID: guild.id,
        userID: {
          in: toEditArray.map((u) => u.id),
        },
      },
    })
  } else {
    // Not in SQLite :(
    // prisma.welcomeJoins.createMany({
    //   data: toEditArray.map((u) => ({
    //     guildID: guild.id,
    //     userID: u.id,
    //   })),
    //   skipDuplicates: true,
    // })

    for (const user of toEditArray) {
      try {
        await prisma.welcomeJoins.upsert({
          where: {
            guildID_userID: {
              guildID: guild.id,
              userID: user.id,
            },
          },
          create: {
            guildID: guild.id,
            userID: user.id,
          },
          update: {},
        })
      } catch {
        // ignore
      }
    }
  }

  await defer
  await interaction.editReply({
    content: `Marked ${toEditArray.length} users as ${
      remove ? 'never having joined' : 'having joined'
    }.`,
    files,
  })
}

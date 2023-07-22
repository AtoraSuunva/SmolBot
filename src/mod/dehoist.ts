import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
  GuildMember,
  PartialGuildMember,
} from 'discord.js'
import {
  SleetSlashCommand,
  botHasPermissionsGuard,
  getGuild,
  getMembers,
} from 'sleetcord'
import { plural } from '../util/format.js'
import { prisma } from '../util/db.js'
import { Prisma } from '@prisma/client'

export const dehoist = new SleetSlashCommand(
  {
    name: 'dehoist',
    description:
      'Dehoists users by placing an invisible character in front of their name',
    dm_permission: false,
    default_member_permissions: ['ManageNicknames'],
    options: [
      {
        name: 'members',
        description:
          'The members to dehoist, regardless if their display name matches the hoist characters or not',
        type: ApplicationCommandOptionType.String,
      },
      {
        name: 'hoist_characters',
        description:
          'Dehoist the user if a display name starts with one of these characters (default: "!")',
        type: ApplicationCommandOptionType.String,
      },
      {
        name: 'dehoist_prepend',
        description:
          "Characters to add in front of a user's name to dehoist them (default: `U+17B5`)",
        type: ApplicationCommandOptionType.String,
      },
      {
        name: 'automatic',
        description:
          'Automatically dehoist on join, username/nickname change using the provided options (default: false)',
        type: ApplicationCommandOptionType.Boolean,
      },
    ],
  },
  {
    run: runDehoist,
    guildMemberAdd: checkToDehoist,
    guildMemberUpdate: (_, newMember) => checkToDehoist(newMember),
    guildMemberAvailable: checkToDehoist,
  },
)

interface DehoistSettings {
  hoistCharacters: string[]
  dehoistPrepend: string
  force?: boolean
}

interface DehoistResult {
  dehoisted: number
  failed: number
}

async function runDehoist(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)
  await botHasPermissionsGuard(interaction, ['ManageNicknames'])

  const hoistCharacters = (
    interaction.options.getString('hoist_characters') ?? '!'
  ).split('')
  const dehoistPrepend =
    interaction.options.getString('dehoist_prepend') ?? '\u{17B5}'
  const automatic = interaction.options.getBoolean('automatic')

  await interaction.deferReply()

  const members = interaction.options.getString('members')
    ? await getMembers(interaction, 'members', true)
    : await guild.members
        .fetch()
        .then((members) =>
          members
            .filter((m) => hoistCharacters.includes(m.displayName[0]))
            .toJSON(),
        )

  if (members.length === 0) {
    await interaction.editReply('No members to dehoist!')
    return
  }

  await interaction.editReply(
    `Found ${plural('member', members.length)} to dehoist, dehoisting...`,
  )

  const { dehoisted, failed } = await dehoistMembers(members, {
    hoistCharacters,
    dehoistPrepend,
    force: true,
  })

  if (automatic !== null) {
    const update: Prisma.AutomaticDehoistUpdateInput = {
      guildID: guild.id,
      enabled: automatic,
    }

    const hc = interaction.options.getString('hoist_characters')
    if (hc) {
      update.hoistCharacters = hc
    }

    const dp = interaction.options.getString('dehoist_prepend')
    if (dp) {
      update.dehoistPrepend = dp
    }

    await prisma.automaticDehoist.upsert({
      where: { guildID: guild.id },
      create: {
        guildID: guild.id,
        enabled: automatic,
        dehoistPrepend,
        hoistCharacters: hoistCharacters.join(''),
      },
      update,
    })
  }

  await interaction.editReply(
    `Dehoisted ${plural('member', dehoisted)}!` +
      (failed > 0 ? ` Failed to dehoist ${plural('member', failed)}.` : ''),
  )
}

async function checkToDehoist(member: GuildMember | PartialGuildMember) {
  const guild = member.guild
  const settings = await prisma.automaticDehoist.findUnique({
    where: { guildID: guild.id },
  })

  if (!settings || !settings.enabled) return

  const hoistCharacters = settings.hoistCharacters.split('')

  await dehoistMembers([member], {
    hoistCharacters,
    dehoistPrepend: settings.dehoistPrepend,
  })
}

async function dehoistMembers(
  members: (GuildMember | PartialGuildMember)[],
  settings: DehoistSettings = {
    hoistCharacters: ['!'],
    dehoistPrepend: '\u{17B5}',
    force: false,
  },
): Promise<DehoistResult> {
  const { hoistCharacters, dehoistPrepend, force } = settings

  let dehoisted = 0
  let failed = 0

  for (const member of members) {
    if (!force && !hoistCharacters.includes(member.displayName[0])) continue

    try {
      if (!member.manageable) continue
      await member.setNickname(dehoistPrepend + member.displayName, 'Dehoist')
      dehoisted++
    } catch {
      failed++
    }
  }

  return { dehoisted, failed }
}

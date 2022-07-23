import { WelcomeSettings } from '@prisma/client'
import { ApplicationCommandOptionType } from 'discord-api-types/v10'
import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js'
import { getGuild, getTextBasedChannel, SleetSlashSubcommand } from 'sleetcord'
import { TextChannelTypes } from '../../util/constants.js'
import { prisma } from '../../util/db.js'

export const config = new SleetSlashSubcommand(
  {
    name: 'config',
    description: 'View or edit the welcome config.',
    options: [
      {
        name: 'message',
        description:
          'The welcome message, see `/welcome message`. (default: "Welcome {@user}!")',
        type: ApplicationCommandOptionType.String,
      },
      {
        name: 'channel',
        description:
          'A specific channel to send the message in, if any. (default: "none")',
        type: ApplicationCommandOptionType.Channel,
        channel_types: TextChannelTypes,
      },
      {
        name: 'rejoins',
        description:
          'Re-welcome users if they leave and rejoin after previously being welcome (default: false)',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'instant',
        description:
          'Send the welcome message instantly, or wait for first message (default: false)',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'ignore_roles',
        description: 'Ignore users with these roles (default: none)',
        type: ApplicationCommandOptionType.Role,
      },
      {
        name: 'react_with',
        description:
          "React to the user's first message with this emoji (default: none)",
        type: ApplicationCommandOptionType.String,
      },
    ],
  },
  {
    run: runConfig,
  },
)

async function runConfig(interaction: ChatInputCommandInteraction) {
  const defer = interaction.deferReply()

  const guild = await getGuild(interaction, true)
  const message = interaction.options.getString('message')
  const channel = await getTextBasedChannel(interaction, 'channel')
  const rejoins = interaction.options.getBoolean('rejoins')
  const instant = interaction.options.getBoolean('instant')
  // const ignoreRoles = await getRoles(interaction, 'ignore_roles')
  // TODO: get emoji
  const reactWith = interaction.options.getString('react_with')

  const welcome = await prisma.welcomeSettings.findUnique({
    where: {
      guild_id: guild.id,
    },
  })

  await defer

  // No settings specified, show the current settings
  if (
    interaction.options.data.filter(
      opt =>
        ![
          ApplicationCommandOptionType.Subcommand,
          ApplicationCommandOptionType.SubcommandGroup,
        ].includes(opt.type),
    ).length === 0
  ) {
    if (!welcome) {
      return interaction.editReply({
        content: "No welcome config found, and you aren't setting one up.",
      })
    } else {
      const embed = createWelcomeEmbed(welcome)
      return interaction.editReply({
        content: 'These are your current settings',
        embeds: [embed],
      })
    }
  }

  let newWelcome: WelcomeSettings | null = welcome
  if (newWelcome !== null) Object.assign(newWelcome, welcome)

  // Settings specified, edit the current settings
  if (!welcome || !newWelcome) {
    newWelcome = {
      guild_id: guild.id,
      message: message ?? 'Welcome {@user}!',
      channel: channel?.id ?? null,
      rejoins: rejoins ?? false,
      instant: instant ?? false,
      // ignore_roles: ignoreRoles?.map((r) => r.id) ?? [],
      reactWith: reactWith ?? '',
      reactAnimated: false,
    }
  } else {
    if (message !== null) newWelcome.message = message
    if (channel !== null) newWelcome.channel = channel.id
    if (rejoins !== null) newWelcome.rejoins = rejoins
    if (instant !== null) newWelcome.instant = instant
    // if (ignoreRoles !== null) newWelcome.ignore_roles = ignoreRoles.map((r) => r.id)
    if (reactWith !== null) newWelcome.reactWith = reactWith
  }

  const updatedWelcome = await prisma.welcomeSettings.upsert({
    where: {
      guild_id: guild.id,
    },
    create: newWelcome,
    update: newWelcome,
  })

  const oldSettings = createWelcomeEmbed(welcome).setFooter({
    text: 'Old settings',
  })
  const newSettings = createWelcomeEmbed(updatedWelcome).setFooter({
    text: 'New settings',
  })

  return interaction.editReply({
    content: 'Updated your settings',
    embeds: [oldSettings, newSettings],
  })
}

const displayFormatters = {
  channel: (c: string | null) => (c ? `<#${c}>` : 'Same channel'),
  ignore_roles: (r: string[]) =>
    r ? r.map(i => `<@&${i}>`).join(', ') || 'None' : 'None',
  react_with: (r: string, data: WelcomeSettings) => {
    if (!r) return 'None'
    if (/\d+/.test(r)) return `<${data.reactAnimated ? 'a' : ''}:_:${r}>`
    return r
  },
}

function createWelcomeEmbed(welcome: WelcomeSettings | null): EmbedBuilder {
  if (welcome === null) {
    return new EmbedBuilder().setTitle('No welcome config.')
  }

  const embed = new EmbedBuilder().setTitle('Welcome Config').addFields([
    { name: 'message', value: welcome.message, inline: true },
    {
      name: 'channel',
      value: displayFormatters.channel(welcome.channel),
      inline: true,
    },
    { name: 'rejoins', value: String(welcome.rejoins), inline: true },
    { name: 'instant', value: String(welcome.instant), inline: true },
    { name: 'ignore_roles', value: 'welcome.ignore_roles', inline: true },
    {
      name: 'react_with',
      value: displayFormatters.react_with(welcome.reactWith, welcome),
      inline: true,
    },
  ])

  return embed
}

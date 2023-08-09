import { WelcomeSettings, Prisma } from '@prisma/client'
import {
  APIEmbedField,
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
  CommandInteraction,
  CommandInteractionOption,
  Constants,
  EmbedBuilder,
} from 'discord.js'
import {
  getGuild,
  getRoles,
  getTextBasedChannel,
  SleetSlashSubcommand,
} from 'sleetcord'
import { prisma } from '../../util/db.js'
import { welcomeCache } from './cache.js'

type NewWelcomeSettings = Prisma.WelcomeSettingsCreateInput | null

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
        channel_types: Constants.GuildTextBasedChannelTypes,
      },
      {
        name: 'unset_channel',
        description:
          'Reset to sending welcome messages to the same channel as the first message',
        type: ApplicationCommandOptionType.Boolean,
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
        description: 'Ignore users with these roles (default: "none")',
        type: ApplicationCommandOptionType.String,
      },
      {
        name: 'react_with',
        description:
          'React to the user\'s first message with this emoji (default: "none")',
        type: ApplicationCommandOptionType.String,
      },
    ],
  },
  {
    run: runConfig,
  },
)

function isSubcommandOption(option: CommandInteractionOption): boolean {
  return [
    ApplicationCommandOptionType.Subcommand,
    ApplicationCommandOptionType.SubcommandGroup,
  ].includes(option.type)
}

function getAllOptions(
  options: readonly CommandInteractionOption[],
): CommandInteractionOption[] {
  return options.flatMap((option) => {
    if (isSubcommandOption(option)) {
      return option.options ? getAllOptions(option.options) : []
    }
    return option
  })
}

/**
 * Checks how many options the user specified for the interaction,
 * excluding subcommands and subcommand groups
 * @param interaction The interaction to check
 * @returns The number of options specified
 */
function getOptionCount(interaction: CommandInteraction): number {
  const allOptions = getAllOptions(interaction.options.data)
  return allOptions.length
}

const unicodeEmojiRegex = /\p{RGI_Emoji}/gv
const discordEmojiRegex = /<(?<animated>a)?:(?<name>\w{2,}):(?<id>\d+)>/

function getEmoji(
  interaction: ChatInputCommandInteraction,
  name: string,
  required = false,
): string | null {
  const option = interaction.options.getString(name, required)

  if (option === null) {
    return null
  }

  const unicodeEmoji = option.match(unicodeEmojiRegex)

  if (unicodeEmoji) {
    return unicodeEmoji[0]
  }

  const discordEmoji = option.match(discordEmojiRegex)

  if (discordEmoji) {
    return discordEmoji[0]
  }

  return null
}

async function runConfig(interaction: ChatInputCommandInteraction) {
  const defer = interaction.deferReply()

  const guild = await getGuild(interaction, true)
  const message = interaction.options.getString('message')
  // Can be unset
  const channel = await getTextBasedChannel(interaction, 'channel')
  const unsetChannel = interaction.options.getBoolean('unset_channel')
  const rejoins = interaction.options.getBoolean('rejoins')
  const instant = interaction.options.getBoolean('instant')
  // Can be empty
  const ignoreRolesOption = await getRoles(interaction, 'ignore_roles')
  const ignoreRoles =
    ignoreRolesOption?.map((role) => role.id).join(',') ?? null
  // Can be unset
  const reactWith = getEmoji(interaction, 'react_with')
  const reactWithOption = interaction.options.get('react_with')

  const welcome = await prisma.welcomeSettings.findUnique({
    where: {
      guildID: guild.id,
    },
  })

  await defer

  // No options specified, show the current settings
  if (getOptionCount(interaction) === 0) {
    if (!welcome) {
      return interaction.editReply({
        content:
          "You don't have an existing welcome config, use `/welcome config` with options to create one.",
      })
    } else {
      const embed = createWelcomeEmbed(welcome)
      return interaction.editReply({
        content: 'These are your current settings',
        embeds: [embed],
      })
    }
  }

  // Settings specified, edit the current settings

  // Clone the old welcome so we can show a diff
  let newWelcome: NewWelcomeSettings = structuredClone(welcome)
  const changes: string[] = []

  if (!welcome || !newWelcome) {
    // No previous welcome, create a new one
    newWelcome = {
      guildID: guild.id,
      message: message ?? 'Welcome {@user}!',
      channel: channel?.id ?? null,
      rejoins: rejoins ?? false,
      instant: instant ?? false,
      ignoreRoles: ignoreRoles ?? '',
      reactWith: reactWith,
    }
  } else {
    // Previous welcome, edit it
    if (message !== null)
      (newWelcome.message = message), changes.push('message')
    if (channel !== null)
      (newWelcome.channel = channel.id), changes.push('channel')
    if (unsetChannel === true)
      (newWelcome.channel = null), changes.push('channel')
    if (rejoins !== null)
      (newWelcome.rejoins = rejoins), changes.push('rejoins')
    if (instant !== null)
      (newWelcome.instant = instant), changes.push('instant')
    if (ignoreRoles !== null)
      (newWelcome.ignoreRoles = ignoreRoles), changes.push('ignore_roles')
    if (reactWith !== null)
      (newWelcome.reactWith = reactWith), changes.push('react_with')
    if (String(reactWithOption?.value).toLowerCase() === 'none')
      (newWelcome.reactWith = null), changes.push('react_with')
  }

  // There's an old config and no changes were made
  if (welcome && changes.length === 0) {
    return interaction.editReply({
      content: 'No changes made, failed to parse your options',
    })
  }

  const updatedWelcome = await prisma.welcomeSettings.upsert({
    where: {
      guildID: guild.id,
    },
    create: newWelcome,
    update: newWelcome,
  })

  welcomeCache.set(guild.id, updatedWelcome)

  const oldSettings = createWelcomeEmbed(welcome).setFooter({
    text: 'Old settings',
  })
  const newSettings = createWelcomeEmbed(updatedWelcome, changes).setFooter({
    text: 'New settings',
  })

  return interaction.editReply({
    content: 'Updated your settings',
    embeds: [oldSettings, newSettings],
  })
}

const displayFormatters = {
  channel: (c: string | null) => (c ? `<#${c}>` : 'Same channel'),
  ignore_roles: (r: string) =>
    r
      .split(',')
      .filter((v) => v.trim() !== '')
      .map((i) => `<@&${i}>`)
      .join(', ') || 'None',
  react_with: (r: string | null) => r ?? 'None',
}

function createWelcomeEmbed(
  welcome: WelcomeSettings | null,
  changes: string[] = [],
): EmbedBuilder {
  if (welcome === null) {
    return new EmbedBuilder()
      .setTitle('No welcome config.')
      .setDescription('Any missing settings will be set to defaults.')
  }

  const fields: APIEmbedField[] = [
    { name: 'message', value: welcome.message, inline: true },
    {
      name: 'channel',
      value: displayFormatters.channel(welcome.channel),
      inline: true,
    },
    { name: 'rejoins', value: String(welcome.rejoins), inline: true },
    { name: 'instant', value: String(welcome.instant), inline: true },
    {
      name: 'ignore_roles',
      value: displayFormatters.ignore_roles(welcome.ignoreRoles),
      inline: true,
    },
    {
      name: 'react_with',
      value: displayFormatters.react_with(welcome.reactWith),
      inline: true,
    },
  ].map((field) => ({
    ...field,
    name: changes.includes(field.name) ? `🟡 ${field.name}` : field.name,
  }))

  return new EmbedBuilder().addFields(fields)
}
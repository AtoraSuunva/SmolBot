import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  Interaction,
} from 'discord.js'
import { getGuild, SleetSlashCommand } from 'sleetcord'

export const timeout_button = new SleetSlashCommand(
  {
    name: 'timeout_button',
    description: 'Create a timeout button for funny',
    dm_permission: false,
    default_member_permissions: ['ModerateMembers'],
    options: [
      {
        name: 'message',
        description: 'The message to send with the button',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: 'time',
        description:
          'The time to timeout the user for, in seconds (default: 60s)',
        type: ApplicationCommandOptionType.Integer,
        min_value: 1,
        max_value: 24 * 60 * 60, // 1 Day
      },
    ],
  },
  {
    run: runTimeoutButton,
    interactionCreate: handleInteractionCreate,
  },
)

function runTimeoutButton(interaction: ChatInputCommandInteraction) {
  const message = interaction.options.getString('message', true)
  const time = interaction.options.getInteger('time') ?? 60

  const timeoutButton = new ButtonBuilder()
    .setStyle(ButtonStyle.Danger)
    .setCustomId(`timeout_button:${time}`)
    .setLabel(`Timeout for ${time} seconds`)

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(timeoutButton)

  interaction.reply({
    content: message,
    components: [row],
  })
}

async function handleInteractionCreate(interaction: Interaction) {
  if (interaction.isButton() && interaction.inGuild()) {
    const [command, timeString] = interaction.customId.split(':')

    if (command === 'timeout_button') {
      const time = parseInt(timeString, 10)
      const guild = await getGuild(interaction, true)
      const member = await guild.members.fetch(interaction.user.id)

      try {
        await member.timeout(time * 1000, 'Timeout Button [funny]')

        interaction.reply({
          content: `You have been timed out for ${time} seconds`,
          ephemeral: true,
        })
      } catch {
        interaction.reply({
          content: 'Failed to time you out, pretend it happened.',
          ephemeral: true,
        })
      }
    }
  }
}

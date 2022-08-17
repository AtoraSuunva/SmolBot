import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
} from 'discord.js'
import { SleetSlashCommand, getTextBasedChannel, inGuild } from 'sleetcord'

export const send = new SleetSlashCommand(
  {
    name: 'send',
    description: 'Send a message as the bot',
    dm_permission: false,
    options: [
      {
        name: 'message',
        description: 'The message to send',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: 'channel',
        description:
          'The channel to send the message to (default: same channel)',
        type: ApplicationCommandOptionType.Channel,
      },
    ],
    registerOnlyInGuilds: [],
  },
  {
    run: runSend,
  },
)

async function runSend(interaction: ChatInputCommandInteraction) {
  inGuild(interaction)

  const message = interaction.options.getString('message', true)
  const channel =
    (await getTextBasedChannel(interaction, 'channel')) ?? interaction.channel

  if (channel === null) {
    return interaction.reply({
      ephemeral: true,
      content: 'Failed to get the channel to send a message in.',
    })
  }

  if (!channel.permissionsFor(interaction.user)?.has('SendMessages')) {
    return interaction.reply({
      ephemeral: true,
      content: `You do not have permission to send messages in ${channel}`,
    })
  }

  if (
    !interaction.client.user ||
    !channel.permissionsFor(interaction.client.user)?.has('SendMessages')
  ) {
    return interaction.reply({
      ephemeral: true,
      content: `I do not have permission to send messages in ${channel}`,
    })
  }

  await channel.send(message)
  return interaction.reply(`Sent message in ${channel}`)
}

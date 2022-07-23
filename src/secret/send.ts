import { ApplicationCommandOptionType } from 'discord-api-types/v10'
import { CommandInteraction } from 'discord.js'
import { SleetSlashCommand, getTextBasedChannel } from 'sleetcord'
import { TextChannelTypes } from '../util/constants.js'

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
        channel_types: TextChannelTypes,
      },
    ],
  },
  {
    run: runSend,
  },
)

async function runSend(interaction: CommandInteraction) {
  if (!interaction.channel?.isText() || !('guild' in interaction.channel)) {
    return interaction.reply({
      ephemeral: true,
      content: 'This command can only be used in text channels',
    })
  }

  const message = interaction.options.getString('message', true)
  const channel =
    (await getTextBasedChannel(interaction, 'channel')) ?? interaction.channel

  if (!channel.permissionsFor(interaction.user)?.has('SEND_MESSAGES')) {
    return interaction.reply({
      ephemeral: true,
      content: `You do not have permission to send messages in ${channel}`,
    })
  }

  if (
    !interaction.client.user ||
    !channel.permissionsFor(interaction.client.user)?.has('SEND_MESSAGES')
  ) {
    return interaction.reply({
      ephemeral: true,
      content: `I do not have permission to send messages in ${channel}`,
    })
  }

  await channel.send(message)
  interaction.reply(`Sent message in ${channel}`)
}

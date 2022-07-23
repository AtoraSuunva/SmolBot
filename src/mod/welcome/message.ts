import { ChatInputCommandInteraction } from 'discord.js'
import { SleetSlashSubcommand } from 'sleetcord'

export const message = new SleetSlashSubcommand(
  {
    name: 'message',
    description: 'Get details about welcome messages',
  },
  {
    run: runMessage,
  },
)

const supported = [
  ['{@user}', 'Mentions the welcomed user'],
  [
    '{#origin-channel}',
    'Mentions the channel where the user posted their first message',
  ],
  [
    '{#welcome-channel}',
    'Mentions the channel where the welcome message is posted',
  ],
  ['{server-name}', 'Replaced with the server name'],
]
  .map(([key, value]) => `  \`${key}\` - ${value}`)
  .join('\n')

const messageInfo = `There is (some) support for dynamic welcome message content:\n${supported}`

function runMessage(interaction: ChatInputCommandInteraction) {
  interaction.reply({
    ephemeral: true,
    content: messageInfo,
  })
}

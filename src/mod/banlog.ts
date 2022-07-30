import { ApplicationCommandOptionType } from 'discord-api-types/v10'
import { ChatInputCommandInteraction, codeBlock } from 'discord.js'
import { SleetSlashCommand, makeChoices } from 'sleetcord'

const typeChoices = makeChoices(['Ban', 'Unban', 'Kick', 'Mute'])

/** Creates a banlog in case pollr is down goddamn again or something */
export const banlog = new SleetSlashCommand(
  {
    name: 'banlog',
    description: 'Create a banlog for some action',
    options: [
      {
        name: 'user',
        description: 'The user to create the log for',
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      {
        name: 'reason',
        description: 'The reason for the log',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: 'type',
        description: 'The type of log to create (default: ban)',
        type: ApplicationCommandOptionType.String,
        choices: typeChoices,
      },
      {
        name: 'responsible',
        description: 'The responsible moderator for the log (default: you)',
        type: ApplicationCommandOptionType.User,
      },
    ],
  },
  {
    run: runBanlog,
  },
)

function runBanlog(interaction: ChatInputCommandInteraction) {
  const user = interaction.options.getUser('user', true)
  const reason = interaction.options.getString('reason', true)
  const type = interaction.options.getString('type', false) ?? 'Ban'
  const responsible =
    interaction.options.getUser('responsible', false) ?? interaction.user

  const log = [
    `**${type}**`,
    `**User:** ${user.tag} (${user.id})`,
    `**Reason:** ${reason}`,
    `**Responsible Moderator**: ${responsible.tag}`,
  ].join('\n')

  interaction.reply({
    ephemeral: true,
    content: codeBlock(log),
  })
}

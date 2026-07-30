import {
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  codeBlock,
  InteractionContextType,
  MessageFlags,
  type AttachmentPayload,
  type ChatInputCommandInteraction,
  type PartialPollAnswer,
  type PollAnswer,
} from 'discord.js'
import {
  escapeAllMarkdown,
  formatUser,
  SleetSlashCommand,
  type AutocompleteHandler,
} from 'sleetcord'

const pollOptionAutocomplete: AutocompleteHandler<string> = async ({ value, interaction }) => {
  const messageId = interaction.options.getString('message_id', true)

  const message = await interaction.channel?.messages.fetch(messageId).catch(() => null)

  if (!message) {
    return []
  }

  const { poll } = message

  if (!poll) {
    return []
  }

  const answers = value ? poll.answers.filter(makeAnswerFilter(value)) : poll.answers

  return answers
    .map((a) => ({
      name: `(${a.id}) ${a.text || ''}`,
      value: `(${a.id}) ${a.text || ''}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export const poll_votes = new SleetSlashCommand(
  {
    name: 'poll_votes',
    description: 'List the users who voted in a poll.',
    contexts: [
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel,
    ],
    integration_types: [ApplicationIntegrationType.GuildInstall],
    default_member_permissions: ['ManageMessages'],
    options: [
      {
        name: 'message_id',
        type: ApplicationCommandOptionType.String,
        description: 'The message ID of the poll.',
        required: true,
      },
      {
        name: 'poll_option',
        type: ApplicationCommandOptionType.String,
        description: 'The poll option to list votes for (id, emoji, or text). (default: all)',
        autocomplete: pollOptionAutocomplete,
      },
      {
        name: 'only_id',
        type: ApplicationCommandOptionType.Boolean,
        description: 'Whether to only show user IDs instead of mentions. (default: false)',
      },
    ],
  },
  {
    run: runPollVotes,
  },
)

async function runPollVotes(interaction: ChatInputCommandInteraction) {
  const messageId = interaction.options.getString('message_id', true)
  const pollOption = interaction.options.getString('poll_option', false)
  const onlyId = interaction.options.getBoolean('only_id', false) ?? false

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  const message = await interaction.channel?.messages.fetch(messageId).catch(() => null)

  if (!message) {
    await interaction.editReply({ content: 'Could not find the message with that ID.' })
    return
  }

  const { poll } = message

  if (!poll) {
    await interaction.editReply({ content: 'That message is not a poll.' })
    return
  }

  const answers = pollOption ? poll.answers.filter(makeAnswerFilter(pollOption)) : poll.answers

  if (answers.size === 0) {
    await interaction.editReply({ content: 'Could not find that poll option.' })
    return
  }

  let output = ''

  for (const answer of answers.values()) {
    const votes = await answer.voters.fetch()

    for (const user of votes.values()) {
      output += `${onlyId ? user.id : formatUser(user, { markdown: false })}\n`
    }
  }

  let files: AttachmentPayload[] = []

  if (output === '') {
    output = 'No votes found.'
  } else if (output.length > 1500) {
    output = ''

    files = [
      {
        name: 'votes.txt',
        attachment: Buffer.from(output, 'utf-8'),
      },
    ]
  } else {
    output = codeBlock(output)
  }

  const answersList =
    answers.size > 1
      ? '\n' + answers.map((a) => `- ${escapeAllMarkdown(a.text || '')}`).join('\n')
      : answers.map((a) => escapeAllMarkdown(a.text || '')).join(', ')

  await interaction.editReply({
    content: `Votes for poll option${answers.size === 1 ? '' : 's'}: **${answersList}**\n${output}`,
    files,
  })
}

function makeAnswerFilter(pollOption: string): (value: PartialPollAnswer | PollAnswer) => boolean {
  return (value) =>
    `${value.id}` === pollOption ||
    value.emoji?.id === pollOption ||
    value.emoji?.name === pollOption ||
    value.text?.includes(pollOption) ||
    `(${value.id}) ${value.text || ''}` === pollOption
}

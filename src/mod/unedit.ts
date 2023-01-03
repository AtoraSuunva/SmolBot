import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
  codeBlock,
  Collection,
  CommandInteraction,
  Message,
  MessageContextMenuCommandInteraction,
  PartialMessage,
} from 'discord.js'
import { SleetSlashCommand, isLikelyID, SleetMessageCommand } from 'sleetcord'

export const unedit = new SleetSlashCommand(
  {
    name: 'unedit',
    description: 'Unedits a message',
    default_member_permissions: ['ManageMessages'],
    dm_permission: false,
    options: [
      {
        name: 'message_link',
        type: ApplicationCommandOptionType.String,
        description: 'A message link or message id of the message to unedit',
        required: true,
      },
    ],
  },
  {
    messageUpdate: handleMessageUpdate,
    run: runUneditSlashCommand,
  },
)

export const unedit_message = new SleetMessageCommand(
  {
    name: 'Unedit Message',
  },
  {
    run: runUneditContextMenu,
  },
)

interface EditStoreEntry {
  lastEditTimestamp: number
  edits: string[]
}

const editStore = new Collection<string, EditStoreEntry>()

/** 3 hours in ms */
const sweepLifetime = 1000 * 60 * 60 * 3

const editSweeper = (value: EditStoreEntry) =>
  Date.now() - value.lastEditTimestamp > sweepLifetime

async function handleMessageUpdate(
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage,
) {
  if (newMessage.content === null) {
    return
  }

  const previousEdits = editStore.get(newMessage.id) ?? {
    lastEditTimestamp:
      oldMessage.editedTimestamp ?? oldMessage.createdTimestamp,
    edits: [oldMessage.content ?? '[Initial message content not cached]'],
  }

  previousEdits.edits.push(newMessage.content)
  previousEdits.lastEditTimestamp =
    newMessage.editedTimestamp ?? newMessage.createdTimestamp
  editStore.set(newMessage.id, previousEdits)

  // Remove all older entries to keep memory from endlessly growing
  editStore.sweep(editSweeper)
}

function runUneditSlashCommand(interaction: ChatInputCommandInteraction) {
  const messageLink = interaction.options.getString('message_link', true)
  const messageID = getMessageId(messageLink)

  if (messageID === null) {
    return interaction.reply({
      ephemeral: true,
      content: 'Invalid message link or message ID.',
    })
  }

  return runUnedit(interaction, messageID, false)
}

function runUneditContextMenu(
  interaction: MessageContextMenuCommandInteraction,
  message: Message,
) {
  runUnedit(interaction, message.id, true)
}

function runUnedit(
  interaction: CommandInteraction,
  messageID: string,
  ephemeral: boolean,
) {
  const previousEdits = editStore.get(messageID)

  if (!previousEdits || previousEdits.edits.length === 0) {
    return interaction.reply({
      ephemeral: true,
      content: 'That message has no cached edits, or was never edited',
    })
  }

  const edits = codeBlock('json', JSON.stringify(previousEdits.edits, null, 2))

  return interaction.reply({
    content: edits,
    ephemeral,
  })
}

const messageLinkRegex =
  /https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/(?<guildId>\d+)\/(?<channelId>\d+)\/(?<messageId>\d+)/i

interface MessageLinkMatches {
  guildId: string
  channelId: string
  messageId: string
}

function getMessageLinkIds(str: string): MessageLinkMatches | null {
  const matches = str.match(messageLinkRegex)

  if (!matches || matches.groups === undefined) {
    return null
  }

  return {
    guildId: matches.groups.guildId,
    channelId: matches.groups.channelId,
    messageId: matches.groups.messageId,
  }
}

function getMessageId(str: string): string | null {
  if (isLikelyID(str)) {
    return str
  } else {
    return getMessageLinkIds(str)?.messageId ?? null
  }
}

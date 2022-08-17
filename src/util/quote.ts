import {
  Client,
  Guild,
  Message,
  EmbedBuilder,
  TextBasedChannel,
  User,
  Channel,
  ChatInputCommandInteraction,
  ApplicationCommandOptionType,
} from 'discord.js'
import { SleetSlashCommand } from 'sleetcord'

/** Number of lines before quote content becomes cut */
const MAX_QUOTE_LINES = 10
/** Number of characters before replied message content becomes cut */
const MAX_REPLY_LENGTH = 100

export const quote = new SleetSlashCommand(
  {
    name: 'quote',
    description: 'Quotes a message',
    dm_permission: false,
    options: [
      {
        name: 'message_link',
        type: ApplicationCommandOptionType.String,
        description: 'A message link to the message to quote',
        required: true,
      },
    ],
  },
  {
    messageCreate: handleMessageCreate,
    run: runQuote,
  },
)

async function handleMessageCreate(message: Message) {
  if (message.author.bot || !('guild' in message)) {
    return
  }

  try {
    const embeds = await getQuoteFor(
      message.client,
      message.author,
      message.content,
    )

    message.reply({
      embeds,
      allowedMentions: { parse: [], repliedUser: false },
    })
  } catch {
    return
  }
}

async function runQuote(interaction: ChatInputCommandInteraction) {
  const messageLink = interaction.options.getString('message_link', true)

  try {
    const embeds = await getQuoteFor(
      interaction.client,
      interaction.user,
      messageLink,
    )
    interaction.reply({ embeds })
  } catch (e) {
    interaction.reply({
      ephemeral: true,
      content: e instanceof Error ? e.message : String(e),
    })
  }
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

async function getQuoteFor(
  client: Client,
  user: User,
  content: string,
): Promise<EmbedBuilder[]> {
  const matches = getMessageLinkIds(content)

  if (!matches) {
    throw new Error('Invalid message link')
  }

  const { guildId, channelId, messageId } = matches

  const guild = await tryFetchGuild(client, guildId)

  if (!guild) {
    throw new Error('Guild not found')
  }

  const channel = await tryFetchChannel(client, channelId)

  if (!channel) {
    throw new Error('Channel not found')
  }

  if (!channel.isTextBased()) {
    throw new Error('Channel is not a text channel')
  }

  const message = await tryFetchMessage(channel, messageId)

  if (!message) {
    throw new Error('Message not found')
  }

  if (!('guild' in message.channel)) {
    throw new Error('Message is not in a guild')
  }

  const embeds: EmbedBuilder[] = []

  const quoteContent = formatQuoteContent(message.content)

  const embed = new EmbedBuilder()
    .setAuthor({
      name: `${message.author.tag} - #${message.channel.name}`,
      iconURL: message.author.displayAvatarURL(),
      url: message.url,
    })
    .setDescription(quoteContent)
    .setTimestamp(message.createdTimestamp)
    .setFooter({
      text: `Quoted by ${user.tag}`,
    })

  embeds.push(embed)

  if (message.member) {
    embed.setColor(message.member.displayColor)
  }

  if (message.reference) {
    const reference = await message.fetchReference()
    const content = (reference.content || 'Click to see message')
      .split('\n')
      .join(' ')

    const shortContent =
      content.length > MAX_REPLY_LENGTH
        ? `${content.substring(0, MAX_REPLY_LENGTH)}...`
        : content

    embed.addFields([
      {
        name: `Reply to ${reference.author.tag}`,
        value: `[${shortContent}](${reference.url})`,
      },
    ])
  }

  const imgEmbed =
    message.attachments.find((e) => 'height' in e && 'width' in e) ||
    message.embeds.find((e) => e.image)

  if (imgEmbed && imgEmbed.url) {
    embed.setImage(imgEmbed.url)
  }

  if (message.embeds[0]) {
    const msgEmbed = EmbedBuilder.from(message.embeds[0])
    embeds.push(msgEmbed)
  }

  return embeds
}

function formatQuoteContent(content: string): string | null {
  if (content.trim() === '') return null

  const lines = content.split('\n')

  if (lines.length > MAX_QUOTE_LINES) {
    return `${lines.slice(0, MAX_QUOTE_LINES).join('\n')}...`
  } else {
    return lines.join('\n')
  }
}

async function tryFetchGuild(
  client: Client,
  guildId: string,
): Promise<Guild | null> {
  try {
    return await client.guilds.fetch(guildId)
  } catch {
    return null
  }
}

async function tryFetchChannel(
  client: Client,
  channelId: string,
): Promise<Channel | null> {
  try {
    return await client.channels.fetch(channelId)
  } catch {
    return null
  }
}

async function tryFetchMessage(
  channel: TextBasedChannel,
  messageId: string,
): Promise<Message | null> {
  try {
    return await channel.messages.fetch(messageId)
  } catch {
    return null
  }
}

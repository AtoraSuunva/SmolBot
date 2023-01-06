import { Message, EmbedBuilder, MessageType, hyperlink } from 'discord.js'

// TODO: "X followed <server #channel>" messages only have channel ID, not guild ID. how to link?
// TODO: Show attachments (as links? as just count?)

/** Number of lines before quote content becomes cut */
const MAX_QUOTE_LINES = 10
/** Number of characters before replied message content becomes cut */
const MAX_REPLY_LENGTH = 100

export async function quoteMessage(
  message: Message<true>,
): Promise<EmbedBuilder[]> {
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

  embeds.push(embed)

  if (message.member) {
    embed.setColor(message.member.displayColor)
  }

  // There's some interesting properties based on the message type
  // We can show better detail than just copy-pasting the message by actually parsing it
  // https://discord.com/developers/docs/resources/channel#message-object-message-types
  switch (message.type) {
    // Crosspost flag...
    case MessageType.ChannelPinnedMessage:
      await quoteChannelPinnedMessage(message, embed)
      break
    case MessageType.UserJoin:
      await quoteUserJoin(message, embed)
      break
    case MessageType.GuildBoost:
      await quoteGuildBoost(message, embed)
      break
    case MessageType.GuildBoostTier1:
      await quoteGuildBoostTier(message, embed, 1)
      break
    case MessageType.GuildBoostTier2:
      await quoteGuildBoostTier(message, embed, 2)
      break
    case MessageType.GuildBoostTier3:
      await quoteGuildBoostTier(message, embed, 3)
      break
    case MessageType.ChannelFollowAdd:
      await quoteChannelFollowAdd(message, embed)
      break
    case MessageType.GuildDiscoveryDisqualified:
      await quoteGuildDiscoveryDisqualified(message, embed)
      break
    case MessageType.GuildDiscoveryRequalified:
      await quoteGuildDiscoveryRequalified(message, embed)
      break
    case MessageType.GuildDiscoveryGracePeriodInitialWarning:
      await quoteGuildDiscoveryGracePeriodInitialWarning(message, embed)
      break
    case MessageType.GuildDiscoveryGracePeriodFinalWarning:
      await quoteGuildDiscoveryGracePeriodFinalWarning(message, embed)
      break
    case MessageType.Reply:
      await quoteReply(message, embed)
      break
    case MessageType.ThreadCreated:
    case MessageType.ThreadStarterMessage:
      await quoteThreadCreateMessage(message, embed)
      break
    case MessageType.AutoModerationAction:
      await quoteAutoModerationAction(message, embed)
      break
  }

  const imgEmbed =
    message.attachments.find((e) => 'height' in e && 'width' in e) ||
    message.embeds.find((e) => e.image)

  if (imgEmbed && imgEmbed.url) {
    embed.setImage(imgEmbed.url)
  }

  const attachmentCount =
    message.attachments.size - (imgEmbed && imgEmbed.url ? 1 : 0)

  if (attachmentCount > 0) {
    embed.setDescription(
      embed.data.description + ` **+ ${attachmentCount} attachment(s)**`,
    )
  }

  if (message.embeds[0]) {
    const msgEmbed = EmbedBuilder.from(message.embeds[0])
    embeds.push(msgEmbed)
  }

  return embeds
}

async function quoteChannelPinnedMessage(
  message: Message,
  embed: EmbedBuilder,
) {
  let messageLink = 'a message'

  if (message.reference) {
    const { guildId, channelId, messageId } = message.reference
    messageLink = hyperlink(
      'a message',
      `https://discordapp.com/channels/${guildId}/${channelId}/${messageId}`,
    )
  }

  embed.setDescription(
    `${message.author} pinned ${messageLink} to this channel.`,
  )
}

async function quoteUserJoin(message: Message, embed: EmbedBuilder) {
  embed.setDescription(`${message.author} has joined the server.`)
}

async function quoteGuildBoost(message: Message, embed: EmbedBuilder) {
  embed.setDescription(`${message.author} just boosted the server!`)
}

async function quoteGuildBoostTier(
  message: Message,
  embed: EmbedBuilder,
  tier: number,
) {
  embed.setDescription(
    `${message.author} just boosted the server! ${message.guild?.name} has achieved **tier ${tier}**!`,
  )
}

async function quoteChannelFollowAdd(message: Message, embed: EmbedBuilder) {
  let followLink = message.content

  if (message.reference) {
    const { guildId, channelId } = message.reference
    followLink = hyperlink(
      message.content,
      `https://discordapp.com/channels/${guildId}/${channelId}`,
    )
  }

  embed.setDescription(
    `${message.author} has added ${followLink} to this channel.`,
  )
}

async function quoteGuildDiscoveryDisqualified(
  _message: Message,
  embed: EmbedBuilder,
) {
  embed.setDescription(
    'This server has been removed from Server Discovery because it no longer passes all the requirements. Check Server Settings on desktop for more details.',
  )
}

async function quoteGuildDiscoveryRequalified(
  _message: Message,
  embed: EmbedBuilder,
) {
  embed.setDescription(
    'This server is eligible for Server Discovery again and has been automatically relisted!',
  )
}

async function quoteGuildDiscoveryGracePeriodInitialWarning(
  _message: Message,
  embed: EmbedBuilder,
) {
  embed.setDescription(
    'This server has failed Discovery activity requirements for 1 week. If this server fails for 4 weeks in a row, it will be automatically removed from Discovery.',
  )
}

async function quoteGuildDiscoveryGracePeriodFinalWarning(
  _message: Message,
  embed: EmbedBuilder,
) {
  embed.setDescription(
    'This server has failed Discovery activity requirements for 3 weeks in a row. If this server fails for 1 more week, it will be removed from Discovery.',
  )
}

async function quoteReply(message: Message, embed: EmbedBuilder) {
  if (!message.reference) {
    embed.addFields([
      {
        name: 'Reply to',
        value: 'Original message was deleted.',
      },
    ])
    return
  }

  let reference: Message

  try {
    reference = await message.fetchReference()
  } catch (e) {
    embed.addFields([
      {
        name: 'Reply to',
        value: 'Message could not be loaded.',
      },
    ])
    return
  }

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

async function quoteThreadCreateMessage(message: Message, embed: EmbedBuilder) {
  let threadLink = message.content

  if (message.reference) {
    const { guildId, channelId } = message.reference
    threadLink = hyperlink(
      threadLink,
      `https://discordapp.com/channels/${guildId}/${channelId}`,
    )
  }

  embed.setDescription(`${message.author} started a thread: ${threadLink}`)
}

async function quoteAutoModerationAction(
  message: Message,
  embed: EmbedBuilder,
) {
  embed.setDescription(
    `${message.author} triggered AutoMod. Details follow below:`,
  )
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

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
      quoteChannelPinnedMessage(message, embed)
      break
    case MessageType.UserJoin:
      quoteUserJoin(message, embed)
      break
    case MessageType.GuildBoost:
      quoteGuildBoost(message, embed)
      break
    case MessageType.GuildBoostTier1:
      quoteGuildBoostTier(message, embed, 1)
      break
    case MessageType.GuildBoostTier2:
      quoteGuildBoostTier(message, embed, 2)
      break
    case MessageType.GuildBoostTier3:
      quoteGuildBoostTier(message, embed, 3)
      break
    case MessageType.ChannelFollowAdd:
      quoteChannelFollowAdd(message, embed)
      break
    case MessageType.GuildDiscoveryDisqualified:
      quoteGuildDiscoveryDisqualified(message, embed)
      break
    case MessageType.GuildDiscoveryRequalified:
      quoteGuildDiscoveryRequalified(message, embed)
      break
    case MessageType.GuildDiscoveryGracePeriodInitialWarning:
      quoteGuildDiscoveryGracePeriodInitialWarning(message, embed)
      break
    case MessageType.GuildDiscoveryGracePeriodFinalWarning:
      quoteGuildDiscoveryGracePeriodFinalWarning(message, embed)
      break
    case MessageType.Reply:
      await quoteReply(message, embed)
      break
    case MessageType.ThreadCreated:
    case MessageType.ThreadStarterMessage:
      quoteThreadCreateMessage(message, embed)
      break
    case MessageType.AutoModerationAction:
      quoteAutoModerationAction(message, embed)
      break
  }

  const imgEmbed =
    message.attachments.find((e) => 'height' in e && 'width' in e) ??
    message.embeds.find((e) => e.image)

  if (imgEmbed?.url) {
    embed.setImage(imgEmbed.url)
  }

  const attachmentCount = message.attachments.size - (imgEmbed?.url ? 1 : 0)

  if (attachmentCount > 0) {
    embed.setDescription(
      `${embed.data.description ?? ''} **+ ${attachmentCount} attachment(s)**`,
    )
  }

  if (message.embeds[0]) {
    const msgEmbed = EmbedBuilder.from(message.embeds[0])
    embeds.push(msgEmbed)
  }

  return embeds
}

type PathPart<T extends string | undefined> = T extends string ? `/${T}` : ''
function optionalPathPart<T extends string | undefined>(
  pathPart: T,
): PathPart<T> {
  return (typeof pathPart === 'string' ? `/${pathPart}` : '') as PathPart<T>
}

function quoteChannelPinnedMessage(message: Message, embed: EmbedBuilder) {
  let messageLink = 'a message'

  if (message.reference) {
    const { guildId, channelId, messageId } = message.reference
    messageLink = hyperlink(
      'a message',
      `https://discordapp.com/channels${optionalPathPart(
        guildId,
      )}/${channelId}${optionalPathPart(messageId)}`,
    )
  }

  embed.setDescription(
    `${message.author} pinned ${messageLink} to this channel.`,
  )
}

function quoteUserJoin(message: Message, embed: EmbedBuilder) {
  embed.setDescription(`${message.author} has joined the server.`)
}

function quoteGuildBoost(message: Message, embed: EmbedBuilder) {
  embed.setDescription(`${message.author} just boosted the server!`)
}

function quoteGuildBoostTier(
  message: Message,
  embed: EmbedBuilder,
  tier: number,
) {
  embed.setDescription(
    `${message.author} just boosted the server! ${
      message.guild?.name ?? '<Unknown Server>'
    } has achieved **tier ${tier}**!`,
  )
}

function quoteChannelFollowAdd(message: Message, embed: EmbedBuilder) {
  let followLink = message.content

  if (message.reference) {
    const { guildId, channelId } = message.reference
    followLink = hyperlink(
      message.content,
      `https://discordapp.com/channels${optionalPathPart(
        guildId,
      )}/${channelId}`,
    )
  }

  embed.setDescription(
    `${message.author} has added ${followLink} to this channel.`,
  )
}

function quoteGuildDiscoveryDisqualified(
  _message: Message,
  embed: EmbedBuilder,
) {
  embed.setDescription(
    'This server has been removed from Server Discovery because it no longer passes all the requirements. Check Server Settings on desktop for more details.',
  )
}

function quoteGuildDiscoveryRequalified(
  _message: Message,
  embed: EmbedBuilder,
) {
  embed.setDescription(
    'This server is eligible for Server Discovery again and has been automatically relisted!',
  )
}

function quoteGuildDiscoveryGracePeriodInitialWarning(
  _message: Message,
  embed: EmbedBuilder,
) {
  embed.setDescription(
    'This server has failed Discovery activity requirements for 1 week. If this server fails for 4 weeks in a row, it will be automatically removed from Discovery.',
  )
}

function quoteGuildDiscoveryGracePeriodFinalWarning(
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

function quoteThreadCreateMessage(message: Message, embed: EmbedBuilder) {
  let threadLink = message.content

  if (message.reference) {
    const { guildId, channelId } = message.reference
    threadLink = hyperlink(
      threadLink,
      `https://discordapp.com/channels${optionalPathPart(
        guildId,
      )}/${channelId}`,
    )
  }

  embed.setDescription(`${message.author} started a thread: ${threadLink}`)
}

function quoteAutoModerationAction(message: Message, embed: EmbedBuilder) {
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

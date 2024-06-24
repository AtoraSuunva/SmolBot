import {
  Attachment,
  EmbedBuilder,
  InteractionType,
  Message,
  MessageType,
  hyperlink,
} from 'discord.js'
import { formatUser } from 'sleetcord'
import { plural } from './format.js'

/** Number of lines before quote content becomes cut */
const MAX_QUOTE_LINES = 10
/** Number of characters before replied message content becomes cut */
const MAX_REPLY_LENGTH = 100

interface QuoteOptions {
  includeChannel?: boolean
  includeTimestamp?: boolean
}

export async function quoteMessage(
  message: Message<true>,
  { includeChannel = true, includeTimestamp = true }: QuoteOptions = {},
): Promise<EmbedBuilder[]> {
  const embeds: EmbedBuilder[] = []

  const quoteContent = formatQuoteContent(message.content)

  const channelLine = includeChannel ? ` - #${message.channel.name}` : ''

  const embed = new EmbedBuilder()
    .setURL(message.url)
    .setAuthor({
      name: `${formatUser(message.author, {
        markdown: false,
        id: false,
        escape: false,
      })}${channelLine}`,
      iconURL: message.author.displayAvatarURL(),
      url: message.url,
    })
    .setDescription(quoteContent)

  if (includeTimestamp) {
    embed.setTimestamp(message.createdTimestamp)
  }

  if (message.interaction) {
    const { interaction } = message

    const commandName =
      (interaction.type === InteractionType.ApplicationCommand ? '/' : '') +
      interaction.commandName

    embed.setTitle(
      `${formatUser(interaction.user, {
        markdown: false,
        id: false,
        escape: false,
      })} used ${commandName}`,
    )
  }

  embeds.push(embed)

  if (message.member) {
    embed.setColor(message.member.displayColor)
  }

  // There's some interesting properties based on the message type
  // We can show better detail than just copy-pasting the message by actually parsing it
  // https://discord.com/developers/docs/resources/channel#message-object-message-types
  await addToEmbed(message, embed)

  const listedAttachments: Attachment[] = []
  // Can't have more than 4 images tiled together in a single embed, so any more than that we just add into a field
  let attachedImagesCount = 0

  for (const [, attachment] of message.attachments) {
    if (attachedImagesCount < 4 && isImageAttachment(attachment)) {
      attachedImagesCount++
      // You can embed multiple (up to 4) images in a single embed by sending multiple embeds with the same URL
      if (!embed.data.image) {
        embed.setImage(attachment.url)
      } else {
        embeds.push(
          new EmbedBuilder().setURL(message.url).setImage(attachment.url),
        )
      }
    } else {
      // For non-image attachments (or additional images after 4), we can just add them as fields
      listedAttachments.push(attachment)
    }
  }

  if (listedAttachments.length > 0) {
    embed.addFields([
      {
        name: `+${plural('Attachment', listedAttachments.length)}`,
        value: listedAttachments
          .map((a) => `[${a.name}](<${a.proxyURL}>)`)
          .join(', '),
      },
    ])
  }

  if (message.embeds[0]) {
    // Some embeds (like twitter embeds) use multiple embeds to have multiple images in 1 embed
    // You can tell by if they share the same Url, so just check that to get them all
    const embedUrl = message.embeds[0].url

    if (embedUrl) {
      embeds.push(
        ...message.embeds
          .filter((e) => e.image && e.url === embedUrl)
          .map((e) => EmbedBuilder.from(e)),
      )
    } else {
      embeds.push(EmbedBuilder.from(message.embeds[0]))
    }
  }

  return embeds
}

export async function addToEmbed(message: Message, embed: EmbedBuilder) {
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
}

function isImageAttachment(attachment: Attachment): boolean {
  return attachment.contentType?.startsWith('image/') ?? false
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
    `${message.author} has added ${followLink} to this channel. Its most important updates will show up here.`,
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
      name: `Reply to ${formatUser(reference.author, {
        markdown: false,
        id: false,
        escape: false,
      })}`,
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

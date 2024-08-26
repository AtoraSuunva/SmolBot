import type { Prisma } from '@prisma/client'
import {
  type ForumChannel,
  LimitedCollection,
  type MediaChannel,
  type Message,
  type NewsChannel,
  type TextChannel,
  type User,
  type Webhook,
  type WebhookMessageCreateOptions,
  type WebhookType,
} from 'discord.js'
import { SleetModule, formatUser } from 'sleetcord'
import { prisma } from '../../util/db.js'

export const handle_ticket_message = new SleetModule(
  {
    name: 'handle_ticket_message',
  },
  {
    messageCreate: handleMessageCreate,
  },
)

async function handleMessageCreate(message: Message) {
  if (
    !message.inGuild() ||
    (message.webhookId !== null && message.interaction === null) ||
    !message.channel.isThread()
  ) {
    // It's a webhook (probably us forwarding) or can't possibly be a modmail ticket, so just skip
    return
  }

  const ticket = await prisma.modMailTicket.findFirst({
    where: {
      OR: [
        {
          userThreadID: message.channel.id,
        },
        {
          modThreadID: message.channel.id,
        },
      ],
    },
  })

  if (!ticket || ticket.linkDeleted) {
    // Not a modmail ticket or a channel/thread was deleted
    return
  }

  const config = await prisma.modMailConfig.upsert({
    where: {
      guildID: message.guildId,
    },
    create: {
      guildID: message.guildId,
    },
    update: {},
  })

  const { client } = message
  const isUserMessage = ticket.userThreadID === message.channel.id
  const forwardChannelID = isUserMessage
    ? ticket.modChannelID
    : ticket.userChannelID

  const replyType = isUserMessage
    ? ReplyType.User
    : getReplyType(message, config)

  if (replyType === ReplyType.None) {
    return
  }

  const forwardChannel = await client.channels
    .fetch(forwardChannelID)
    .catch(() => null)

  if (!forwardChannel || !('threads' in forwardChannel)) {
    // Channel was deleted, so we can't forward the message
    await message.channel
      .send(
        `The ${isUserMessage ? 'mod' : 'user'} channel was deleted, so I can't forward this message.`,
      )
      .catch(() => {
        /* ignore */
      })

    await prisma.modMailTicket.update({
      where: {
        ticketID: ticket.ticketID,
      },
      data: {
        linkDeleted: true,
      },
    })

    return
  }

  const forwardThreadID = isUserMessage
    ? ticket.modThreadID
    : ticket.userThreadID
  const forwardThread = await forwardChannel.threads
    .fetch(forwardThreadID)
    .catch(() => null)

  if (!forwardThread) {
    // Thread was deleted, so we can't forward the message

    if (message.author.id !== client.user.id) {
      await message.channel
        .send(
          `The ${isUserMessage ? 'mod' : 'user'} thread was deleted, so I can't forward this message.`,
        )
        .catch(() => {
          /* ignore */
        })
    }

    await prisma.modMailTicket.update({
      where: {
        ticketID: ticket.ticketID,
      },
      data: {
        linkDeleted: true,
      },
    })

    return
  }

  let webhook: Webhook<WebhookType.Incoming>

  try {
    webhook = await getWebhookFor(forwardChannel)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)

    await message.channel
      .send(
        `Failed to get webhook for the ${
          isUserMessage ? 'mod' : 'user'
        } thread.\nError: ${msg}`,
      )
      .catch(() => {
        /* ignore */
      })
    return
  }

  try {
    const options: WebhookMessageCreateOptions = {
      threadId: forwardThread.id,
      allowedMentions: { parse: isUserMessage ? [] : ['users'] },
      content: getMessageContent(message, config, replyType),
      files: message.attachments.map((attachment) => attachment.url),
      embeds: message.embeds,
    }

    if (replyType === ReplyType.User) {
      options.username = formatWebhookUser(message.author)
      options.avatarURL = message.author.displayAvatarURL()
    } else {
      options.username = 'Mod Team'

      if (message.guild.icon) {
        // biome-ignore lint/style/noNonNullAssertion: we just tested for an icon url
        options.avatarURL = message.guild.iconURL()!
      }
    }

    await webhook.send(options)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)

    await message.channel
      .send(
        `I couldn't forward the message to the ${
          isUserMessage ? 'mod' : 'user'
        } thread.\nError: ${msg}`,
      )
      .catch(() => {
        /* ignore */
      })
    return
  }

  await message.react('📨').catch(() => {
    /* ignore */
  })
}

const formatWebhookUser = (user: User): string =>
  formatUser(user, {
    escapeMarkdown: false,
    markdown: false,
    id: false,
  })

const webhookCache = new LimitedCollection<
  string,
  Webhook<WebhookType.Incoming>
>({
  maxSize: 50,
})

export async function getWebhookFor(
  channel: NewsChannel | TextChannel | ForumChannel | MediaChannel,
): Promise<Webhook<WebhookType.Incoming>> {
  const cached = webhookCache.get(channel.id)
  if (cached) {
    return cached
  }

  const webhooks = await channel.fetchWebhooks()
  const webhook = webhooks.find<Webhook<WebhookType.Incoming>>(
    (wh): wh is Webhook<WebhookType.Incoming> =>
      wh.isUserCreated() && wh.owner.id === channel.client.user.id,
  )

  if (webhook) {
    webhookCache.set(channel.id, webhook)
    return webhook
  }

  // Need to create a new webhook
  const newWebhook = await channel.createWebhook({
    name: 'ModMail',
    reason: 'Needed to forward messages',
  })

  webhookCache.set(channel.id, newWebhook)
  return newWebhook
}

enum ReplyType {
  /** Don't forward the message */
  None = 0,
  /** Forward the message and include the user */
  User = 1,
  /** Forward the message anonymously */
  Anonymous = 2,
}

function getReplyType(
  message: Message,
  config: Prisma.ModMailConfigGetPayload<true>,
): ReplyType {
  const { modReplyPrefix, modAnonReplyPrefix } = config

  let replyType = ReplyType.None

  if (message.content.startsWith(modReplyPrefix)) {
    replyType = ReplyType.User
  }

  if (message.content.startsWith(modAnonReplyPrefix)) {
    // Longer prefix wins
    if (
      replyType === ReplyType.None ||
      modAnonReplyPrefix.length > modReplyPrefix.length
    ) {
      replyType = ReplyType.Anonymous
    }
  }

  return replyType
}

function getMessageContent(
  message: Message,
  config: Prisma.ModMailConfigGetPayload<true>,
  replyType: ReplyType,
): string {
  const { modReplyPrefix, modAnonReplyPrefix } = config

  switch (replyType) {
    case ReplyType.User:
      return message.content.slice(modReplyPrefix.length).trim()
    case ReplyType.Anonymous:
      return message.content.slice(modAnonReplyPrefix.length).trim()
    case ReplyType.None:
      return message.content
  }
}

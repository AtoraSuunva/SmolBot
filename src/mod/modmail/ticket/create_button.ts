import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  type AttachmentPayload,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  ChannelType,
  type ChatInputCommandInteraction,
  ContainerBuilder,
  escapeInlineCode,
  type Interaction,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThreadAutoArchiveDuration,
  type ThreadChannel,
  ThumbnailBuilder,
  time,
} from 'discord.js'
import {
  type AutocompleteHandler,
  formatUser,
  getGuild,
  inGuildGuard,
  SleetSlashSubcommand,
} from 'sleetcord'
import { MINUTE, SECOND } from 'sleetcord-common'

import type { Prisma } from '../../../generated/prisma/client.js'
import { prisma } from '../../../helpers/db.js'
import { modmailLogger } from '../utils.js'
import { modmailIdAutocomplete } from './../fields/utils.js'

type AutocompleteCreator = (channelOption: string) => AutocompleteHandler<string>

/**
 * Creates an autocomplete handler that returns a list of suggested tags using another option as the forum channel.
 * @param channelOption The name of the option that contains the forum channel. Will be used to fetch the forum channel and its tags
 * @returns An autocomplete handler for a forum tag.
 */
export const createTagAutocomplete: AutocompleteCreator =
  (channelOption: string) =>
  async ({ interaction, value }) => {
    if (!interaction.inGuild()) {
      return []
    }

    const forumChannel = interaction.options.get(channelOption)

    if (!forumChannel || !(typeof forumChannel.value === 'string')) {
      return [
        {
          name: 'No forum channel selected, unable to suggest tags',
          value: '',
        },
      ]
    }

    const guild = await getGuild(interaction, true)
    const channel = await guild.channels.fetch(forumChannel.value)

    if (!channel?.isThreadOnly()) {
      return [
        {
          name: 'Invalid forum channel selected, unable to suggest tags',
          value: '',
        },
      ]
    }

    if (channel.availableTags.length === 0) {
      return [
        {
          name: 'No tags available in the forum channel',
          value: '',
        },
      ]
    }

    const lowerValue = value.toLowerCase()

    return channel.availableTags
      .filter((tag) => tag.name.toLowerCase().includes(lowerValue))
      .map((tag) => ({
        name: `${tag.emoji?.name ? `${tag.emoji.name} ` : ''}${tag.name}`,
        value: tag.id,
      }))
  }

export const modmail_ticket_create_button = new SleetSlashSubcommand(
  {
    name: 'create_button',
    description: 'Create a button users can use to open a modmail ticket',
    options: [
      {
        name: 'modmail_id',
        description: 'Id used to identify this button for configuration (ex: "appeal")',
        type: ApplicationCommandOptionType.String,
        autocomplete: modmailIdAutocomplete,
        required: true,
        max_length: 25,
      },
      {
        name: 'message',
        description: 'The message to send with the button',
        type: ApplicationCommandOptionType.String,
        required: true,
        max_length: 2000,
      },
      {
        name: 'button_label',
        description: 'The label for the button',
        type: ApplicationCommandOptionType.String,
        required: true,
        max_length: 80,
      },
      {
        name: 'modmail_forum',
        description: 'The forum channel to send new modmail tickets to',
        type: ApplicationCommandOptionType.Channel,
        channel_types: [ChannelType.GuildForum],
        required: true,
      },
      {
        name: 'button_emoji',
        description: 'The emoji for the button (default: no emoji)',
        type: ApplicationCommandOptionType.String,
      },
      {
        name: 'button_style',
        description: 'The style for the button (default: Primary/Blurple)',
        type: ApplicationCommandOptionType.Integer,
        choices: [
          { name: 'Primary (Blurple)', value: ButtonStyle.Primary },
          { name: 'Secondary (Grey)', value: ButtonStyle.Secondary },
          { name: 'Success (Green)', value: ButtonStyle.Success },
          { name: 'Danger (Red)', value: ButtonStyle.Danger },
        ],
      },
      {
        name: 'forum_tag',
        description: 'The tag to apply to the forum post on creation (default: none)',
        type: ApplicationCommandOptionType.String,
        autocomplete: createTagAutocomplete('modmail_forum'),
        max_length: 20,
      },
    ],
  },
  {
    run: runCreateModMailButton,
    interactionCreate: handleModMailButtonInteraction,
  },
)

const THREADABLE_CHANNEL_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildMedia,
])
const MODMAIL = 'modmail'
const CREATE_TICKET = 'create_ticket'
const TICKET_MODAL = 'ticket_modal'

async function runCreateModMailButton(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)
  inGuildGuard(interaction)

  const channel = await guild.channels.fetch(interaction.channelId).catch(() => null)

  if (!channel || !THREADABLE_CHANNEL_TYPES.has(channel.type)) {
    await interaction.reply({
      content:
        'You cannot create threads in this channel type. Try a text channel, announcement channel, or forum channel.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const message = interaction.options.getString('message', true)

  const buttonLabel = interaction.options.getString('button_label', true)
  const buttonEmoji = interaction.options.getString('button_emoji')
  const buttonStyle = interaction.options.getInteger('button_style') ?? ButtonStyle.Primary

  const modmailForum = interaction.options.getChannel('modmail_forum', true)
  const modmailId = interaction.options.getString('modmail_id', true)

  const forumTag = interaction.options.getString('forum_tag') ?? ''

  await interaction.deferReply({ flags: MessageFlags.Ephemeral })

  // Create the button
  const button = new ButtonBuilder()
    .setLabel(buttonLabel)
    .setStyle(buttonStyle)
    .setCustomId(`${MODMAIL}:${CREATE_TICKET}:${modmailId}:${modmailForum.id}:${forumTag}`)

  if (buttonEmoji) {
    button.setEmoji(buttonEmoji)
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button)

  // Send the message with the button
  try {
    const channel = interaction.channel ?? (await guild.channels.fetch(interaction.channelId))

    if (!channel) {
      throw new Error('Failed to find channel to send button to')
    }

    if (!channel.isTextBased()) {
      throw new Error('Cannot send buttons to non-text channels')
    }

    await channel.send({
      content: message,
      components: [row],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await interaction.editReply({
      content: `Failed to create the button:\nError: \`${escapeInlineCode(message)}\``,
      allowedMentions: { parse: [] },
    })
    return
  }

  await interaction.editReply({
    content: 'Button created successfully!',
  })
}

async function handleModMailButtonInteraction(interaction: Interaction) {
  if (!interaction.isButton()) return

  // `${MODMAIL}:${CREATE_TICKET}:${modmailId}:${modmailForum.id}:${forumTag}`
  const [id, action, modmailId, forumId, forumTag] = interaction.customId.split(':')

  if (id !== MODMAIL) return

  switch (action) {
    case CREATE_TICKET:
      await handleCreateTicketButton(interaction, {
        modmailId,
        forumId,
        forumTag,
      })
      break
    default:
      await interaction.reply({
        content: 'Unknown action',
        flags: MessageFlags.Ephemeral,
      })
  }
}

type TicketField = Prisma.ModMailTicketModalFieldGetPayload<true>

const DEFAULT_FIELDS: TicketField[] = [
  {
    modmailID: '0',
    guildID: '0',
    customID: 'ticket_body',
    order: 0,
    label: 'Message to send to the mods',
    style: TextInputStyle.Paragraph,
    placeholder: 'Type out your message here...',
    required: true,
    minLength: 1,
    maxLength: 2000,
    useAsTitle: false,
  },
]

interface CreateTicketData {
  modmailId: string
  forumId: string
  forumTag: string
}

const MAX_EMBED_LENGTH = 6000 - 65 // headroom for the "Ticket Truncated" field

async function handleCreateTicketButton(
  interaction: ButtonInteraction,
  { modmailId, forumId, forumTag }: CreateTicketData,
) {
  const guild = await getGuild(interaction, true)

  const config = await prisma.modMailTicketConfig.findFirst({
    where: { modmailID: modmailId, guildID: guild.id },
  })

  if (config) {
    if (config.maxOpenTickets) {
      const tickets = await prisma.modMailTicket.count({
        where: {
          modmailID: modmailId,
          guildID: guild.id,
          userID: interaction.user.id,
          open: true,
          linkDeleted: false,
        },
      })

      if (tickets >= config.maxOpenTickets) {
        await interaction.reply({
          content: `You have reached the maximum number of open tickets (${tickets}/${config.maxOpenTickets}).\nYou can create more tickets once a moderator closes some of your existing tickets.`,
          flags: MessageFlags.Ephemeral,
        })
        return
      }
    }

    if (config.ratelimit) {
      const delay = config.ratelimit * SECOND

      const lastTicket = await prisma.modMailTicket.findFirst({
        where: {
          modmailID: modmailId,
          guildID: guild.id,
          AND: [
            {
              createdAt: {
                gte: new Date(Date.now() - delay),
              },
            },
            { userID: interaction.user.id },
          ],
        },
        orderBy: {
          createdAt: 'desc',
        },
      })

      if (lastTicket) {
        const nextTime = new Date(lastTicket.createdAt.getTime() + delay)

        await interaction.reply({
          content: `You are creating tickets too quickly, try again ${time(nextTime, 'R')}.`,
          flags: MessageFlags.Ephemeral,
        })
        return
      }
    }
  }

  const dbFields = await prisma.modMailTicketModalField.findMany({
    where: { modmailID: modmailId, guildID: guild.id },
    orderBy: { order: 'asc' },
  })

  const fields = dbFields.length > 0 ? dbFields : DEFAULT_FIELDS

  const modal = new ModalBuilder()
    .setCustomId(`${MODMAIL}:${TICKET_MODAL}:${interaction.id}`)
    .setTitle('Create a Modmail Ticket')

  modal.addLabelComponents(
    fields.map((field) =>
      new LabelBuilder({
        label: field.label,
      }).setTextInputComponent(
        new TextInputBuilder()
          .setCustomId(field.customID)
          .setStyle(field.style)
          .setRequired(field.required ?? false)
          .setPlaceholder(field.placeholder ?? '')
          .setMinLength(field.minLength ?? 0)
          .setMaxLength(field.maxLength ?? 4000),
      ),
    ),
  )

  await interaction.showModal(modal)

  const filter = (i: Interaction) => i.isModalSubmit() && i.customId === modal.data.custom_id

  const int = await interaction.awaitModalSubmit({ time: 10 * MINUTE, filter }).catch(() => {
    /* ignore */
  })

  if (!int) return

  await int.deferReply({ flags: MessageFlags.Ephemeral })

  // Create the modmail ticket
  const modChannel = await guild.channels.fetch(forumId).catch(() => null)

  if (!modChannel) {
    await int.editReply({
      content: 'Could not find the modmail channel, contact the mod team to fix this.',
      components: [],
    })
    return
  }

  if (!modChannel.isThreadOnly()) {
    await int.editReply({
      content: 'The modmail channel must be a forum channel, contact the mod team to fix this.',
      components: [],
    })
    return
  }

  const formattedUser = formatUser(interaction.user, { mention: true })
  const formattedUserNoMarkdown = formatUser(interaction.user, {
    escapeMarkdown: false,
    markdown: false,
  })

  let totalCharacters = 0
  let title = ''
  const fieldIDMap = new Map<string, (typeof fields)[number]>(fields.map((f) => [f.customID, f]))

  const fieldsTextDisplay: TextDisplayBuilder[] = []

  for (const [, field] of int.fields.fields) {
    let formatted = ''

    if ('value' in field) {
      formatted = String(field.value)
    } else if ('values' in field) {
      formatted = field.values.join(', ')
    }

    if (fieldIDMap.get(field.customId)?.useAsTitle) {
      title = formatted
    }

    const content = `### **${fieldIDMap.get(field.customId)?.label ?? field.customId}**\n${formatted}`
    totalCharacters += content.length

    if (totalCharacters > MAX_EMBED_LENGTH) {
      fieldsTextDisplay.push(
        new TextDisplayBuilder({
          content: '### **Ticket is too long to display, see the attachment.**',
        }),
      )
      break
    }

    fieldsTextDisplay.push(
      new TextDisplayBuilder({
        content,
      }),
    )
  }

  const ticketThumbnail = new ThumbnailBuilder({
    media: {
      url: interaction.user.displayAvatarURL(),
    },
  })

  // TODO: maybe discord will preview components v2 in forums someday (:
  // const ticketPreview = new TextDisplayBuilder({
  //   content: fieldsTextDisplay[0]?.data.content?.slice(0, 256) ?? 'No Preview',
  // })

  const ticketSection = new SectionBuilder()
    .setThumbnailAccessory(ticketThumbnail)
    .addTextDisplayComponents(
      new TextDisplayBuilder({
        content: `**User:** ${formattedUser}\n**Modmail ID:** ${modmailId}`,
      }),
    )

  const ticketContainer = new ContainerBuilder()
    .addSectionComponents(ticketSection)
    .addSeparatorComponents()
    .addTextDisplayComponents(...fieldsTextDisplay)

  const files: AttachmentPayload[] = []

  if (totalCharacters > MAX_EMBED_LENGTH) {
    const fields = int.fields.fields
      .map(
        (v, k) =>
          `## ${fieldIDMap.get(k)?.label ?? k}\n\n${'value' in v ? v.value : v.values.join(', ')}`,
      )
      .join('\n\n')

    const string = `- Modmail ID: ${modmailId}\n- User: ${formattedUser}\n\n${fields}`

    files.push({
      name: 'ticket.md',
      attachment: Buffer.from(string, 'utf-8'),
    })
  }

  const forumConfig = await prisma.modMailForumConfig.findFirst({
    select: {
      openTag: true,
    },
    where: {
      guildID: guild.id,
      channelID: modChannel.id,
    },
  })

  let modThread: ThreadChannel | undefined
  const appliedTags = [forumTag, forumConfig?.openTag].filter((t): t is string => !!t)

  // Max name length is 100
  const threadName = expandTo`${100}${modmailId} - ${formattedUserNoMarkdown}${title ? `: ${title}` : ''}`

  try {
    modThread = await modChannel.threads.create({
      name: threadName,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      appliedTags,
      reason: `Ticket created by ${interaction.user.tag}`,
      message: {
        components: [ticketContainer],
        files,
        allowedMentions: { parse: [] },
        flags: MessageFlags.IsComponentsV2,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await int.editReply({
      content: `Failed to create user ticket, please try again later.\nError: \`${escapeInlineCode(msg)}\``,
    })

    modmailLogger.error({
      message: 'Failed to create modmail thread',
      modChannel: modChannel.id,
      guild: guild.id,
      error: e,
    })

    return
  }

  const userChannel = interaction.channel ?? (await guild.channels.fetch(interaction.channelId))

  if (!userChannel) {
    throw new Error('Failed to find user channel for ticket threads')
  }

  if (
    !('threads' in userChannel) ||
    userChannel.isThreadOnly() ||
    userChannel.type === ChannelType.GuildAnnouncement
  ) {
    throw new Error('Cannot create threads in user channel type')
  }

  let userThread: ThreadChannel | undefined

  try {
    userThread = await userChannel.threads.create({
      name: threadName,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      invitable: config?.invitable ?? false,
      type: ChannelType.PrivateThread,
      reason: `Ticket created by ${formattedUser}`,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await int.editReply({
      content: `Failed to create mod ticket, please try again later.\nError: \`${escapeInlineCode(msg)}\``,
    })

    modmailLogger.error({
      message: 'Failed to create user modmail thread',
      userChannel: userChannel.id,
      guild: guild.id,
      error: e,
    })

    return
  }

  const userThreadNote = new TextDisplayBuilder({
    content:
      'This is your thread to see replies from and reply to moderators for this ticket. Any message you send here will be forwarded to the moderators. A copy of your ticket is below:',
  })

  await userThread.members.add(interaction.user.id)
  await userThread.send({
    components: [userThreadNote, ticketContainer],
    files,
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  })

  const member = await guild.members.fetch(interaction.user.id)

  const infoMessage = [
    'User Info:',
    `- ${formatUser(member, { mention: true })}`,
    `- Created: ${time(member.user.createdAt, 'F')} (${time(member.user.createdAt, 'R')})`,
    `- Joined: ${time(member.joinedAt ?? new Date(), 'F')} (${time(
      member.joinedAt ?? new Date(),
      'R',
    )})`,
    `- Roles: ${
      member.roles.cache
        .filter((r) => r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map((r) => `<@&${r.id}>`)
        .join(', ') ?? 'None'
    }`,
    '',
    `User thread created: ${userThread}`,
  ].join('\n')

  await modThread.send({
    content: infoMessage,
    allowedMentions: { parse: [] },
  })

  await prisma.modMailTicket.create({
    data: {
      modmailID: modmailId,
      guildID: guild.id,
      // User
      userID: interaction.user.id,
      userChannelID: userChannel.id,
      userThreadID: userThread.id,
      // Mod
      modChannelID: modChannel.id,
      modThreadID: modThread.id,
    },
  })

  await int.editReply({
    content: 'Ticket created successfully!',
  })
}

/**
 * "Expand" expressions within a template string up until a character limit.
 * The first expression must be a number to set the limit (and will be ignored in the output).
 * The expression that reaches the limit will be truncated and terminated with "…", and any further expressions will be omitted.
 *
 * If the strings themselves reach the limit, then no expressions will be output.
 *
 * @example
 * expandTo`${10}Hello ${'World'}!` // 'Hello wo…!'
 *
 * @param strings - A template string array containing the static parts of the string.
 * @param limit - The maximum length allowed for the resulting string.
 * @param expressions - Additional expressions to be included in the resulting string.
 * @returns A string that is the result of expanding the template string with the provided expressions, ensuring the total length does not exceed the given limit.
 */
function expandTo(strings: TemplateStringsArray, limit: number, ...expressions: unknown[]): string {
  // Calculate the length of the provided strings first
  const stringsLength = strings.reduce((acc, s) => acc + s.length, 0)

  if (stringsLength >= limit) {
    return strings.join('')
  }

  // Add a "dummy" expression to the start since the limit "eats" one up
  expressions.unshift('')

  let budget = limit - stringsLength
  const out: string[] = []
  const longest = Math.max(strings.length, expressions.length)

  for (let i = 0; i < longest; i++) {
    if (i < strings.length) {
      out.push(strings[i])
    }

    if (budget && i < expressions.length) {
      const exp = String(expressions[i])
      if (exp.length < budget) {
        out.push(exp)
        budget -= exp.length
      } else {
        out.push(`${exp.substring(0, budget - 1)}…`)
        budget = 0
      }
    }
  }

  return out.join('')
}

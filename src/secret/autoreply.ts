import {
  ActionRowBuilder,
  BaseMessageOptions,
  ButtonBuilder,
  ButtonStyle,
  ClientUser,
  Message,
  OAuth2Scopes,
} from 'discord.js'
import { SleetModule } from 'sleetcord'

export const autoreply = new SleetModule(
  {
    name: 'autoreply',
  },
  {
    messageCreate: handleMessageCreate,
  },
)

const THANKS_REGEX = /thanks?\s*(u|you)?\s*(,\s*)?tol(bot)?/i
const SOURCE_URL = 'https://github.com/AtoraSuunva/smolbot/tree/development'

async function handleMessageCreate(message: Message): Promise<unknown> {
  if (message.author.bot) return

  if (THANKS_REGEX.test(message.content)) {
    return message.reply({
      content: 'np',
      allowedMentions: { parse: [], repliedUser: false },
    })
  }

  const { client } = message
  const userRegex = lazyInitClientUserRegex(client.user)

  if (userRegex.test(message.content)) {
    const inviteLink = client.generateInvite({
      scopes: client.application.installParams?.scopes ?? [
        OAuth2Scopes.Bot,
        OAuth2Scopes.ApplicationsCommands,
      ],
    })

    const components = mentionReplyComponents(inviteLink)

    return message.reply({
      content: `Use slash commands to interact with me, type \`/\` into your chat bar to see them.\nDon't see them? Try reinviting me!\nWant to learn more about how to use me? Click the "More Info" button!`,
      components,
    })
  }

  return
}

function mentionReplyComponents(
  inviteLink: string,
): NonNullable<BaseMessageOptions['components']> {
  const row = new ActionRowBuilder<ButtonBuilder>()
  const inviteButton = new ButtonBuilder()
    .setLabel('Invite Bot')
    .setStyle(ButtonStyle.Link)
    .setURL(inviteLink)

  const sourceButton = new ButtonBuilder()
    .setLabel('More Info & Source Code')
    .setStyle(ButtonStyle.Link)
    .setURL(SOURCE_URL)

  row.addComponents([inviteButton, sourceButton])

  return [row]
}

let clientUserRegex: RegExp | null = null
function lazyInitClientUserRegex(user: ClientUser): RegExp {
  return (clientUserRegex ??= new RegExp(`^<@!?${user.id}>$`))
}

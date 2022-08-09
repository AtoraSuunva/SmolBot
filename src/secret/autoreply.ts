import { ClientUser, Message, OAuth2Scopes } from 'discord.js'
import { SleetModule } from 'sleetcord'

export const autoreply = new SleetModule(
  {
    name: 'autoreply',
  },
  {
    messageCreate: handleMessageCreate,
  },
)

const thanksRegex = /thanks?\s*(u|you)?\s*(,\s*)?smol(bot)?/i

let clientUserRegex: RegExp | null = null

function handleMessageCreate(message: Message): Promise<unknown> | void {
  if (message.author.bot) return

  if (thanksRegex.test(message.content)) {
    return message.reply({
      content: 'np',
      allowedMentions: { parse: [], repliedUser: false },
    })
  }

  const { client } = message
  const { user } = client

  if (user) {
    const userRegex = lazyInitClientUserRegex(user)
    const inviteLink = client.generateInvite({
      scopes: client.application?.installParams?.scopes ?? [
        OAuth2Scopes.Bot,
        OAuth2Scopes.ApplicationsCommands,
      ],
    })

    if (userRegex.test(message.content)) {
      return message.reply({
        content: `Use slash commands to interact with me, type \`/\` into your chat bar to see them.\nDon't see them? Try kicking me and reinviting me. ${inviteLink}`,
      })
    }
  }
}

function lazyInitClientUserRegex(user: ClientUser): RegExp {
  return (clientUserRegex ??= new RegExp(`^<@!?${user.id}>$`))
}

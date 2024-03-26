import { Guild, GuildMember, PartialUser, User } from 'discord.js'
import { SleetModule, formatUser } from 'sleetcord'
import { formatLog, getValidatedConfigFor } from '../utils.js'
import { UserUpdate } from '../modlog_manage.js'

export const logUserUpdate = new SleetModule(
  {
    name: 'logUserUpdate',
  },
  {
    userUpdate,
  },
)

async function userUpdate(oldUser: User | PartialUser, newUser: User) {
  // We can't compare partial old user to the new version at all, since it's just an ID
  if (oldUser.partial) return

  let usernameUpdate = ''
  let avatarUpdate = ''

  if (oldUser.tag !== newUser.tag) {
    usernameUpdate = ` ⇒ ${formatUser(newUser, { id: false })}`
  }

  if (oldUser.avatar !== newUser.avatar) {
    avatarUpdate = ` ⇒ ${newUser.displayAvatarURL()}`
  }

  if (!usernameUpdate && !avatarUpdate) {
    return
  }

  const logMessage = {
    [UserUpdate.Username]: usernameUpdate,
    [UserUpdate.Avatar]: avatarUpdate,
    [UserUpdate.Both]: `${usernameUpdate}${avatarUpdate}`,
    [UserUpdate.None]: '',
  }

  for (const guild of newUser.client.guilds.cache.values()) {
    const conf = await getValidatedConfigFor(guild)
    if (!conf) continue
    const { config, channel } = conf

    switch (config.userUpdate) {
      case UserUpdate.Username:
        if (!usernameUpdate) continue
        break
      case UserUpdate.Avatar:
        if (!avatarUpdate) continue
        break
      case UserUpdate.Both:
        if (!usernameUpdate && !avatarUpdate) continue
        break
      case UserUpdate.None:
        continue
    }

    const member = await fetchUserInGuild(guild, newUser)

    if (!member) continue

    const message = `${formatUser(oldUser)}${
      logMessage[config.userUpdate as UserUpdate]
    }`

    await channel.send(formatLog('👥', 'User Update', message))
  }
}

async function fetchUserInGuild(
  guild: Guild,
  user: User,
): Promise<GuildMember | null> {
  try {
    // TODO: optimize this, since it would fetch the member in EVERY guild the bot is in
    return await guild.members.fetch(user)
  } catch {
    return null
  }
}

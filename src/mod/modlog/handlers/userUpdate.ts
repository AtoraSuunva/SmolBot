import { Guild, GuildMember, PartialUser, User } from 'discord.js'
import { SleetModule, formatUser } from 'sleetcord'
import { formatLog, getValidatedConfigFor } from '../utils.js'
import { UserUpdate } from '../edit.js'

export const logUserUpdate = new SleetModule(
  {
    name: 'logUserUpdate',
  },
  {
    userUpdate,
  },
)

async function userUpdate(oldUser: User | PartialUser, newUser: User) {
  let usernameUpdate = ''
  let avatarUpdate = ''

  if (oldUser.username !== newUser.username) {
    usernameUpdate = ` => ${formatUser(newUser, { id: false })}`
  }

  if (oldUser.avatar !== newUser.avatar) {
    avatarUpdate = ` => ${newUser.displayAvatarURL()}`
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

    const message = `${formatUser(oldUser as User)}${
      logMessage[config.userUpdate as UserUpdate]
    }`

    channel.send(formatLog('👥', 'User Update', message))
  }
}

async function fetchUserInGuild(
  guild: Guild,
  user: User,
): Promise<GuildMember | null> {
  try {
    return await guild.members.fetch(user)
  } catch {
    return null
  }
}

import { ChannelType, Constants } from 'discord.js'

// TODO: d.js includes GroupDM in their constant, which is wrong
export const GuildTextBasedChannelTypes =
  Constants.GuildTextBasedChannelTypes.filter((t) => t !== ChannelType.GroupDM)

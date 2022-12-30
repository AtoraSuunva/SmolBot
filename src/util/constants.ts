import { APIApplicationCommandChannelOption, ChannelType } from 'discord.js'

export const TextChannelTypes: NonNullable<
  APIApplicationCommandChannelOption['channel_types']
> = [
  ChannelType.GuildText,
  ChannelType.GuildVoice,
  ChannelType.GuildAnnouncement,
  ChannelType.AnnouncementThread,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
]

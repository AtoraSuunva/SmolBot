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

/** 1 second in ms */
export const SECOND = 1000
/** 1 minute in ms */
export const MINUTE = SECOND * 60
/** 1 hour in ms */
export const HOUR = MINUTE * 60
/** 1 day in ms */
export const DAY = HOUR * 24

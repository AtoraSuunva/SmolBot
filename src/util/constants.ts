import { APIApplicationCommandChannelOption, ChannelType } from 'discord.js'

export const TextChannelTypes: NonNullable<
  APIApplicationCommandChannelOption['channel_types']
> = [
  ChannelType.GuildText,
  ChannelType.GuildVoice,
  ChannelType.GuildNews,
  ChannelType.GuildNewsThread,
  ChannelType.GuildPublicThread,
  ChannelType.GuildPrivateThread,
]

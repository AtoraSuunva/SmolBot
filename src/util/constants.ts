import {
  APIApplicationCommandChannelOption,
  ChannelType,
} from 'discord-api-types/v10'

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

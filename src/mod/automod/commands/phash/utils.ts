import { User, type ChatInputCommandInteraction } from 'discord.js'

export function isAppOwner(interaction: ChatInputCommandInteraction) {
  const appOwner = interaction.client.application?.owner

  if (!appOwner) {
    return false
  }

  if (appOwner instanceof User) {
    return interaction.user.id === appOwner.id
  }

  // If the owner is a team, check if the user is a member of the team
  return (
    appOwner.owner?.id === interaction.user.id ||
    appOwner.members.some((member) => member.user.id === interaction.user.id)
  )
}

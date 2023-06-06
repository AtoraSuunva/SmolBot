import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Guild,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js'
import { getGuild, SleetSlashSubcommand } from 'sleetcord'
import { MINUTE } from '../../util/constants.js'
import { prisma } from '../../util/db.js'
import { welcomeCache } from './cache.js'

export const deleteCommand = new SleetSlashSubcommand(
  {
    name: 'delete',
    description: 'Delete the welcome config (IRREVERSIBLE)',
  },
  {
    run: runDelete,
  },
)

async function runDelete(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const defer = interaction.deferReply({ fetchReply: true })

  const guild = await getGuild(interaction, true)

  const welcome = await prisma.welcomeSettings.findUnique({
    where: {
      guildID: guild.id,
    },
  })

  const message = await defer

  if (welcome === null) {
    return void interaction.editReply({
      content: 'No welcome config found. So nothing to delete.',
    })
  }

  const deleteButton = new ButtonBuilder()
    .setStyle(ButtonStyle.Danger)
    .setCustomId(`welcome/delete:${guild.id},${interaction.user.id}`)
    .setLabel('Confirm Delete')

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(deleteButton)

  await interaction.editReply({
    content: 'Are you sure? You **CANNOT** undo this!!!',
    components: [row],
  })

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 2 * MINUTE,
  })

  collector.on('collect', async (i) => {
    if (i.user.id === interaction.user.id) {
      await deleteWelcomeSettingsFrom(guild, i)
      await interaction.editReply({
        content: `Welcome config deleted. Requested by ${interaction.user}`,
        components: [],
      })
      collector.stop()
    } else {
      await i.reply({
        ephemeral: true,
        content: `Only ${interaction.user} can confirm this deletion.`,
      })
    }
  })

  collector.on('end', (_collected, reason) => {
    if (reason === 'time') {
      void interaction.editReply({
        content: 'Deletion timed out',
        components: [],
      })
    }
  })
}

async function deleteWelcomeSettingsFrom(
  guild: Guild,
  interaction: ButtonInteraction,
) {
  const defer = interaction.deferReply({
    ephemeral: true,
  })

  await prisma.welcomeSettings.delete({
    where: {
      guildID: guild.id,
    },
  })

  await prisma.welcomeJoins.deleteMany({
    where: {
      guildID: guild.id,
    },
  })

  welcomeCache.delete(guild.id)

  await defer
  await interaction.editReply({
    content: 'Welcome config deleted.',
  })
}

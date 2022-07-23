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
import { prisma } from '../../util/db.js'

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
      guild_id: guild.id,
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

  interaction.editReply({
    content: 'Are you sure? You **CANNOT** undo this!!!',
    components: [row],
  })

  if ('createMessageComponentCollector' in message) {
    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60 * 1000,
    })

    collector.on('collect', i => {
      if (i.user.id === interaction.user.id) {
        deleteWelcomeSettingsFrom(guild, i)
        interaction.editReply({
          content: `Welcome config deleted. Requested by ${interaction.user}`,
          components: [],
        })
        collector.stop()
      } else {
        i.reply({
          ephemeral: true,
          content: `Only ${interaction.user} can confirm this deletion.`,
        })
      }
    })

    collector.on('end', (_collected, reason) => {
      if (reason === 'time') {
        interaction.editReply({
          content: 'Deletion timed out',
          components: [],
        })
      }
    })
  }
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
      guild_id: guild.id,
    },
  })

  await defer
  interaction.editReply({
    content: 'Welcome config deleted.',
  })
}

import type { Prisma } from '@prisma/client'
import { ApplicationCommandOptionType } from 'discord-api-types/v10'
import type { ChatInputCommandInteraction } from 'discord.js'
import { SleetSlashSubcommand, getGuild } from 'sleetcord'
import { prisma } from '../../../util/db.js'
import { formatConfig } from '../../../util/format.js'
import { FIELD_MODMAIL_ID } from '../fields/utils.js'

export const modmail_ticket_config = new SleetSlashSubcommand(
  {
    name: 'config',
    description: 'Configure settings for a ticket',
    options: [
      FIELD_MODMAIL_ID,
      {
        name: 'max_open_tickets',
        description:
          'The maximum amount of tickets a user can have open at a time',
        type: ApplicationCommandOptionType.Integer,
        min_value: 0,
        max_value: 100,
      },
      {
        name: 'ratelimit',
        description:
          'Time (in seconds) a user must wait between creating tickets',
        type: ApplicationCommandOptionType.Integer,
        min_value: 0,
      },
    ],
  },
  {
    run: runConfigTicket,
  },
)

async function runConfigTicket(interaction: ChatInputCommandInteraction) {
  const modmailID = interaction.options.getString('modmail_id', true)
  const maxOpenTickets = interaction.options.getInteger('max_open_tickets')
  const ratelimit = interaction.options.getInteger('ratelimit')

  await interaction.deferReply()

  const guild = await getGuild(interaction, true)

  const mergedConfig: Omit<Prisma.ModMailTicketConfigCreateInput, 'updatedAt'> =
    {
      guildID: guild.id,
      modmailID,
    }

  if (maxOpenTickets !== null) {
    mergedConfig.maxOpenTickets = maxOpenTickets
  }

  if (ratelimit !== null) {
    mergedConfig.ratelimit = ratelimit
  }

  const newConfig = await prisma.modMailTicketConfig.upsert({
    where: {
      modmailID_guildID: {
        guildID: guild.id,
        modmailID,
      },
    },
    update: mergedConfig,
    create: mergedConfig,
  })

  await interaction.editReply({
    content: `Ticket config updated:\n${formatConfig({
      config: newConfig,
      guild,
    })}`,
    allowedMentions: { parse: [] },
  })
}

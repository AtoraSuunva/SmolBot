import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
  Colors,
  EmbedBuilder,
  EmbedFooterOptions,
} from 'discord.js'
import { formatUser, getGuild, SleetSlashCommand } from 'sleetcord'
import { fetchConfig, report_config } from './manage/config.js'
import { sendReport } from './utils.js'
import { report_message } from './report_message.js'

export const report = new SleetSlashCommand(
  {
    name: 'report',
    description: 'Report something to the moderators.',
    dm_permission: false,
    options: [
      {
        name: 'content',
        description: 'The content of your report.',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: 'anonymous',
        description: 'Send the report anonymously (default: true).',
        type: ApplicationCommandOptionType.Boolean,
        required: false,
      },
      {
        name: 'attachment',
        description: 'An attachment (eg. image) to include in the report.',
        type: ApplicationCommandOptionType.Attachment,
        required: false,
      },
    ],
  },
  {
    run: runReport,
  },
  [report_message, report_config],
)

async function runReport(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)

  const config = await fetchConfig(guild, interaction.user).catch((err) =>
    err instanceof Error ? err.message : String(err),
  )

  if (typeof config === 'string') {
    await interaction.reply({
      content: config,
      ephemeral: true,
    })
    return
  }

  const content = interaction.options.getString('content', true)
  const anonymous = interaction.options.getBoolean('anonymous') ?? true
  const attachment = interaction.options.getAttachment('attachment')

  const footer: EmbedFooterOptions = {
    text: `Reported by ${
      anonymous
        ? 'Anonymous'
        : formatUser(interaction.user, { markdown: false, escape: false })
    }`,
  }

  if (!anonymous) {
    footer.iconURL = interaction.user.displayAvatarURL()
  }

  const embed = new EmbedBuilder()
    .setTitle('Report')
    .setDescription(content)
    .setFooter(footer)
    .setColor(Colors.DarkPurple)

  if (attachment) {
    if (attachment.contentType?.startsWith('image/')) {
      embed.setImage(attachment.url)
    } else {
      embed.addFields([
        {
          name: 'Attachment',
          value: attachment.url,
        },
      ])
    }
  }

  const embeds = [embed]

  try {
    await sendReport(config, interaction.user, embeds)

    await interaction.reply({
      content:
        "Your report has been sent to the moderators.\nHere's a copy of your report:",
      embeds,
      ephemeral: true,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await interaction.reply({
      content: `Failed to send report: ${msg}`,
      ephemeral: true,
    })
  }
}

import {
  ApplicationCommandOptionType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  EmbedFooterOptions,
} from 'discord.js'
import { getGuild, SleetSlashCommand } from 'sleetcord'
import { ReportConfigResolved, fetchConfig } from './report_config.js'

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
)

async function runReport(interaction: ChatInputCommandInteraction) {
  const guild = await getGuild(interaction, true)

  let conf: ReportConfigResolved

  try {
    conf = await fetchConfig(guild)
  } catch (err) {
    const content = err instanceof Error ? err.message : String(err)
    interaction.reply({
      content,
      ephemeral: true,
    })
    return
  }

  const { config, reportChannel } = conf

  const content = interaction.options.getString('content', true)
  const anonymous = interaction.options.getBoolean('anonymous', false) ?? true
  const attachment = interaction.options.getAttachment('attachment', false)

  const footer: EmbedFooterOptions = {
    text: `Reported by ${anonymous ? 'Anonymous' : interaction.user.tag}`,
  }

  if (!anonymous) {
    footer.iconURL = interaction.user.displayAvatarURL()
  }

  const embed = new EmbedBuilder()
    .setTitle('Report')
    .setDescription(content)
    .setFooter(footer)

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

  await reportChannel.send({
    content: config.message,
    embeds: [embed],
  })

  interaction.reply({
    content:
      "Your report has been sent to the moderators.\nHere's a copy of your report:",
    embeds: [embed],
    ephemeral: true,
  })
}

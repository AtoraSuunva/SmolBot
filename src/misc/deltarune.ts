import type { Client } from 'discord.js'
import { DateTime } from 'luxon'
import { SleetModule } from 'sleetcord'
import { baseLogger, HOUR } from 'sleetcord-common'

export const deltarune = new SleetModule(
  {
    name: 'deltarune',
  },
  {
    clientReady: onReady,
  },
)

const deltaruneLogger = baseLogger.child({ module: 'deltarune' })
const guilds = ['1056668911103377408', '120330239996854274']

async function onReady(client: Client) {
  await updateEvents(client)

  setInterval(() => {
    updateEvents(client).catch((err) => {
      deltaruneLogger.error('Failed to update events:', err)
    })
  }, 1 * HOUR)
}

async function updateEvents(client: Client) {
  for (const guildId of guilds) {
    const guild = await client.guilds.fetch(guildId).catch(() => null)

    if (!guild) {
      deltaruneLogger.debug(`Guild ${guildId} not found`)
      continue
    }

    const me = await guild.members.fetchMe()

    if (!me.permissions.has('ManageEvents')) {
      deltaruneLogger.error(`Missing permissions in guild ${guildId}`)
      continue
    }

    const events = await guild.scheduledEvents.fetch()

    const deltaruneEvent = events.find(
      (event) => event.name === 'Deltarune Tomorrow',
    )

    if (!deltaruneEvent) {
      continue
    }

    const tomorrow = DateTime.now().plus({ days: 1 }).startOf('hour')

    if (tomorrow.toMillis() === deltaruneEvent.scheduledStartTimestamp) {
      deltaruneLogger.debug(
        `Event already scheduled for ${tomorrow.toISO()} in guild ${guildId}`,
      )
      continue
    }

    try {
      await deltaruneEvent.edit({
        scheduledStartTime: tomorrow.toMillis(),
        scheduledEndTime: tomorrow.plus({ hours: 1 }).toMillis(),
      })
    } catch (err) {
      deltaruneLogger.error(err, `Failed to update event in guild ${guildId}`)
    }
  }
}

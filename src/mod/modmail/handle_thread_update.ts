import type { AnyThreadChannel } from 'discord.js'
import { SleetModule } from 'sleetcord'
import { prisma } from '../../util/db.js'
import { getWebhookFor } from './handle_ticket_message.js'

export const handle_thread_update = new SleetModule(
  {
    name: 'handle_thread_update',
  },
  {
    threadUpdate: handleThreadUpdate,
    threadDelete: handleThreadDelete,
  },
)

interface ThreadStateChange {
  archived: boolean | null
  locked: boolean | null
}

const CHANGE_WORD = {
  archived: {
    true: 'archived',
    false: 'unarchived',
  },
  locked: {
    true: 'locked',
    false: 'unlocked',
  },
}

const CHANGE_ADDENDUM = {
  archived: {
    true: 'You can reply to this thread to re-open the ticket.',
    false: '',
  },
  locked: {
    true: 'You can no longer reply to this ticket.',
    false: 'You can reply to this ticket again.',
  },
}

const intlList = new Intl.ListFormat('en', {
  style: 'long',
  type: 'conjunction',
})

async function handleThreadUpdate(
  oldThread: AnyThreadChannel,
  newThread: AnyThreadChannel,
) {
  const ticket = await getTicket(newThread)

  if (!ticket || ticket.userThreadID === newThread.id) {
    // If it's not a ticket or if the user ticket thread was modified, ignore it
    // We only mirror changes to the mod ticket channel, for "avoiding infinite loop" reasons
    return
  }

  const { client } = newThread
  const userChannel = await client.channels
    .fetch(ticket.userChannelID)
    .catch(() => null)

  if (!userChannel || !('threads' in userChannel)) {
    return
  }

  const userThread = await userChannel.threads
    .fetch(ticket.userThreadID)
    .catch(() => null)

  if (!userThread) {
    return
  }

  let newState = false
  const threadChange: ThreadStateChange = {
    archived: null,
    locked: null,
  }

  if (
    newThread.archived !== null &&
    oldThread.archived !== newThread.archived &&
    userThread.archived !== newThread.archived
  ) {
    newState = true
    threadChange.archived = newThread.archived
  }

  if (
    newThread.locked !== null &&
    oldThread.locked !== newThread.locked &&
    userThread.locked !== newThread.locked
  ) {
    newState = true
    threadChange.locked = newThread.locked
  }

  if (!newState) {
    return
  }

  const webhook = await getWebhookFor(userChannel).catch(() => null)

  if (!webhook) {
    return
  }

  const changes = Object.entries(threadChange)
    .filter((e): e is [keyof typeof CHANGE_WORD, boolean] => e[1] !== null)
    .map(([key, value]) => CHANGE_WORD[key][String(value) as 'true' | 'false'])

  const addendums = Object.entries(threadChange)
    .filter((e): e is [keyof typeof CHANGE_ADDENDUM, boolean] => e[1] !== null)
    .map(
      ([key, value]) => CHANGE_ADDENDUM[key][String(value) as 'true' | 'false'],
    )
    .filter((v) => v)

  try {
    await webhook.send({
      content: `This ticket was ${intlList.format(
        changes,
      )} by a moderator.\n${addendums.join('\n')}`,
      threadId: userThread.id,
    })

    // Synching the archived state hides it from the channel list and prevents the user from seeing the "new message" indicator
    // So the user might never know it was archived

    // if (threadChange.archived !== null || newThread.archived !== null) {
    //   await userThread.setArchived(
    //     (threadChange.archived ?? newThread.archived)!,
    //   )
    // }

    if (threadChange.locked !== null || newThread.locked !== null) {
      // biome-ignore lint/style/noNonNullAssertion: we just checked at least one state wasn't null
      await userThread.setLocked((threadChange.locked ?? newThread.locked)!)
    }
  } catch {
    // ignore
  }
}

async function handleThreadDelete(thread: AnyThreadChannel) {
  console.log(`Thread ${thread.id} was deleted`)
  const ticket = await getTicket(thread)

  if (!ticket) {
    return
  }

  const { client } = thread
  const isUserThread = ticket.userThreadID === thread.id

  const otherChannel = await client.channels
    .fetch(isUserThread ? ticket.modChannelID : ticket.userChannelID)
    .catch(() => null)

  if (!otherChannel || !('threads' in otherChannel)) {
    return
  }

  const otherThread = await otherChannel.threads
    .fetch(isUserThread ? ticket.modThreadID : ticket.userThreadID)
    .catch(() => null)

  if (!otherThread) {
    return
  }

  await otherThread
    .send(
      `The ${isUserThread ? 'user' : 'mod'} thread linked to this ticket was deleted. You cannot reply to this ticket anymore.`,
    )
    .catch(() => {
      /* ignore */
    })

  // Mod thread was deleted, lock the user thread
  if (!isUserThread) {
    otherThread.setLocked(true)
  }

  await prisma.modMailTicket.update({
    where: {
      ticketID: ticket.ticketID,
    },
    data: {
      linkDeleted: true,
    },
  })
}

async function getTicket(thread: AnyThreadChannel) {
  return prisma.modMailTicket.findFirst({
    where: {
      OR: [
        {
          userThreadID: thread.id,
        },
        {
          modThreadID: thread.id,
        },
      ],
    },
  })
}

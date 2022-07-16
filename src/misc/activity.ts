import { ApplicationCommandOptionType } from 'discord-api-types/v10'
import { ActivityOptions, Client, CommandInteraction } from 'discord.js'
import { isOwner, SleetContext, SleetSlashCommand } from 'sleetcord'

/**
 * Valid choices for activities that bots can set
 */
const activityChoices = [
  {
    name: 'playing',
    value: 'PLAYING',
  },
  {
    name: 'streaming',
    value: 'STREAMING',
  },
  {
    name: 'listening',
    value: 'LISTENING',
  },
  {
    name: 'watching',
    value: 'WATCHING',
  },
  {
    name: 'competing',
    value: 'COMPETING',
  },
]

/**
 * Set the activity that a bot is doing, ie. the "**Playing** some game"
 */
export const activity = new SleetSlashCommand(
  {
    name: 'activity',
    description: 'Allow to randomly/manually set a new activity',
    options: [
      {
        name: 'name',
        type: ApplicationCommandOptionType.String,
        description: 'The new activity name to use',
      },
      {
        name: 'type',
        type: ApplicationCommandOptionType.String,
        description: 'The activity type to set',
        choices: activityChoices,
      },
    ],
  },
  {
    ready: runReady,
    run: runActivity,
  },
)

/** Our status list needs a type and name to apply */
type Status = Pick<ActivityOptions, 'name' | 'type'>

/** These statuses will be randomly selected and shown by the bot */
const statuses: Status[] = [
  { type: 'PLAYING', name: 'with boorus!' },
  { type: 'STREAMING', name: 'christian anime!' },
  { type: 'PLAYING', name: 'send nudes' },
  { type: 'PLAYING', name: 'as a glaceon irl' },
  { type: 'STREAMING', name: 'handholding' },
  { type: 'STREAMING', name: 'pawholding' },
  { type: 'STREAMING', name: 'some furry stuff' },
  { type: 'PLAYING', name: 'alone' },
  { type: 'PLAYING', name: 'with Atlas!' },
  { type: 'PLAYING', name: 'with RobotOtter!' },
  { type: 'PLAYING', name: 'with BulbaTrivia!' },
  { type: 'PLAYING', name: "with Haram--wait he's dead" },
  { type: 'PLAYING', name: 'with Tol Bot 💙' },
  { type: 'PLAYING', name: 'with Scops!' },
  { type: 'PLAYING', name: 'with Napstato--oh, right' },
  { type: 'PLAYING', name: 'gaming simulator 2022' },
  { type: 'PLAYING', name: 'aaa' },
  { type: 'PLAYING', name: 'with shit code.' },
  { type: 'STREAMING', name: 'the entire bee movie' },
  { type: 'STREAMING', name: 'memes.' },
  { type: 'STREAMING', name: 'Atlas Dying.' },
  { type: 'PLAYING', name: 'Japanese Anime Schoolgirl Sim' },
  { type: 'PLAYING', name: 'nya' },
  { type: 'PLAYING', name: 'as a flareon' },
  { type: 'STREAMING', name: 'Jolt hugs!' },
  { type: 'STREAMING', name: 'the Twitch logout page.' },
  { type: 'STREAMING', name: 'Playing' },
  { type: 'PLAYING', name: 'Streaming' },
  { type: 'PLAYING', name: 'send dudes' },
  { type: 'STREAMING', name: 'Atlas crying while debugging' },
  { type: 'WATCHING', name: 'atlas cry' },
  { type: 'WATCHING', name: 'the eevees!' },
  { type: 'LISTENING', name: 'the screams of the damned' },
  { type: 'WATCHING', name: 'probably something dumb' },
  { type: 'WATCHING', name: 'RobotOtter and Bulba fight' },
  { type: 'LISTENING', name: 'the moans of the damned' },
  { type: 'PLAYING', name: 'kobold' },
  { type: 'WATCHING', name: 'girls.. , .,' },
  { type: 'WATCHING', name: 'for big tiddy dragon gf' },
  { type: 'PLAYING', name: 'funny joke' },
  { type: 'COMPETING', name: 'competitive shitposting' },
  { type: 'COMPETING', name: 'the battle tower' },
  { type: 'COMPETING', name: 'a pokemon battle!' },
  { type: 'COMPETING', name: 'casual shitposting' },
  { type: 'COMPETING', name: 'a fight to the death' },
  { type: 'COMPETING', name: 'violence' },
]

/** Holds the timeout that we use to periodically change the status */
let timeout: NodeJS.Timeout
/** Every 15m, change the current status */
const timeoutDelay = 15 * 60 * 1000 // in ms

/** Run a timeout to change the bot's status on READY and every couple mins */
async function runReady(client: Client) {
  const status = getRandomStatus()
  client.user?.setActivity(status)
  timeout = setTimeout(() => runReady(client), timeoutDelay)
}

/** Either set a new random status, or set it to the one the user specified */
async function runActivity(
  this: SleetContext,
  interaction: CommandInteraction,
): Promise<void> {
  isOwner(interaction)

  if (!interaction.client.user) {
    return interaction.reply({
      ephemeral: true,
      content: 'The client user is not ready or available!',
    })
  }

  const name = interaction.options.getString('name')
  const type = interaction.options.getString('type') as Exclude<
    ActivityOptions['type'],
    undefined
  >

  let activity: Status
  clearTimeout(timeout)

  if (type === null && name === null) {
    // Set a random one
    activity = getRandomStatus()
    timeout = setTimeout(() => runReady(interaction.client), timeoutDelay)
  } else {
    const act: ActivityOptions = {}

    if (name !== null) act.name = name
    if (type !== null) act.type = type

    activity = act
  }

  interaction.client.user.setActivity(activity)
  return interaction.reply({
    ephemeral: true,
    content: `Set activity to:\n> ${formatStatus(activity)}`,
  })
}

/** You shouldn't see this, this is just a fallback status if the random pick fails */
const FALLBACK_STATUS: Status = {
  type: 'PLAYING',
  name: 'an error happened!!',
} as const

/**
 * Get a random status from our list of statuses
 * @returns a random status from the list
 */
function getRandomStatus(): Status {
  const randomIndex = Math.floor(Math.random() * statuses.length)
  return statuses[randomIndex] ?? FALLBACK_STATUS
}

/** Maps from an activity ID or string to a display string */
const reverseActivityTypesMap: Record<
  Exclude<Status['type'], undefined>,
  string
> = {
  0: 'Playing',
  PLAYING: 'Playing',
  1: 'Streaming',
  STREAMING: 'Streaming',
  2: 'Listening to',
  LISTENING: 'Listening to',
  3: 'Watching',
  WATCHING: 'Watching',
  5: 'Competing in',
  COMPETING: 'Competing in',
}

/**
 * Formats a status object into a string
 * @param status The status object
 * @returns The formatted string
 */
function formatStatus(status: Status): string {
  const activityType = reverseActivityTypesMap[status.type ?? 0]
  const activity = activityType ? `**${activityType}** ` : ''
  return `${activity}${status.name}`
}

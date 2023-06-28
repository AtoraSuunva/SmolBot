import { SleetContext, SleetModule, runningModuleStore } from 'sleetcord'
import { LoggerOptions, pino as createLogger } from 'pino'
import env from 'env-var'
import {
  ApplicationCommandOptionType,
  CommandInteractionOption,
  Interaction,
} from 'discord.js'

const NODE_ENV = env.get('NODE_ENV').required().asString()
const USE_PINO_PRETTY = env.get('USE_PINO_PRETTY').required().asBool()

const loggerOptions: LoggerOptions = {
  level: NODE_ENV === 'development' ? 'debug' : 'info',
}

if (USE_PINO_PRETTY) {
  loggerOptions.transport = {
    target: 'pino-dev',
  }
}

const baseLogger = createLogger(loggerOptions)
export const logger = baseLogger.child({ module: 'main' })
export const djsLogger = baseLogger.child({ module: 'discord.js' })

export const logging = new SleetModule(
  {
    name: 'logging',
  },
  {
    ready(this: SleetContext) {
      this.client.rest.on('invalidRequestWarning', (invalidRequestInfo) => {
        djsLogger.warn(
          moduleName(),
          'Invalid Request Warning: %o',
          invalidRequestInfo,
        )
      })
      this.client.rest.on('rateLimited', (rateLimitInfo) => {
        djsLogger.warn(moduleName(), 'Ratelimited: %o', rateLimitInfo)
      })
      this.client.rest.on('response', (request, response) => {
        djsLogger.debug(
          {
            ...moduleName(),
            type: 'rest',
          },
          `${request.method} ${censorPath(request.path)} ${
            response.statusCode
          } `,
        )
      })
      djsLogger.info('Client is ready!')
    },
    error: (error) => {
      djsLogger.error({ ...moduleName(), error })
    },
    warn: (warning) => {
      djsLogger.warn(moduleName(), warning)
    },
    debug: (debug) => {
      djsLogger.trace(moduleName(), debug)
    },
    shardReady(shardId, unavailableGuilds) {
      const unavailable = unavailableGuilds
        ? ` with ${unavailableGuilds.size} unavailable guilds`
        : ''
      djsLogger.info(`Shard ${shardId} ready${unavailable}`)
    },
    shardDisconnect(closeEvent, shardId) {
      djsLogger.warn(
        `Shard ${shardId} disconnected with code ${closeEvent.code}`,
      )
    },
    shardReconnecting(shardId) {
      djsLogger.info(`Shard ${shardId} reconnecting`)
    },
    shardResume(shardId, replayedEvents) {
      djsLogger.info(`Shard ${shardId} resumed with ${replayedEvents} events`)
    },
    shardError(error, shardId) {
      djsLogger.error(error, `Shard ${shardId} errored`)
    },

    sleetWarn: (warning) => {
      logger.warn(moduleName(), warning)
    },
    sleetDebug: (debug) => {
      logger.debug(moduleName(), debug)
    },
    applicationInteractionError: (error) => {
      logger.error({ ...moduleName(), error })
    },
    autocompleteInteractionError: (error) => {
      logger.error({ ...moduleName(), error })
    },
    // interactionCreate(interaction) {
    //   const str = interactionToString(interaction)
    //   logger.debug(
    //     {
    //       userId: interaction.user.id,
    //       interactionId: interaction.id,
    //     },
    //     `[INTR] ${str}`,
    //   )
    // },
    runModule(module, interaction) {
      logger.debug(
        {
          name: module.name,
          type: 'interaction-handle',
          userId: interaction.user.id,
          interactionId: interaction.id,
        },
        interactionToString(interaction),
      )
    },
    loadModule(module, qualifiedName) {
      logger.info(
        {
          name: module.name,
          qualifiedName: qualifiedName,
        },
        'Loaded module',
      )
    },
    unloadModule(module, qualifiedName) {
      logger.info(
        {
          name: module.name,
          qualifiedName: qualifiedName,
        },
        'Unloaded module',
      )
    },
  },
)

function moduleName(): { name: string } | undefined {
  const module = runningModuleStore.getStore()
  if (module) {
    return { name: module.name }
  }
  return
}

/**
 * Regexes to censor tokens from paths
 *
 * Regexes should have 3 capture groups:
 *   1. The path before the token
 *   2. The token itself
 *   3. The path after the token
 */
const CENSOR_REGEXES: RegExp[] = [
  /^(\/interactions\/\d{17,19}\/)(.*)(\/callback.*)/,
  /^(\/webhooks\/\d{17,19}\/)(.*)(\/messages.*)/,
]

/**
 * Attempts to "censor" a path by replacing tokens with :token
 *
 * Though technically not required (at least for interactions, since those tokens
 * expire after a couple seconds/15 mins), it makes logs a lot easier to read and parse
 * @param path The path to censor
 * @returns The censored path
 */
function censorPath(path: string): string {
  for (const regex of CENSOR_REGEXES) {
    path = path.replace(regex, '$1:token$3')
  }
  return path
}

const optionTypeToString: Record<ApplicationCommandOptionType, string> = {
  1: 'Subcommand',
  2: 'SubcommandGroup',
  3: 'String',
  4: 'Integer',
  5: 'Boolean',
  6: 'User',
  7: 'Channel',
  8: 'Role',
  9: 'Mentionable',
  10: 'Number',
  11: 'Attachment',
}

/**
 * Format an interaction into a string, like:
 * @example
 * // Slash commands & autocomplete
 * /command [option1<String>: value1] [option2<Integer>: value2]
 * /command sub_command [focused*<String>: value]
 * // Right click commands (message or user)
 * >command [Message (1233123123333): hello i am...]
 * >command [User (91298392100299): atorasuunva]
 * // Buttons/select menus/modals
 * [Button (custom-id)]
 * [SelectMenu (custom-id) [val1, val2, val3]]
 * [ModalSubmit (custom-id)]
 * @param interaction The interaction to format as a string
 * @returns The interaction as a string
 */
export function interactionToString(interaction: Interaction): string {
  if (interaction.isChatInputCommand() || interaction.isAutocomplete()) {
    const name = interaction.commandName
    const group = interaction.options.getSubcommandGroup(false) ?? ''
    const subcommand = interaction.options.getSubcommand(false) ?? ''

    const fGroup = group ? ` ${group}` : ''
    const fSubcommand = subcommand ? ` ${subcommand}` : ''

    const options = interaction.options.data.map(stringifyOption)
    return `/${name}${fGroup}${fSubcommand} ${options.join(' ')}`
  }

  if (interaction.isUserContextMenuCommand()) {
    return `>${interaction.commandName} [User] (${interaction.targetId}): ${interaction.targetUser.username}]`
  }

  if (interaction.isMessageContextMenuCommand()) {
    return `>${interaction.commandName} [Message] (${
      interaction.targetId
    }): ${interaction.targetMessage.content.substring(0, 50)}`
  }

  if (interaction.isButton()) {
    return `[Button] (${interaction.customId})`
  }

  if (interaction.isAnySelectMenu()) {
    return `[SelectMenu] (${interaction.customId}) [${interaction.values.join(
      ', ',
    )}]`
  }

  if (interaction.isModalSubmit()) {
    // So far, only strings exist for modal submits
    const opts = interaction.fields.fields.map(
      (f) => `[${f.customId}<String>: ${f.value}]`,
    )
    return `[ModalSubmit] (${interaction.customId}) ${opts.join(' ')}`
  }

  logger.warn('Unknown interaction type to stringify', interaction)

  return `[Unknown interaction type]`
}

function stringifyOption(opt: CommandInteractionOption): string {
  if (opt.type === ApplicationCommandOptionType.Subcommand) {
    return opt.options ? opt.options.map(stringifyOption).join(' ') : ''
  }

  if (opt.type === ApplicationCommandOptionType.SubcommandGroup) {
    return opt.options ? opt.options.map(stringifyOption).join(' ') : ''
  }

  return `[${opt.name}${opt.focused ? '*' : ''}<${
    optionTypeToString[opt.type]
  }>: ${opt.value}]`
}

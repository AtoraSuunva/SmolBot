import {
  type APIMessageTopLevelComponent,
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ApplicationIntegrationType,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  ComponentType,
  ContainerBuilder,
  type Interaction,
  InteractionContextType,
  type JSONEncodable,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js'
import { SleetSlashCommand } from 'sleetcord'
import { getComponentsOfType } from '../util/components.js'

export const calculator = new SleetSlashCommand(
  {
    name: 'calculator',
    description: 'Math!!!',
    contexts: [
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel,
    ],
    integration_types: [
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall,
    ],
    options: [
      {
        name: 'ephemeral',
        description: 'Only show the calculator to you (default: True)',
        type: ApplicationCommandOptionType.Boolean,
      },
      {
        name: 'multiplayer',
        description: 'Allow anyone to use the calculator (default: False)',
        type: ApplicationCommandOptionType.Boolean,
      },
    ],
  },
  {
    run: runCalculator,
    interactionCreate: handleInteractionCreate,
  },
)

const DISPLAY_ID = 69
const SINGLEPLAYER_ID = 420

const emptyDisplay = makeDisplay('0')

const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents([
  makeButton('C', 'C', ButtonStyle.Danger),
  makeButton('/', '/', ButtonStyle.Primary),
  makeButton('*', '*', ButtonStyle.Primary),
  makeButton('-', '-', ButtonStyle.Primary),
])

const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents([
  makeButton('7'),
  makeButton('8'),
  makeButton('9'),
  makeButton('+', '+:1', ButtonStyle.Primary),
])

const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents([
  makeButton('4'),
  makeButton('5'),
  makeButton('6'),
  makeButton('+', '+:2', ButtonStyle.Primary),
])

const row4 = new ActionRowBuilder<ButtonBuilder>().addComponents([
  makeButton('1'),
  makeButton('2'),
  makeButton('3'),
  makeButton('=', '=:1', ButtonStyle.Success),
])

const row5 = new ActionRowBuilder<ButtonBuilder>().addComponents([
  makeButton('0', '0:1'),
  makeButton('0', '0:2'),
  makeButton('.'),
  makeButton('=', '=:2', ButtonStyle.Success),
])

const buttons = [row1, row2, row3, row4, row5]

async function runCalculator(interaction: ChatInputCommandInteraction) {
  const ephemeral = interaction.options.getBoolean('ephemeral') ?? true
  const multiplayer = interaction.options.getBoolean('multiplayer') ?? false

  const components: JSONEncodable<APIMessageTopLevelComponent>[] = [
    emptyDisplay,
    ...buttons,
  ]

  if (!multiplayer) {
    components.push(
      new TextDisplayBuilder({
        id: SINGLEPLAYER_ID,
        content: `-# Only ${interaction.user.username} can use this`,
      }),
    )
  }

  await interaction.reply({
    flags:
      MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0),
    components,
  })
}

async function handleInteractionCreate(interaction: Interaction) {
  if (!interaction.isButton()) return

  const { customId } = interaction
  const [module, op] = customId.split(':')

  if (module !== 'calc') return

  const textDisplays = getComponentsOfType(
    interaction.message.components,
    ComponentType.TextDisplay,
  )

  const singleplayer = textDisplays.find((t) => t.id === SINGLEPLAYER_ID)

  if (
    singleplayer &&
    interaction.message.interactionMetadata?.user.id !== interaction.user.id
  ) {
    return await interaction.reply({
      content: "You can't use this.",
      flags: MessageFlags.Ephemeral,
    })
  }

  const equation = textDisplays
    .find((t) => t.id === DISPLAY_ID)
    ?.content.replace('# ', '')

  if (!equation) {
    return await interaction.reply({
      content: 'Something went wrong',
      flags: MessageFlags.Ephemeral,
    })
  }

  await interaction.deferUpdate()

  const lastWasNumber =
    equation[equation.length - 1].match(/\d/) ||
    equation[equation.length - 1] === '.'

  const lastWasOperator = isOperator(equation[equation.length - 1])

  switch (op) {
    case 'C': {
      return await interaction.editReply({
        components: [emptyDisplay, ...buttons],
      })
    }

    case '/':
    case '*':
    case '-':
    case '+': {
      if (lastWasOperator) {
        return await interaction.editReply({
          components: [
            makeDisplay(`${equation.slice(0, -1)}${op}`),
            ...buttons,
          ],
        })
      }

      return await interaction.editReply({
        components: [
          makeDisplay(`${equation}${lastWasNumber ? ` ${op}` : ''}`),
          ...buttons,
        ],
      })
    }

    case '=': {
      let result: string

      try {
        result = calculateResult(equation).toString()
      } catch (error) {
        result = String(error)
      }

      return await interaction.editReply({
        components: [makeDisplay(result), ...buttons],
      })
    }

    case '.': {
      const lastWasNonDecimalNumber = equation
        .split(' ')
        .slice(-1)[0]
        .match(/^\d+$/)

      return await interaction.editReply({
        components: [
          makeDisplay(`${equation}${lastWasNonDecimalNumber ? '.' : ''}`),
          ...buttons,
        ],
      })
    }

    default: {
      const space = lastWasNumber ? '' : ' '

      return await interaction.editReply({
        components: [
          makeDisplay(`${equation === '0' ? '' : equation}${space}${op}`),
          ...buttons,
        ],
      })
    }
  }
}

function makeDisplay(value: string) {
  return new ContainerBuilder({
    components: [
      {
        id: DISPLAY_ID,
        type: ComponentType.TextDisplay,
        content: `# ${value}`,
      },
    ],
  })
}

function makeButton(label: string, id = label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder()
    .setCustomId(`calc:${id}`)
    .setLabel(label)
    .setStyle(style)
}

const precedence: Record<string, number> = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2,
}

const isOperator = (token: string) => ['+', '-', '*', '/'].includes(token)
const isNumber = (token: string) => !Number.isNaN(Number.parseFloat(token))

function calculateResult(equation: string): number {
  const tokens = equation.split(' ')
  const outputQueue: string[] = []
  const operatorStack: string[] = []

  // Shunting Yard Algorithm
  for (const token of tokens) {
    if (isNumber(token)) {
      outputQueue.push(token)
    } else if (isOperator(token)) {
      while (
        operatorStack.length > 0 &&
        precedence[operatorStack[operatorStack.length - 1]] >= precedence[token]
      ) {
        // biome-ignore lint/style/noNonNullAssertion: we just checked the length
        outputQueue.push(operatorStack.pop()!)
      }
      operatorStack.push(token)
    }
  }

  while (operatorStack.length > 0) {
    // biome-ignore lint/style/noNonNullAssertion: we just checked the length
    outputQueue.push(operatorStack.pop()!)
  }

  // Evaluate Postfix Expression
  const stack: number[] = []

  for (const token of outputQueue) {
    if (isNumber(token)) {
      stack.push(Number.parseFloat(token))
    } else if (isOperator(token)) {
      const b = stack.pop()
      const a = stack.pop()

      if (b === undefined || a === undefined) {
        throw new Error('Invalid expression')
      }

      if (token === '/' && b === 0) {
        throw new Error('Division by zero')
      }

      switch (token) {
        case '+':
          stack.push(a + b)
          break
        case '-':
          stack.push(a - b)
          break
        case '*':
          stack.push(a * b)
          break
        case '/':
          stack.push(a / b)
          break
      }
    }
  }

  return stack.pop() ?? 0
}

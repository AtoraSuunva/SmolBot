import {
  ActionRowBuilder,
  type APIMessageTopLevelComponent,
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

import { getComponentsOfType } from '../helpers/components.js'

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

enum Token {
  Clear = 'C',
  ParenthesisIcon = '()',
  OpenParenthesis = '(',
  CloseParenthesis = ')',
  Exponential = '^',
  Divide = '÷',
  Multiply = '×',
  Subtract = '−',
  Add = '+',
  Sign = '+/-',
  Period = '.',
  Equal = '=',
}

const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents([
  makeButton(Token.Clear, Token.Clear, ButtonStyle.Danger),
  makeButton(Token.ParenthesisIcon, Token.ParenthesisIcon, ButtonStyle.Primary),
  makeButton(Token.Exponential, Token.Exponential, ButtonStyle.Primary),
  makeButton(Token.Divide, Token.Divide, ButtonStyle.Primary),
])

const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents([
  makeButton('7'),
  makeButton('8'),
  makeButton('9'),
  makeButton(Token.Multiply, Token.Multiply, ButtonStyle.Primary),
])

const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents([
  makeButton('4'),
  makeButton('5'),
  makeButton('6'),
  makeButton(Token.Subtract, Token.Subtract, ButtonStyle.Primary),
])

const row4 = new ActionRowBuilder<ButtonBuilder>().addComponents([
  makeButton('1'),
  makeButton('2'),
  makeButton('3'),
  makeButton(Token.Add, Token.Add, ButtonStyle.Primary),
])

const row5 = new ActionRowBuilder<ButtonBuilder>().addComponents([
  makeButton(Token.Sign, Token.Sign, ButtonStyle.Primary),
  makeButton('0'),
  makeButton(Token.Period),
  makeButton(Token.Equal, Token.Equal, ButtonStyle.Success),
])

const buttons = [row1, row2, row3, row4, row5]

async function runCalculator(interaction: ChatInputCommandInteraction) {
  const ephemeral = interaction.options.getBoolean('ephemeral') ?? true
  const multiplayer = interaction.options.getBoolean('multiplayer') ?? false

  const components: JSONEncodable<APIMessageTopLevelComponent>[] = [emptyDisplay, ...buttons]

  if (!multiplayer) {
    components.push(
      new TextDisplayBuilder({
        id: SINGLEPLAYER_ID,
        content: `-# Only ${interaction.user.username} can use this.`,
      }),
    )
  }

  await interaction.reply({
    flags: MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0),
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

  if (singleplayer && interaction.message.interactionMetadata?.user.id !== interaction.user.id) {
    return await interaction.reply({
      content: "You can't use this.",
      flags: MessageFlags.Ephemeral,
    })
  }

  const rawEquation = textDisplays.find((t) => t.id === DISPLAY_ID)?.content.replace('# ', '')

  if (!rawEquation) {
    return await interaction.reply({
      content: 'Something went wrong',
      flags: MessageFlags.Ephemeral,
    })
  }

  const equation = rawEquation.startsWith('Error:') ? '0' : rawEquation

  await interaction.deferUpdate()

  const singleplayerComponents = singleplayer ? [singleplayer] : []

  const lastWasNumber =
    equation[equation.length - 1].match(/\d/) || equation[equation.length - 1] === '.'

  const lastWasOperator = isOperator(equation[equation.length - 1])

  switch (op) {
    case Token.Clear: {
      return await interaction.editReply({
        components: [emptyDisplay, ...buttons, ...singleplayerComponents],
      })
    }

    case Token.Divide:
    case Token.Multiply:
    case Token.Subtract:
    case Token.Add:
    case Token.Exponential: {
      if (lastWasOperator) {
        return await interaction.editReply({
          components: [
            makeDisplay(`${equation.slice(0, -1)}${op}`),
            ...buttons,
            ...singleplayerComponents,
          ],
        })
      }

      return await interaction.editReply({
        components: [
          makeDisplay(`${equation}${lastWasNumber ? ` ${op}` : ''}`),
          ...buttons,
          ...singleplayerComponents,
        ],
      })
    }

    case Token.ParenthesisIcon: {
      // If the last token was an operator, add an opening parenthesis
      if (lastWasOperator) {
        return await interaction.editReply({
          components: [makeDisplay(`${equation} (`), ...buttons, ...singleplayerComponents],
        })
      }

      // Otherwise it's a number, in which case:
      //   - If there's an unmatched opening parenthesis, add a closing parenthesis
      //   - Otherwise add a multiplication operator and an opening parenthesis

      // Check for unmatched opening parentheses
      const unmatchedOpening =
        (equation.match(/\(/g) || []).length - (equation.match(/\)/g) || []).length

      if (unmatchedOpening > 0) {
        return await interaction.editReply({
          components: [
            makeDisplay(`${equation}${lastWasNumber ? ')' : ''}`),
            ...buttons,
            ...singleplayerComponents,
          ],
        })
      }

      // Otherwise add a multiplication operator and an opening parenthesis
      return await interaction.editReply({
        components: [
          makeDisplay(`${equation}${lastWasNumber ? ` ${Token.Multiply} (` : ''}`),
          ...buttons,
          ...singleplayerComponents,
        ],
      })
    }

    case Token.Sign: {
      if (lastWasOperator) {
        const endsWithNegativeSign = equation[equation.length - 1] === '-'

        return await interaction.editReply({
          components: [
            makeDisplay(endsWithNegativeSign ? equation.slice(0, -1).trim() : `${equation} -`),
            ...buttons,
            ...singleplayerComponents,
          ],
        })
      }

      // Otherwise last was a number, invert the sign of that number
      const lastSpace = equation.lastIndexOf(' ')
      const firstPart = equation.substring(0, lastSpace)
      const number = equation.substring(lastSpace + 1)
      const hasNegativeSign = number.startsWith('-')

      return await interaction.editReply({
        components: [
          makeDisplay(`${firstPart}${hasNegativeSign ? number.substring(1) : `-${number}`}`),
          ...buttons,
          ...singleplayerComponents,
        ],
      })
    }

    case Token.Equal: {
      let result: string

      try {
        result = calculateResult(equation).toString()
      } catch (error) {
        result = String(error)
      }

      return await interaction.editReply({
        components: [makeDisplay(result), ...buttons, ...singleplayerComponents],
      })
    }

    case Token.Period: {
      const lastWasNonDecimalNumber = equation
        .split(' ')
        .slice(-1)[0]
        .match(/^-?\d+$/)

      return await interaction.editReply({
        components: [
          makeDisplay(`${equation}${lastWasNonDecimalNumber ? '.' : ''}`),
          ...buttons,
          ...singleplayerComponents,
        ],
      })
    }

    default: {
      const lastToken = equation.split(' ').pop()
      const lastWasZero = lastToken === '0' || lastToken === '-0'
      const lastCharacter = equation[equation.length - 1]
      const space = lastWasNumber || lastCharacter === '(' || lastCharacter === '-' ? '' : ' '

      return await interaction.editReply({
        components: [
          makeDisplay(
            `${equation === '0' ? '' : lastWasZero ? equation.slice(0, -1) : equation}${space}${op}`,
          ),
          ...buttons,
          ...singleplayerComponents,
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
  return new ButtonBuilder().setCustomId(`calc:${id}`).setLabel(label).setStyle(style)
}

const precedence: Record<string, number> = {
  [Token.Add]: 1,
  [Token.Subtract]: 1,
  [Token.Multiply]: 2,
  [Token.Divide]: 2,
}

const isOperator = (token: string) =>
  [Token.Add, Token.Subtract, Token.Multiply, Token.Divide, Token.Exponential].includes(
    token as Token,
  )
const isNumber = (token: string) => !Number.isNaN(Number.parseFloat(token))

function tokenize(equation: string): string[] {
  const tokens: string[] = []
  let currentToken = ''

  for (const char of equation) {
    if (/[-.\d]/.test(char)) {
      currentToken += char
    } else if (/\s/.test(char)) {
      if (currentToken) {
        tokens.push(currentToken)
        currentToken = ''
      }
    } else {
      if (currentToken) {
        tokens.push(currentToken)
        currentToken = ''
      }
      tokens.push(char)
    }
  }

  if (currentToken) {
    tokens.push(currentToken)
  }

  return tokens
}

function calculateResult(equation: string): number {
  const tokens = tokenize(equation)
  const outputQueue: string[] = []
  const operatorStack: string[] = []

  // Shunting Yard Algorithm
  // https://en.wikipedia.org/wiki/Shunting_yard_algorithm#The_algorithm_in_detail
  for (const token of tokens) {
    if (isNumber(token)) {
      outputQueue.push(token)
    } else if (isOperator(token)) {
      while (
        operatorStack.length > 0 &&
        precedence[operatorStack[operatorStack.length - 1]] >= precedence[token]
      ) {
        outputQueue.push(operatorStack.pop()!)
      }
      operatorStack.push(token)
    } else if (token === Token.OpenParenthesis) {
      operatorStack.push(token)
    } else if (token === Token.CloseParenthesis) {
      while (operatorStack[operatorStack.length - 1] !== Token.OpenParenthesis) {
        if (operatorStack.length === 0) {
          throw new Error('Mismatched parentheses')
        }

        outputQueue.push(operatorStack.pop()!)
      }

      if (operatorStack[operatorStack.length - 1] !== Token.OpenParenthesis) {
        throw new Error('Mismatched parentheses')
      }

      operatorStack.pop()
    }
  }

  while (operatorStack.length > 0) {
    outputQueue.push(operatorStack.pop()!)
  }

  // Evaluate Postfix Expression
  const stack: number[] = []

  for (const token of outputQueue) {
    const parsed = Number.parseFloat(token)

    if (!Number.isNaN(parsed)) {
      stack.push(parsed)
    } else if (isOperator(token)) {
      const b = stack.pop()
      const a = stack.pop()

      if (b === undefined || a === undefined) {
        throw new Error('Invalid expression')
      }

      if (token === Token.Divide && b === 0) {
        throw new Error('Division by zero')
      }

      switch (token) {
        case Token.Add:
          stack.push(a + b)
          break
        case Token.Subtract:
          stack.push(a - b)
          break
        case Token.Multiply:
          stack.push(a * b)
          break
        case Token.Divide:
          stack.push(a / b)
          break
        case Token.Exponential:
          stack.push(a ** b)
          break
      }
    }
  }

  return stack.pop() ?? 0
}

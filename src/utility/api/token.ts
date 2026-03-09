import {
  type APIApplicationCommandBasicOption,
  ApplicationCommandOptionType,
  type ChatInputCommandInteraction,
  cleanCodeBlockContent,
  codeBlock,
  MessageFlags,
} from 'discord.js'
import { formatUser, inGuildGuard, SleetSlashSubcommand } from 'sleetcord'

import { createToken, verifyToken } from '../../helpers/api/auth.js'
import {
  Permission,
  PermissionCommandOptions,
  permissionBitfieldToStrings,
} from '../../helpers/api/token.js'
import { prisma } from '../../helpers/db.js'
import { plural, tableFormat } from '../../helpers/format.js'

export const create = new SleetSlashSubcommand(
  {
    name: 'create',
    description: 'Create a new token to access the API',
    options: [
      {
        name: 'name',
        description: 'The name of the token',
        type: ApplicationCommandOptionType.String,
        required: true,
        max_length: 25,
      },
      {
        name: 'expires_in',
        description: 'When the token should expire (in seconds)',
        type: ApplicationCommandOptionType.Integer,
        min_value: 0,
      },
      ...(PermissionCommandOptions.map((p) => ({
        name: p.name,
        description: p.description,
        type: ApplicationCommandOptionType.Boolean,
      })) as APIApplicationCommandBasicOption[]),
    ],
  },
  {
    run: runCreate,
  },
)

async function runCreate(interaction: ChatInputCommandInteraction) {
  inGuildGuard(interaction)

  await interaction.deferReply({
    flags: MessageFlags.Ephemeral,
  })

  const name = interaction.options.getString('name', true)

  let permissions = 0

  for (const perm of PermissionCommandOptions) {
    const value = interaction.options.getBoolean(perm.name, false)

    if (value) {
      permissions |= Permission[perm.permissionKey]
    }
  }

  const expiresIn = interaction.options.getInteger('expires_in', false)

  // Create token
  const { token } = await createToken({
    name,
    userID: interaction.user.id,
    guildID: interaction.guildId,
    permissions,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
  })

  await interaction.editReply({
    content: `Created token, save this somewhere secure because it will **NOT** be shown again:\n${codeBlock(token)}`,
  })
}

export const list = new SleetSlashSubcommand(
  {
    name: 'list',
    description: 'Lists all tokens for this guild',
    options: [
      {
        name: 'user',
        description: 'The user to list tokens for',
        type: ApplicationCommandOptionType.User,
      },
    ],
  },
  {
    run: runList,
  },
)

async function runList(interaction: ChatInputCommandInteraction) {
  inGuildGuard(interaction)

  await interaction.deferReply({
    flags: MessageFlags.Ephemeral,
  })

  const user = interaction.options.getUser('user')

  const tokens = await prisma.token.findMany({
    select: {
      tokenID: true,
      parentTokenID: true,
      userID: !user,
      name: true,
      permissions: true,
      // createdAt: true,
      expiresAt: true,
    },
    where: {
      guildID: interaction.guildId,
      ...(user ? { userID: user.id } : {}),
    },
  })

  if (tokens.length === 0) {
    await interaction.editReply({
      content: 'No tokens found.',
    })
    return
  }

  const formatted = tableFormat(tokens, {
    characterLimit: 1900,
    columnNames: {
      tokenID: 'ID',
      parentTokenID: 'Parent ID',
      userID: 'User',
      name: 'Name',
      permissions: 'Permissions',
      expiresAt: 'Expires At',
    },
    formatters: {
      permissions: (p) => (p === 0 ? 'None' : permissionBitfieldToStrings(p).join(', ')),
      // createdAt: (d) => d.toISOString(),
      expiresAt: (d) => (d ? d.toISOString() : 'Never'),
    },
  })

  await interaction.editReply({
    content: `Tokens for ${user ? formatUser(user) : 'this guild'}:\n${codeBlock('m', cleanCodeBlockContent(formatted))}`,
  })
}

export const check = new SleetSlashSubcommand(
  {
    name: 'check',
    description: 'Verifies if a token is still valid and shows information for it',
    options: [
      {
        name: 'token',
        description: 'The token to check',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
  {
    run: runCheck,
  },
)

async function runCheck(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({
    flags: MessageFlags.Ephemeral,
  })

  const token = interaction.options.getString('token', true)

  try {
    const payload = await verifyToken(token)

    await interaction.editReply({
      content: `This token is valid, decoded token:\n${codeBlock('json', JSON.stringify(payload, null, 2))}`,
    })
  } catch (err) {
    await interaction.editReply({
      content: `Failed to verify token: \`${Error.isError(err) ? err.message : String(err)}\``,
    })
  }
}

export const deleteToken = new SleetSlashSubcommand(
  {
    name: 'delete',
    description:
      'Deletes a token (and its child tokens) by providing a tid (token id) or the token itself',
    options: [
      {
        name: 'token_id',
        description: 'The ID of the token to delete',
        type: ApplicationCommandOptionType.Integer,
      },
      {
        name: 'token',
        description: 'The token to delete',
        type: ApplicationCommandOptionType.String,
      },
    ],
  },
  {
    run: runDelete,
  },
)

async function runDelete(interaction: ChatInputCommandInteraction) {
  inGuildGuard(interaction)
  await interaction.deferReply({
    flags: MessageFlags.Ephemeral,
  })

  const token_id = interaction.options.getInteger('token_id')
  const token = interaction.options.getString('token')

  if (token_id && token) {
    await interaction.editReply({
      content: 'Both token_id and token are provided, please provide only one.',
    })
    return
  }

  let resolvedTokenId = token_id

  if (token_id) {
    // Only let people revoke tokens from their own guilds
    const token = await prisma.token.findUnique({
      where: {
        tokenID: token_id,
        guildID: interaction.guildId,
      },
    })

    if (!token || token.guildID !== interaction.guildId) {
      await interaction.editReply({
        content: "You cannot revoke tokens that aren't from your guild.",
      })
      return
    }
  }

  if (token) {
    // Allow anyone to revoke tokens if they have access to them, since they could use the api to revoke them anyway
    try {
      const payload = await verifyToken(token)
      resolvedTokenId = payload.tokenID
    } catch (err) {
      await interaction.editReply({
        content: `Failed to verify token: \`${Error.isError(err) ? err.message : String(err)}\``,
      })
      return
    }
  }

  if (resolvedTokenId === null) {
    await interaction.editReply({
      content: 'Failed to resolve token ID.',
    })
    return
  }

  try {
    const { count } = await prisma.token.deleteMany({
      where: {
        tokenID: resolvedTokenId,
      },
    })

    await interaction.editReply({
      content: `Deleted token${count > 1 ? ` and ${plural('child token', count)}` : ''}:\n${codeBlock(String(token ?? token_id ?? 'unknown token'))}`,
    })
  } catch (err) {
    await interaction.editReply({
      content: `Failed to delete token: \`${Error.isError(err) ? err.message : String(err)}\``,
    })
  }
}

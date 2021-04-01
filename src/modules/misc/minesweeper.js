module.exports.config = {
  name: 'minesweeper',
  invokers: ['minesweeper'],
  help: 'The classic hardcore game',
  expandedHelp:
    "It's minesweeper. You can figure it out.\n`minesweeper [height] [width] [mines]` (height/width/mines optional)",
  usage: [
    'Play the game',
    'minesweeper',
    'Play with a different grid size',
    'minesweeper 15 15',
    'Play with more mines',
    'minesweeper 15 15 300',
  ],
}

const nMap = {
  0: ':zero:',
  1: ':one:',
  2: ':two:',
  3: ':three:',
  4: ':four:',
  5: ':five:',
  6: ':six:',
  7: ':seven:',
  8: ':eight:',
  9: ':nine:',
}
const charMap = c => (c === mine ? ':bomb:' : nMap[c])

module.exports.events = {}
module.exports.events.message = (bot, message) => {
  const [cmd, height = 7, width = 7, mines = 0] = bot.sleet.shlex(message)
  const [pHeight, pWidth, pMines] = [height, width, mines].map(v => parseInt(v))

  if ([pHeight, pWidth, pMines].find(v => Number.isNaN(v) || v < 1 || v > 20))
    return message.channel.send(
      'Invalid settings; Height/Width and number of mines must be between 1 and 20, inclusive.',
    )

  const { grid, minecount, safe } = createMinesweeper(pHeight, pWidth, pMines)
  const msg =
    `*Mines: ${minecount}*\n` +
    grid
      .map((row, y) =>
        row
          .map((v, x) =>
            safe[0] === y && safe[1] === x ? charMap(v) : `||${charMap(v)}||`,
          )
          .join(''),
      )
      .join('\n')

  if (msg.length > 2000)
    return message.channel.send(
      'Grid is too large to send, try something smaller.',
    )

  message.channel.send(msg)
}

/** Char to use for the mine */
const mine = 'X'

function createMinesweeper(height = 7, width = 7, mines = 0) {
  mines = mines || Math.floor((height * width) / 4) || 1
  let minecount = 0
  let safe
  const grid = genGrid(height, width)

  for (let i = 0; i < mines; i++)
    grid[randInt(0, height - 1)][randInt(0, width - 1)] = mine

  // Now to place the "counts"
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x] === mine) {
        minecount++
        continue
      }

      // 50% chance to swap safe spot
      if (!safe || Math.floor(Math.random() * 2)) safe = [y, x]
      grid[y][x] = countMines(x, y, grid)
    }
  }

  // no god can save you now
  safe = safe || [Infinity, Infinity]

  // Make it a regular array and not a Proxy
  return { grid: Array.from(grid), minecount, safe }
}

/**
 * Returns a random integer between min (inclusive) and max (inclusive)
 * Using Math.round() will give you a non-uniform distribution!
 */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// Because otherwise node just reuses the same array? ??
function genGrid(x, y) {
  const g = new Proxy([], { get: (t, p) => t[p] || [] })
  while (x--) {
    let e = []
    let w = y
    while (w--) e.push(null)
    g.push(e)
  }
  return g
}

// Get the 8 tiles around the tile, counting the num of mines
function countMines(x, y, grid) {
  return [
    grid[y - 1][x - 1],
    grid[y - 1][x],
    grid[y - 1][x + 1],
    grid[y][x - 1],
    grid[y][x + 1],
    grid[y + 1][x - 1],
    grid[y + 1][x],
    grid[y + 1][x + 1],
  ].filter(v => v === mine).length
}

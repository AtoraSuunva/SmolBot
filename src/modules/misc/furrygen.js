//wew
module.exports.config = {
  name: 'furrygen',
  invokers: ['furrygen', 'generate fursona', 'assign fursona'],
  help: 'Generates a fursona (randomly)',
  expandedHelp: 'You have no choice, you will be assigned a fursona.',
  usage: ['furrygen', 'god save you']
}

const colors = [
  'Red', 'Blue', 'Green', 'Teal', 'Tan', 'Pink',
  'Orange', 'White', 'Grey', 'Black', 'Brown',
  'Purple', 'Indigo', 'Gold', 'Bronze', 'Silver',
  'Yellow', 'Cyan',
]

function genColorScheme() {
  const c = []

  while (c.length < 3) {
    const cAdd = arrayPick(colors)
    if (c.includes(cAdd)) continue
    c.push(cAdd)
  }

  return c.join(', ')
}

const fields = {
  Species: [
    'Dragon', 'Dog', 'House Cat', 'Red Fox', 'Hawk',
    'Tiger', 'Wolf', 'Raccoon', 'Shark', 'Sergal',
    'Lion', 'Panda', 'Horse', 'Snail', 'Bull', 'Cheetah',
    'Deer', 'Crocodile', 'Seagull', 'Protogen',
    'Wickerbeast', 'Bat', 'Axotl', 'Lizard',
    'Kobold', 'Bird', 'Raptor', 'Rabbit', 'Bunny',
    'Mouse', 'Rat', 'Otter', 'Badger', 'Penguin',
    'Ferret', 'Ermine', 'Husky', 'Panda', 'Elephant',
    'Giraffe', 'Red Panda', 'Goat', 'Skunk', 'Hyena',
    'Coyote', 'Panther', 'Puma', 'Whale', 'Walrus',
    'Snow Leopard', 'Dingo', 'Bear', 'Cheetah',
    'Lynx', 'Monkey', 'Kangaroo', 'Great Dane',
    'Artic Fox', 'Fennec Fox', 'Doberman', 'Gorilla',
    'Border Collie', 'Squirrel', 'German Shephard',
    'Polar Bear', 'Alligator', 'Antelope', 'Caracal',
    'Chinchilla', 'Goose', 'Duck', 'Crocodile',
    'Crow', 'Bluejay', 'Dolphin', 'Badger', 'Artic Wolf',
    'Gray Wolf', 'Black Wolf', 'Sheep', 'Kitsune',
    'Hedgehog', 'Shiba Inu', 'Jaguar', 'Werewolf',
    'Jackal', 'Pony', 'Cougar', 'Dalmatian', 'Gryphon',
    'Unicorn', 'Chimera', 'Maned Wolf', 'Jackalope',
    'Bee', 'Moth', 'Armadillo', 'Mole', 'Porcupine',
    'Pine Marten', 'Meerkat', 'Weasel', 'Mongoose',
    'Mole', 'Lemur', 'Pig', 'Boar', 'Pangolin',
    'Platypus', 'Sloth', 'Beaver', 'Anteater',
    'Antelope', 'Chicken', 'Donkey', 'Fossa', 'Okapi',
    'Rhino', 'Swift Fox', 'Phoenix', 'Minotaur',
    'Lizardman', 'Naga', 'Snake', 'Cobra', 'Gargoyle',
    'Quetzalcoatl', 'Raven', 'Serval', 'Hamster',
    'Mink', 'Skaven', 'Eastern Dragon',
    'Eevee', 'Jolteon', 'Flareon', 'Vaporeon',
    'Espeon', 'Umbreon', 'Glaceon', 'Leafeon',
    'Sylveon', 'Hand Bag',
  ],

  Colors: [
    'Blue, Teal, Tan', 'Pink, Pastel Orange, White',
    'Orange, Grey, Black', 'Green, Pink, Black',
    'Red, Grey, Orange', 'Tan, Orange, Brown',
    'Blue, Grey, White', 'Black, White, Grey',
    'Brown, Orange, Pink', 'Orange, Black, Green',
    'White, Green, Purple', 'Indigo, Red, Blue',
    'Pink, Yellow, Teal', 'Yellow, Brown, Green',
    'Red, Yellow, White', 'Blue, Orange, White',
    'Gold, Red, Pink', 'Silver, Blue, Green',
    'Copper, Black, Grey', 'Crayons in a Blender',
    genColorScheme // Generate a random scheme with 3 colors
  ],

  Likes: [
    'Swimming', 'Climbing', 'Shopping', 'Playing Games',
    'History', 'Reading', 'Movies', 'Eating', 'Cooking',
    'Exploring', 'Painting', 'Crafting', 'Math', 'Acting',
    'Drawing', 'Fashion', 'Racing', 'Writing', 'Sports',
    'Sleeping', 'Hand Bags',
  ],

  Collects: [
    'Stamps', 'Coins', 'Figures', 'Hats', 'Shirts',
    'Books', 'Records', 'Plushies', 'Pins', 'Memorabilia',
    'Cards', 'Toys', 'Cheesegraters', 'Bottle Caps',
    'Sunglasses', 'Art', 'Trinkets', 'Postcards',
    'Shoes', 'Scarves', 'Hand Bags', 'Feathers',
  ],

  Accessory: [
    'Hat', 'Sunglasses', 'Scarf', 'Keychain', 'Gloves',
    'Backpack', 'Ring', 'Necklace', 'Ear Ring(s)', 'Belt',
    'Jacket', 'Hand Bag', 'Glasses', 'Sweater', 'Helmet',
    'Bracelet(s)', 'Bangle(s)', 'Bandanna', 'Hoodie', 'Cape',
  ],
}

const fieldList = Object.keys(fields)
const maxFieldLength = fieldList.map(v => v.length).sort().pop()

module.exports.events = {}
module.exports.events.message = (bot, message) => {
  const lines = []

  for (const f of fieldList) {
    const val = arrayPick(fields[f])
    const endVal = typeof val === 'function' ? val() : val
    lines.push(
      `${f.padEnd(maxFieldLength)} :: ${endVal}`
    )
  }

  message.channel.send('Here is your assigned fursona!', {
    embed: {
      description: '```asciidoc\n' + lines.join('\n') + '\n```'
    }
  })
}

//thanks mdn (inclusive)
function randInt(min, max) {
  min = Math.ceil(min)
  max = Math.floor(max)
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function arrayPick(arr) {
  return arr[randInt(0, arr.length - 1)]
}

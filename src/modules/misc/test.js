/*
 * Here's an example test command to use with this module system
 *
 * The filename doesn't *need* to match the command, but it's better if it does
 * Files with filesnames starting with "_" are ignored by the module loader, for util scripts
 * Files missing a "config" export are also ignored
 */

// This will hold the config settings for this module
// If it's not here it will not load this file
module.exports.config = {
  // The name of the command, used to distinguish it from others
  // *Must* be unique or only 1 module will be loaded in case of conflict!
  name: 'test',

  // Added onto the global invoker, so if the invoker is 'r!' in config.json this command can be invoked by either 'r!test' or 'r!t'
  // The invoker(s) is only used if you listen for the "message" event
  // A "null" value will cause it to be called on every message, essentially ignoring any invoker check
  invokers: ['test', 't'],

  // Short help text to show when you call "r!help"
  help: 'A test command',

  // Detailed help text to show when you call "r!help test"
  expandedHelp: 'Wow look even more help!',

  // Usage help, goes 'description', 'command'...
  usage: ['Do a thing', 'command', 'Do another thing', 'command anotherThing'],

  // If true, this module won't show on the list when help is called
  // It's optional, by default it'll show
  invisible: true,

  // Another optional config, this will disable auto loading on bot start
  // If it's not present it will load when the bot starts
  // Useful if you want to only enable a command when needed
  autoLoad: true
}

//I need to do this or else js complains that events is undefined
module.exports.events = {}

// init is called when:
//  1. Before logging in the bot, only sleet is defined
//  2. Whenever you reload/load a module, sleet and bot are both defined
// (Optional, with no init the system just won't call it)
module.exports.events.init = (sleet, bot) => {
  // Do something like load from the database using sleet.db...

  // If the module is being reloaded and the client is logged in, then bot is defined
  // Useful if your module stores something using "ready" (ie. a list of guilds) that
  // needs to be reloaded if the module is reloaded
  if (bot) {
    sleet.logger.log('I have been reloaded!')
  }
}

// Adding an event is simple
// Simply add your function to
// module.exports.events.eventName
// "eventName" is any event discord.js supports

// Args are in the form (discordClient, eventArgs...)
// discordClient => The client created with "new Discord.client()"
// eventArgs     => The args sent by the event

module.exports.events.message = (bot, message) => {
  bot.sleet.logger.log(message.content)

  message.channel.send(`Congrats! You found the test command!`)
}

// Here's an example with channelUpdate
// The args for the function are pretty much the same, just with "bot" added
/*
 module.exports.events.channelUpdate = (bot, oldChannel, newChannel) => {
  newChannel.send('There\'s been an update here!')
}
*/

//Finally, show off ready
module.exports.events.ready = (bot) => {
  bot.sleet.logger.info('I\'m ready!')
}

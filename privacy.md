# Smol Bot & RobotOtter Privacy Policy

Last Updated & Effective as of: September 18, 2023

For Discord Bots:

- Smol Bot#6975 (205164225625194496)
- RobotOtter#2318 (189078368522600449)
- Tol Bot#9551 (241631861917351936)

Smol Bot, RobotOtter, and Tol Bot are bots running the same codebase, but with Smol Bot/Tol Bot as a "Staging" and private versions. From hereafter, all bots will be referred to collectively as "The Bot" as both process the same data and are under the same Privacy Policy and TOS.

---

Definitions:

- **Configuration Data**: Parameters provided by server admins/moderators through bot commands to configure the bot's behavior. Includes Guild ID as a primary key. Does not include any other API data

The Bot stores the following data, for the following reasons:

- Action Log:
  - Configuration Data
  - User IDs for:
    - Actioned users
    - Responsible moderators
- Anti Raid:
  - Configuration Data
- API:
  - Token hash
  - Child/parent token metadata
  - User ID of the user who created the token
  - Guild ID of the guild this token is for
  - Permission bits of the token
- Application Emoji:
  - ID and file hash of the application emojis used by the bot
- Automod:
  - Configuration Data
  - Guild ID, rule ID, type, and parameters for automod rules
  - Image phashes for images uploaded to the bot by admins to mark as known scam/phishing images
- Auto Tag:
  - Configuration Data
- Dehoist:
  - Configuration Data
- Delete Police:
  - Configuration Data
- Lock Thread:
  - Configuration Data
- Modlog:
  - Configuration Data
- Modmail:
  - Configuration Data
  - User IDs of users who create tickets
- Mute:
  - Configuration Data
  - User IDs of muted users
  - Role IDs of roles removed from a muted user to restore them later
- Quote:
  - Configuration Data
- Report:
  - Configuration Data
  - Mapping of report ID to user ID
  - User IDs of users banned from reporting by server moderators
- Revoke invites on ban:
  - Configuration Data
- VC Action Queue:
  - User ID of the user to action
  - User ID of the user who requested the action
  - Action to apply to the user next time they join a VC (Server mute/unmute/deafen/undeafen)
- Voice Log:
  - Configuration Data
- Warning:
  - Configuration Data
  - User ID and username of the user being warned
  - User ID of the moderator applying the warning
- Welcome:
  - Configuration Data
  - User IDs of users who have joined a server _if_ the server is configured to not allow rejoins

Interactions and options provided are logged for debugging purposes.

[Sentry](https://sentry.io) is used for error tracking. Data collected when an error occurs:

- `error`: The error message and stack trace
- `interaction`: The interaction + options used (ex. `/search [site<string>: example.com] [tags<string>: foo bar]`)
- `module`: The module that errored
- Local stack variables

Errors reported to Sentry are deleted after 90 days.

Config data for a guild is stored for 10 days after The Bot is removed from a guild, unless the bot is re-invited.

Data deleted manually or automatically (after 10 days of not being in the guild) is deleted permanently.

For a copy of your data, or to delete the data by request, you may contact the developer. Please note that you may be required to verify your identity and/or your permissions on a server before requests can be completed, to avoid unauthorized access or deletion of data.

[Discord's Privacy Policy](https://discord.com/privacy) also applies while using Discord

---

The Bot is run by atorasuunva (74768773940256768)

You may contact the developer of The Bot on the [support server](https://discord.gg/8K3uCfb), through Discord, or via email (<bots@atora.dev>)

See also [The Bot's Terms of Service](./tos.md)

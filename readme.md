# Smol Bot

My private mod/util/misc bot for discord, mainly used for r/ut and sometimes beta/staging for RobotOtter

## Setup

1. Create a Postgres DB (Postgres is *required* because of use of json/array storage)
2. Create DB user for the bot
3. Run the table creations scripts under `sql/create`
4. `git clone`  
5. `npm i`  
6. Set the following env vars:

  - `BOT_TOKEN`
  - `GITHUB_TOKEN` (To be replaced with `GD_TOKEN` soon tm)
  - `DB_HOST`
  - `DB_PORT`
  - `DB_DATABASE`
  - `DB_USER`
  - `DB_PASSWORD`
  - `DB_POKEMON_DATABASE` (You can just reuse the same DB/user/pass as the rest, unless you want a dedicated pokemon database)
  - `DB_POKEMON_USER`
  - `DB_POKEMON_PASSWORD`

7. Should be ready to go

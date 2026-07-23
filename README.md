# Nymera Hazeground

Nymera is a gothic cyber-fantasy Discord bot foundation for Spellbound Hazeground. This project uses a free local JSON data file and implements slash-command registration, themed embeds, member and server information, daily/weekly/monthly rewards, economy actions, profiles, reputation, anti-spam XP leveling, prophecies, tickets, welcomes, and staff moderation tools.

## Setup

1. Install Node.js 20+.
2. Copy `.env.example` to `.env` and enter your Discord bot token and application ID. Never share or commit the token.
3. In the Discord Developer Portal, enable the **Message Content Intent** (needed for XP and link filtering) and **Server Members Intent** (needed for automatic welcomes) for Nymera.
4. Invite the bot with the `bot` and `applications.commands` scopes. Give it the permissions it needs, including **Moderate Members** if you will use `/timeout`.
5. Install dependencies and register commands:

```powershell
npm install
npm run deploy
npm start
```

Set `DISCORD_GUILD_ID` while developing to make slash commands appear quickly in a single server; omit it to deploy global commands.

## Project structure

- `src/commands` — add new slash command modules.
- `src/services` — reusable business logic and the local data store. Data is saved in `data/nymera-data.json`.
- `src/events` — Discord event handlers.

Extend this foundation with tickets, verification, invite tracking, games, giveaways, roles, and an AI provider. Keep any AI key in `.env`, validate permissions for every staff action, and add rate limits before enabling AI replies in public channels. For always-on hosting or multiple bot instances, migrate the local data store to a hosted database.

## Automatic activity

Use `/configure activity` to select the channel where Nymera posts a daily prophecy, a daily conversation question, and occasional treasure-event prompts. Use `/configure welcome` and `/configure goodbye` for member arrival and departure messages. These features run only while the bot is online.

Use `/configure levels` to choose where level-up announcements appear. Use `/level-reward set` to award a role at a chosen level; Nymera must have **Manage Roles**, and its Discord role must be above every reward role.

Use `/configure dead-chat` to revive a selected quiet channel after 2–72 hours of inactivity. You may choose one opt-in role to ping; Nymera sends no more than one revival prompt per server each 24 hours.

## Added community systems

Use `/shop`, `/buy`, and `/inventory` for the local Spellmark shop, `/coinflip` and `/trivia` for quick reward games, `/verify setup` to post a role-verification button, `/giveaway create` to run button-entry giveaways, and `/invites` for invite attribution. Set `/configure logs` to receive delete/edit audit embeds.

`/ask`, `/chat`, and `/story` provide a local, in-character companion experience without an external AI service. For open-ended generative AI, add a provider key and strict per-channel rate limits before deploying it publicly.

## Optional OpenAI companion

Add `OPENAI_API_KEY` to `.env`, then run `npm install` again. Nymera will use the OpenAI Responses API for `/ask`, `/chat`, and `/story`; without a key, these commands keep using local responses. Requests are limited to one per member every 30 seconds and configured not to store API response state. Set `OPENAI_MODEL` if you want to choose a different compatible model.

## Railway deployment

1. Push this project to a private GitHub repository. Do not commit `.env` or `data/`.
2. In Railway, create a project from that repository. `railway.json` runs `npm start` and restarts Nymera after a failure.
3. Add `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, and optional `OPENAI_API_KEY` as Railway variables.
4. Add a Railway volume mounted at `/app/data`, then set `DATA_DIR=/app/data`. This preserves economy, configuration, and giveaway data between deployments.
5. Redeploy. Run `npm run deploy` locally whenever slash commands change.

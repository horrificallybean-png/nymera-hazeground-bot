# Nymera Hazeground â€” Automatic Games Edition

The complete Nymera Discord bot with embedded SQLite and rotating automatic community games. It does not require Docker, PostgreSQL, a dashboard, or any database server.

## Requirements

- Windows 10 or 11
- Node.js 20 or newer with npm
- A Discord bot application
- Optional OpenAI API key for `/ask` and mention replies

## Included

- 97 modular slash commands
- Immediate conversation-starter testing and scheduling diagnostics
- Matching bundled gothic artwork for automatic games and scheduled magic posts
- True attachment-backed Discord image embeds for game and magic artwork
- Branded welcome embed with bundled Spellbound Hazeground artwork
- Detailed automatic-activity diagnostics for active sessions, channels, and Discord permissions
- Proactive AI conversation starters with configurable timing and repeat avoidance
- Automatic community host with 24 rotating trivia, quiz, poll, word, encounter, treasure, counting, reaction, and giveaway activities
- Built-in `/auto-games ai-test` diagnostics for AI-generated activities
- AI-generated polls, word games, riddles, encounters, treasure hunts, reaction races, counting themes, Hangman, and flash giveaways
- Configurable AI conversation channel with natural, rate-limited participation
- Role-pinging scheduled magic lore with declarative, non-question content
- Persistent trivia history that prevents recent question repeats
- 24 built-in automatic-game rounds plus AI-generated variations
- Personal and ritual reminders with automatic delivery
- Daily and free-form reflective oracle cards
- Zodiac profiles and symbolic compatibility prompts
- Detailed member and server statistics
- Automatic daily SQLite backups with seven-copy retention
- Seasonal Halloween rewards and full-moon gatherings
- Dead by Daylight build suggestions, daily challenges, and timed trivia
- Persistent event participation and reward tracking
- Prestige progression with preserved collections and escalating rewards
- Daily and weekly game, message, and crafting quests
- Weekly server-wide coven challenges with contribution rewards
- One-time referral codes with anti-abuse checks
- Expanded achievement collection
- Upgradeable Spellmark bank with capacity tiers and daily interest
- Equipable profile titles, badges, and backgrounds
- Blackjack, High-Low, and haunted scratch-card games
- AI `/ask` and mention replies
- Moderation, automod, warnings, welcome, autorole, and logging
- Spellmarks, banking, rewards, XP, levels, shop, inventory, quests, and achievements
- Coinflip, Bone Dice, Haunted Slots, Horror Trivia, and Haunted Hangman
- Automatic rotation of Horror Trivia, Dead by Daylight Trivia, Herb Lore, Hexed Word, Ghost Count, and Moon Trivia
- Tarot, daily draws, moon phases, planetary-hour symbolism, herbs, and grimoire
- Tickets, reaction roles, giveaways, starboard, and scheduled posts
- Embedded SQLite database stored locally in `prisma/nymera.db`

## 1. Create the Discord application

1. Visit <https://discord.com/developers/applications>.
2. Create an application and add a bot.
3. Copy the bot token and Application ID.
4. Enable **Server Members Intent** and **Message Content Intent**.
5. Install the bot in your server with the `bot` and `applications.commands` scopes.
6. During initial testing, grant the permissions required by the features you enable.

Never share or commit `.env`.

## 2. Install Node.js

Install the current Node.js LTS release from <https://nodejs.org/en/download>.

Open a new Command Prompt and verify:

```bat
node --version
npm --version
```

## 3. Run the setup helper

Extract the project, then double-click:

```text
setup-nymera.cmd
```

On its first run, it creates `.env` and opens it in Notepad. Enter:

```dotenv
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
DISCORD_GUILD_ID=your_test_server_id

OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini

LOG_LEVEL=info
DEFAULT_TIMEZONE=America/Denver
```

Save `.env` and run `setup-nymera.cmd` again. It will:

1. Install Node.js dependencies.
2. Generate the Prisma database client.
3. Create `prisma/nymera.db`.
4. Register Discord commands.
5. Build the bot.

## 4. Start Nymera

Double-click:

```text
start-nymera.cmd
```

Keep the window open. Closing it stops Nymera.

The equivalent Command Prompt commands are:

```bat
npm install
npm run prisma:setup
npm run register
npm run build
npm start
```

## First Discord configuration

Run `/setup` as a server manager. Configure the welcome, goodbye, log, scheduled-post, ticket, and starboard locations plus the autorole and protection settings.

Nymera's Discord role must be above any member, autorole, or reaction role it needs to manage.

## Automatic games

To host games every 90 minutes in your **whispers general chat** channel, run:

```text
/auto-games setup
```

Select:

- `channel`: whispers general chat
- `minutes`: `90`

Nymera waits 90 minutes before the first scheduled game. Test immediately with:

```text
/auto-games start-now
```

Check configuration:

```text
/auto-games status
```

Stop automatic games:

```text
/auto-games disable
```

The automatic rotation includes six game types. Each round remains open for 60 seconds, lets each member answer once, and awards 100 Spellmarks for a correct answer. Configuration and timing persist in SQLite, so restarting Nymera does not erase the schedule.

## Database

SQLite runs inside the bot process and stores data in:

```text
prisma\nymera.db
```

No database password, service, port, or separate program is needed.

To inspect the database:

```bat
npx prisma studio
```

Stop the bot before copying or restoring the database file.

## Backups

To back up everything:

1. Stop Nymera.
2. Copy `prisma\nymera.db`.
3. Rename the copy with the date, such as `nymera-2026-07-25.db`.
4. Store a second copy on another drive or trusted backup service.

To restore a backup, stop Nymera and replace `prisma\nymera.db` with the saved copy.

## Railway hosting (no Docker)

1. Create a private GitHub repository and upload the project. Do not upload `.env`,
   `node_modules`, `dist`, or `prisma/nymera.db`.
2. In Railway, create a project with **Deploy from GitHub repo** and select the repository.
3. Add a volume to the Nymera service and set its mount path to:

```text
/app/prisma
```

4. Add these Railway service variables:

```dotenv
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
DISCORD_GUILD_ID=your_server_id
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
LOG_LEVEL=info
DEFAULT_TIMEZONE=America/Denver
NODE_ENV=production
```

5. Deploy. The included `railway.json` builds the TypeScript project, prepares SQLite
   on the mounted volume, starts Nymera, and restarts it automatically if it exits.

Do not enable Railway Serverless for this service. A Discord bot must remain running
to receive events and scheduled tasks. The first hosted deployment starts with a new
SQLite database unless you separately migrate the local database.

## Updating

Preserve `.env` and `prisma\nymera.db`, replace the other project files, then run:

```bat
npm install
npm run prisma:setup
npm run register
npm run build
```

## AI privacy

If `OPENAI_API_KEY` is blank, the rest of the bot works and AI commands report that AI is disabled. When enabled, the user's prompt and up to eight recent AI conversation entries from that channel are sent to the configured OpenAI model and stored in SQLite.

## Troubleshooting

If `node` or `npm` is not recognized, install Node.js and open a new Command Prompt.

If Discord commands do not appear, confirm `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, and the `applications.commands` installation scope, then run:

```bat
npm run register
```

If startup fails, run:

```bat
npm start
```

Review the displayed error without posting tokens, API keys, or other secrets.


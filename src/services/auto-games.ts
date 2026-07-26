import { randomBytes } from "node:crypto";
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
  type Client, type Message, type TextChannel
} from "discord.js";
import { prisma } from "../database.js";
import { logger } from "../logger.js";
import { generateAutoGameRound } from "./ai.js";
import { secureInt } from "./games.js";

type ChoiceActivity = {
  type: "choice";
  game: string;
  title: string;
  question: string;
  choices: readonly string[];
  answer: number;
};
type TextActivity = {
  type: "text";
  game: string;
  title: string;
  question: string;
  answers: readonly string[];
};
type PollActivity = {
  type: "poll";
  game: string;
  title: string;
  question: string;
  choices: readonly string[];
};
type SimpleActivity = {
  type: "race" | "treasure" | "giveaway" | "counting" | "wordchain";
  game: string;
  title: string;
  question: string;
};
type Activity = ChoiceActivity | TextActivity | PollActivity | SimpleActivity;

const activeGuilds = new Set<string>();

const activities: readonly Activity[] = [
  { type: "choice", game: "auto_horror", title: "💀 Horror Trivia", question: "Who wrote Frankenstein?", choices: ["Mary Shelley", "Bram Stoker", "Edgar Allan Poe", "Shirley Jackson"], answer: 0 },
  { type: "choice", game: "auto_dbd", title: "🩸 Dead by Daylight Quiz", question: "How many Survivors normally enter a standard trial?", choices: ["Three", "Four", "Five", "Six"], answer: 1 },
  { type: "choice", game: "auto_herb", title: "🌿 Herb Lore Quiz", question: "Which herb is traditionally associated with remembrance?", choices: ["Rosemary", "Mint", "Basil", "Dill"], answer: 0 },
  { type: "choice", game: "auto_ghost", title: "👻 Ghost Count", question: "Four candles flicker. One goes dark. How many remain lit?", choices: ["One", "Two", "Three", "Four"], answer: 2 },
  { type: "choice", game: "auto_moon", title: "🌙 Moon Trivia", question: "Which phase follows the new moon?", choices: ["Waning crescent", "Waxing crescent", "Full moon", "Last quarter"], answer: 1 },
  { type: "text", game: "auto_hexed", title: "🔤 Hexed Words", question: "The mist stole the vowels. Restore this word: **GRMRE**", answers: ["grimoire"] },
  { type: "text", game: "auto_unscramble", title: "🧩 Unscramble", question: "Unscramble this enchanted word: **LDUARCON**", answers: ["cauldron"] },
  { type: "text", game: "auto_emoji", title: "🎭 Emoji Guess", question: "Name the magical object: **🔮✨**", answers: ["crystal ball", "crystalball"] },
  { type: "text", game: "auto_riddle", title: "🕯️ Riddle in the Dark", question: "I grow shorter as I grow older, and I shine while I disappear. What am I?", answers: ["candle", "a candle"] },
  { type: "text", game: "auto_number", title: "🔢 Number Rush", question: "First correct answer wins: **13 + 8 × 2 = ?**", answers: ["29"] },
  { type: "text", game: "auto_hangman", title: "🦴 Haunted Hangman", question: "Guess the haunted word: **S _ E C T E R**", answers: ["specter", "spectre"] },
  { type: "poll", game: "auto_this_or_that", title: "⚖️ This or That", question: "Choose your path through the mist:", choices: ["Moonlit forest", "Haunted castle"] },
  { type: "poll", game: "auto_poll", title: "📊 Coven Poll", question: "Which community activity should Nymera host more often?", choices: ["Trivia", "Word games", "Giveaways", "Magic lore"] },
  { type: "race", game: "auto_reaction", title: "⚡ Fastest Reaction", question: "The sigil is glowing—be the first to claim it!" },
  { type: "race", game: "auto_encounter", title: "🐺 Random Encounter", question: "A shadow wolf emerges from the fog. Who will calm it first?" },
  { type: "treasure", game: "auto_treasure", title: "🗝️ Treasure Hunt", question: "One chest contains the Obsidian Key. Choose carefully." },
  { type: "giveaway", game: "auto_giveaway", title: "🎁 Flash Giveaway", question: "Enter before the portal closes. One member will win **500 Spellmarks**!" },
  { type: "counting", game: "auto_counting", title: "🔢 Coven Counting", question: "Count together from **1 to 10**. One number per message; the same member cannot go twice in a row." },
  { type: "wordchain", game: "auto_last_letter", title: "🔠 Last Letter", question: "Start with **moon**. Each new word must begin with the last letter of the previous word." },
  { type: "wordchain", game: "auto_wordchain", title: "⛓️ Word Chain", question: "Build a chain of 10 words beginning with **raven**. Use the final letter to begin the next word." },
  { type: "choice", game: "auto_horror_2", title: "💀 Horror Trivia", question: "Who wrote the novel Dracula?", choices: ["Bram Stoker", "Mary Shelley", "Oscar Wilde", "H. G. Wells"], answer: 0 },
  { type: "choice", game: "auto_dbd_2", title: "🩸 Dead by Daylight Quiz", question: "Which Survivor item mainly helps repair generators?", choices: ["Med-Kit", "Toolbox", "Map", "Key"], answer: 1 },
  { type: "text", game: "auto_unscramble_2", title: "🧩 Unscramble", question: "Unscramble: **EPTSCRE**", answers: ["specter", "spectre"] },
  { type: "text", game: "auto_riddle_2", title: "🕸️ Riddle", question: "The more you take, the more you leave behind. What are they?", answers: ["footsteps", "steps"] }
];

async function reward(guildId: string, userId: string, amount: number, game: string) {
  await prisma.$transaction([
    prisma.economyAccount.upsert({
      where: { guildId_userId: { guildId, userId } },
      update: { wallet: { increment: amount } },
      create: { guildId, userId, wallet: amount }
    }),
    prisma.economyTransaction.create({
      data: { guildId, userId, type: `auto_${game}`, amount, note: "Automatic activity reward" }
    })
  ]);
}

const prefix = (roleId: string | null, title: string) =>
  `${roleId ? `<@&${roleId}>\n\n` : ""}## ${title}`;

async function hostChoice(channel: TextChannel, activity: ChoiceActivity, config: {
  guildId: string; pingRoleId: string | null; answerSeconds: number; intervalMinutes: number;
}) {
  const recent = await prisma.autoGameHistory.findMany({
    where: { guildId: config.guildId },
    orderBy: { createdAt: "desc" },
    take: 20
  });
  const generated = await generateAutoGameRound(activity.game, activity, recent.map(entry => entry.question));
  const sessionId = randomBytes(5).toString("hex");
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(generated.choices.map((choice, index) =>
    new ButtonBuilder().setCustomId(`autogame:${sessionId}:${index}`).setLabel(`${index + 1}. ${choice}`).setStyle(ButtonStyle.Secondary)
  ));
  const message = await channel.send({
    content: `${prefix(config.pingRoleId, generated.title)}\n${generated.question}\n\nChoose within **${Math.ceil(config.answerSeconds / 60)} minute(s)**. Correct answers earn **100 Spellmarks**.`,
    components: [row],
    allowedMentions: { roles: config.pingRoleId ? [config.pingRoleId] : [] }
  });
  const answered = new Set<string>();
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: config.answerSeconds * 1000 });
  collector.on("collect", async interaction => {
    if (!interaction.customId.startsWith(`autogame:${sessionId}:`)) return;
    if (answered.has(interaction.user.id)) return void await interaction.reply({ content: "You already answered.", ephemeral: true });
    answered.add(interaction.user.id);
    const won = Number(interaction.customId.split(":")[2]) === generated.answer;
    try {
      if (won) await reward(config.guildId, interaction.user.id, 100, activity.game);
      await interaction.reply({ content: won ? "Correct! You earned **100 Spellmarks**." : "That answer was lost in the mist.", ephemeral: true });
    } catch (error) {
      logger.error({ error }, "Automatic choice reward failed");
      answered.delete(interaction.user.id);
      await interaction.reply({ content: "The mist disrupted that answer. Try again.", ephemeral: true }).catch(() => undefined);
    }
  });
  collector.on("end", () => {
    const disabled = new ActionRowBuilder<ButtonBuilder>().addComponents(generated.choices.map((choice, index) =>
      new ButtonBuilder().setCustomId(`ended:${sessionId}:${index}`).setLabel(`${index + 1}. ${choice}`)
        .setStyle(index === generated.answer ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(true)
    ));
    void message.edit({
      content: `## ${generated.title}\n${generated.question}\n\nThe answer was **${generated.choices[generated.answer]}**. Next activity in ${config.intervalMinutes} minutes.`,
      components: [disabled]
    }).catch(() => undefined);
  });
  return generated.question;
}

async function hostText(channel: TextChannel, activity: TextActivity, guildId: string, roleId: string | null, seconds: number) {
  const message = await channel.send({
    content: `${prefix(roleId, activity.title)}\n${activity.question}\n\nThe first correct message within **${Math.ceil(seconds / 60)} minute(s)** wins **150 Spellmarks**.`,
    allowedMentions: { roles: roleId ? [roleId] : [] }
  });
  const collector = channel.createMessageCollector({
    time: seconds * 1000,
    filter: candidate => !candidate.author.bot && candidate.createdTimestamp > message.createdTimestamp
  });
  collector.on("collect", candidate => {
    const guess = candidate.content.trim().toLowerCase().replaceAll(/[.!?]/g, "");
    if (activity.answers.some(answer => answer.toLowerCase() === guess)) {
      void reward(guildId, candidate.author.id, 150, activity.game)
        .then(() => channel.send(`✨ ${candidate.author} solved it first and earned **150 Spellmarks**!`))
        .catch(error => logger.error({ error }, "Automatic text-game reward failed"));
      collector.stop("winner");
    }
  });
  collector.on("end", (_collected, reason) => {
    if (reason !== "winner") void channel.send(`Time faded away. The answer was **${activity.answers[0]}**.`);
  });
}

async function hostPoll(channel: TextChannel, activity: PollActivity, roleId: string | null, seconds: number) {
  const id = randomBytes(5).toString("hex");
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(activity.choices.map((choice, index) =>
    new ButtonBuilder().setCustomId(`poll:${id}:${index}`).setLabel(choice).setStyle(ButtonStyle.Primary)
  ));
  const message = await channel.send({
    content: `${prefix(roleId, activity.title)}\n${activity.question}`,
    components: [row],
    allowedMentions: { roles: roleId ? [roleId] : [] }
  });
  const votes = new Map<string, number>();
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: seconds * 1000 });
  collector.on("collect", interaction => {
    votes.set(interaction.user.id, Number(interaction.customId.split(":")[2]));
    void interaction.reply({ content: "Your vote was recorded. You may change it while the poll is open.", ephemeral: true });
  });
  collector.on("end", () => {
    const counts = activity.choices.map((_, index) => [...votes.values()].filter(vote => vote === index).length);
    const results = activity.choices.map((choice, index) => `**${choice}:** ${counts[index]} vote(s)`).join("\n");
    void message.edit({ content: `## ${activity.title}\n${activity.question}\n\n${results}`, components: [] });
  });
}

async function hostRace(channel: TextChannel, activity: SimpleActivity, guildId: string, roleId: string | null, seconds: number) {
  const id = randomBytes(5).toString("hex");
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`race:${id}`).setLabel(activity.game === "auto_encounter" ? "Calm the wolf" : "Claim the sigil").setStyle(ButtonStyle.Success)
  );
  const message = await channel.send({
    content: `${prefix(roleId, activity.title)}\n${activity.question}`,
    components: [row],
    allowedMentions: { roles: roleId ? [roleId] : [] }
  });
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: seconds * 1000, max: 1 });
  collector.on("collect", interaction => {
    void interaction.deferUpdate();
    void reward(guildId, interaction.user.id, 200, activity.game)
      .then(() => message.edit({ content: `## ${activity.title}\n${interaction.user} reacted first and earned **200 Spellmarks**!`, components: [] }))
      .catch(error => logger.error({ error }, "Automatic reaction reward failed"));
  });
  collector.on("end", collected => {
    if (!collected.size) void message.edit({ content: `## ${activity.title}\nThe encounter vanished without a winner.`, components: [] });
  });
}

async function hostTreasure(channel: TextChannel, activity: SimpleActivity, guildId: string, roleId: string | null, seconds: number) {
  const id = randomBytes(5).toString("hex");
  const winningChest = secureInt(0, 2);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents([0, 1, 2].map(index =>
    new ButtonBuilder().setCustomId(`chest:${id}:${index}`).setLabel(`Chest ${index + 1}`).setStyle(ButtonStyle.Secondary)
  ));
  const message = await channel.send({
    content: `${prefix(roleId, activity.title)}\n${activity.question}`,
    components: [row],
    allowedMentions: { roles: roleId ? [roleId] : [] }
  });
  const tried = new Set<string>();
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: seconds * 1000 });
  collector.on("collect", interaction => {
    if (tried.has(interaction.user.id)) return void interaction.reply({ content: "You already chose a chest.", ephemeral: true });
    tried.add(interaction.user.id);
    const won = Number(interaction.customId.split(":")[2]) === winningChest;
    if (!won) return void interaction.reply({ content: "Only dust waited inside.", ephemeral: true });
    void interaction.deferUpdate();
    void reward(guildId, interaction.user.id, 300, activity.game)
      .then(() => message.edit({ content: `## ${activity.title}\n${interaction.user} found the Obsidian Key and earned **300 Spellmarks**!`, components: [] }))
      .catch(error => logger.error({ error }, "Treasure reward failed"));
    collector.stop("winner");
  });
  collector.on("end", (_collected, reason) => {
    if (reason !== "winner") void message.edit({ content: `## ${activity.title}\nThe treasure returned to the mist.`, components: [] });
  });
}

async function hostGiveaway(channel: TextChannel, activity: SimpleActivity, guildId: string, roleId: string | null, seconds: number) {
  const id = randomBytes(5).toString("hex");
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`flash:${id}`).setLabel("Enter giveaway").setStyle(ButtonStyle.Primary)
  );
  const message = await channel.send({
    content: `${prefix(roleId, activity.title)}\n${activity.question}`,
    components: [row],
    allowedMentions: { roles: roleId ? [roleId] : [] }
  });
  const entrants = new Set<string>();
  const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: seconds * 1000 });
  collector.on("collect", interaction => {
    entrants.add(interaction.user.id);
    void interaction.reply({ content: "You entered the flash giveaway!", ephemeral: true });
  });
  collector.on("end", () => {
    if (!entrants.size) return void message.edit({ content: "## 🎁 Flash Giveaway\nNo one entered before the portal closed.", components: [] });
    const winner = [...entrants][secureInt(0, entrants.size - 1)]!;
    void reward(guildId, winner, 500, activity.game)
      .then(() => message.edit({ content: `## 🎁 Flash Giveaway\n<@${winner}> won **500 Spellmarks** from ${entrants.size} entrant(s)!`, components: [] }))
      .catch(error => logger.error({ error }, "Flash giveaway reward failed"));
  });
}

async function hostCounting(channel: TextChannel, activity: SimpleActivity, guildId: string, roleId: string | null, seconds: number) {
  const start = await channel.send({
    content: `${prefix(roleId, activity.title)}\n${activity.question}`,
    allowedMentions: { roles: roleId ? [roleId] : [] }
  });
  let next = 1;
  let lastUser = "";
  const collector = channel.createMessageCollector({
    time: seconds * 1000,
    filter: message => !message.author.bot && message.createdTimestamp > start.createdTimestamp
  });
  collector.on("collect", message => {
    if (message.author.id === lastUser || message.content.trim() !== String(next)) return;
    lastUser = message.author.id;
    next++;
    if (next === 11) {
      void reward(guildId, message.author.id, 200, activity.game)
        .then(() => channel.send(`🔟 ${message.author} completed the count and earned **200 Spellmarks**!`))
        .catch(error => logger.error({ error }, "Counting reward failed"));
      collector.stop("complete");
    }
  });
  collector.on("end", (_collected, reason) => {
    if (reason !== "complete") void channel.send(`The count reached **${next - 1}** before the ritual ended.`);
  });
}

async function hostWordChain(channel: TextChannel, activity: SimpleActivity, guildId: string, roleId: string | null, seconds: number) {
  const startWord = activity.game === "auto_last_letter" ? "moon" : "raven";
  const start = await channel.send({
    content: `${prefix(roleId, activity.title)}\n${activity.question}`,
    allowedMentions: { roles: roleId ? [roleId] : [] }
  });
  let previous = startWord;
  let lastUser = "";
  let accepted = 0;
  const used = new Set([startWord]);
  const collector = channel.createMessageCollector({
    time: seconds * 1000,
    filter: message => !message.author.bot && message.createdTimestamp > start.createdTimestamp
  });
  collector.on("collect", (message: Message) => {
    const word = message.content.trim().toLowerCase();
    if (!/^[a-z]{2,20}$/.test(word) || used.has(word) || message.author.id === lastUser || word[0] !== previous.at(-1)) return;
    used.add(word);
    previous = word;
    lastUser = message.author.id;
    accepted++;
    if (accepted === 10) {
      void reward(guildId, message.author.id, 200, activity.game)
        .then(() => channel.send(`⛓️ ${message.author} completed the chain with **${word}** and earned **200 Spellmarks**!`))
        .catch(error => logger.error({ error }, "Word-chain reward failed"));
      collector.stop("complete");
    }
  });
  collector.on("end", (_collected, reason) => {
    if (reason !== "complete") void channel.send(`The chain ended after **${accepted}** accepted word(s). Last word: **${previous}**.`);
  });
}

export async function launchAutoGame(client: Client, guildId: string) {
  if (activeGuilds.has(guildId)) return false;
  const config = await prisma.autoGameConfig.findUnique({ where: { guildId } });
  if (!config?.enabled) return false;
  const fetched = await client.channels.fetch(config.channelId).catch(() => null);
  if (!fetched || !fetched.isTextBased() || !("send" in fetched) || !("createMessageCollector" in fetched)) return false;
  const channel = fetched as TextChannel;
  const activity = activities[config.nextGameIndex % activities.length]!;
  activeGuilds.add(guildId);
  try {
    await prisma.autoGameConfig.update({
      where: { guildId },
      data: { lastRunAt: new Date(), nextGameIndex: { increment: 1 } }
    });
    if (activity.type === "choice") {
      const question = await hostChoice(channel, activity, config);
      await prisma.autoGameHistory.create({ data: { guildId, game: activity.game, question } });
    } else if (activity.type === "text") {
      await hostText(channel, activity, guildId, config.pingRoleId, config.answerSeconds);
    } else if (activity.type === "poll") {
      await hostPoll(channel, activity, config.pingRoleId, config.answerSeconds);
    } else if (activity.type === "race") {
      await hostRace(channel, activity, guildId, config.pingRoleId, config.answerSeconds);
    } else if (activity.type === "treasure") {
      await hostTreasure(channel, activity, guildId, config.pingRoleId, config.answerSeconds);
    } else if (activity.type === "giveaway") {
      await hostGiveaway(channel, activity, guildId, config.pingRoleId, config.answerSeconds);
    } else if (activity.type === "counting") {
      await hostCounting(channel, activity, guildId, config.pingRoleId, config.answerSeconds);
    } else {
      await hostWordChain(channel, activity, guildId, config.pingRoleId, config.answerSeconds);
    }
    const oldHistory = await prisma.autoGameHistory.findMany({
      where: { guildId }, orderBy: { createdAt: "desc" }, skip: 50, select: { id: true }
    });
    if (oldHistory.length) await prisma.autoGameHistory.deleteMany({ where: { id: { in: oldHistory.map(entry => entry.id) } } });
    setTimeout(() => activeGuilds.delete(guildId), config.answerSeconds * 1000 + 1_000).unref();
    return true;
  } catch (error) {
    activeGuilds.delete(guildId);
    logger.error({ error, guildId, activity: activity.game }, "Automatic activity failed");
    return false;
  }
}

export function startAutoGameMonitor(client: Client) {
  const timer = setInterval(async () => {
    try {
      const configs = await prisma.autoGameConfig.findMany({ where: { enabled: true } });
      const now = Date.now();
      for (const config of configs) {
        const dueAt = (config.lastRunAt?.getTime() ?? config.createdAt.getTime()) + config.intervalMinutes * 60_000;
        if (now >= dueAt) await launchAutoGame(client, config.guildId);
      }
    } catch (error) {
      logger.error({ error }, "Auto-game monitor failed");
    }
  }, 30_000);
  timer.unref();
  logger.info({ activities: activities.length }, "Automatic activity host initialized");
}

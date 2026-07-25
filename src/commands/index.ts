import type { Command } from "../types.js";
import { aiCommands } from "./ai.js";
import { configurationCommands } from "./configuration.js";
import { moderationCommands } from "./moderation.js";
import { utilityCommands } from "./utility.js";
import { economyCommands } from "./economy.js";
import { gameCommands } from "./games.js";
import { magicCommands } from "./magic.js";
import { communityCommands } from "./community.js";
import { autoGameCommands } from "./auto-games.js";
import { levelCommands } from "./levels.js";

export const commands: Command[] = [
  ...utilityCommands,
  ...aiCommands,
  ...moderationCommands,
  ...configurationCommands,
  ...economyCommands,
  ...gameCommands,
  ...magicCommands,
  ...communityCommands,
  ...autoGameCommands
  , ...levelCommands
];

export const commandMap = new Map(commands.map(command => [command.data.name, command]));

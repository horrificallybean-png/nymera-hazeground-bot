import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { AttachmentBuilder } from "discord.js";
import { logger } from "../logger.js";

export function discordAsset(fileName: string) {
  const assetPath = resolve(process.cwd(), "assets", fileName);
  if (!existsSync(assetPath)) {
    logger.warn({ assetPath }, "Discord artwork asset was not found");
    return [];
  }
  return [new AttachmentBuilder(assetPath, { name: fileName })];
}

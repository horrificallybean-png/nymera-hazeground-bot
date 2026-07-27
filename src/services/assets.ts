import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { AttachmentBuilder, EmbedBuilder } from "discord.js";
import { logger } from "../logger.js";

export function discordAsset(fileName: string) {
  const assetPath = resolve(process.cwd(), "assets", fileName);
  if (!existsSync(assetPath)) {
    logger.warn({ assetPath }, "Discord artwork asset was not found");
    return [];
  }
  return [new AttachmentBuilder(assetPath, { name: fileName })];
}

export function discordArtwork(fileName: string) {
  const files = discordAsset(fileName);
  if (!files.length) return { files: [], embeds: [] };
  return {
    files,
    embeds: [new EmbedBuilder().setColor(0x7f2cc4).setImage(`attachment://${fileName}`)]
  };
}

import cron from "node-cron";
import type { Client } from "discord.js";
import { prisma } from "../database.js";
import { logger } from "../logger.js";
import { renderMagicTemplate } from "./magic.js";

export async function startScheduler(client: Client) {
  const posts = await prisma.scheduledPost.findMany({ where: { enabled: true } });
  for (const post of posts) {
    if (!cron.validate(post.cron)) {
      logger.warn({ postId: post.id }, "Skipping invalid scheduled post");
      continue;
    }
    cron.schedule(post.cron, async () => {
      const channel = await client.channels.fetch(post.channelId).catch(() => null);
      if (channel && "send" in channel) await channel.send(renderMagicTemplate(post.content)).catch((error: unknown) => logger.error({ error, postId: post.id }, "Scheduled post failed"));
    }, { timezone: post.timezone });
  }
  logger.info({ scheduledPosts: posts.length }, "Scheduler initialized");
}

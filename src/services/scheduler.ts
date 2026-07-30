import cron from "node-cron";
import type { Client } from "discord.js";
import { prisma } from "../database.js";
import { logger } from "../logger.js";
import { renderMagicTemplate } from "./magic.js";
import { generateDynamicScheduledContent } from "./ai.js";
import { discordArtwork } from "./assets.js";

const dailyRotations: Record<string, readonly string[]> = {
  "{{daily_morning}}": [
    "🌅 **Good Morning, Coven**\nWhat gentle intention would make today feel meaningful? Drink some water, take one steady breath, and begin at your own pace.",
    "☀️ **A New Day Emerges**\nName one thing you appreciate, one thing you need, and one small step you can take today. Quiet progress still counts.",
    "🌿 **Morning Grounding**\nRelax your shoulders and notice the room around you. What energy do you want to protect as you move through today?",
    "🕯️ **Morning Intention**\nYou do not need to solve the entire day at once. Choose one kind, realistic priority and let that be enough for now."
  ],
  "{{daily_midday}}": [
    "☀️ **Midday Check-In**\nHave you eaten, had water, and moved your body today? Name one small win from your morning.",
    "🌿 **Pause in the Daylight**\nUnclench your jaw and lower your shoulders. What can you simplify during the rest of your day?",
    "✨ **Halfway Through the Day**\nYour morning does not decide your whole day. What is one gentle reset you can make right now?",
    "🫖 **Coven Rest Stop**\nTake five quiet minutes if you can. Nourishment, rest, and boundaries are productive too."
  ],
  "{{daily_evening}}": [
    "🌆 **Evening Check-In**\nWhat went well today, what felt difficult, and what can safely wait until tomorrow?",
    "🕯️ **The Day Softens**\nRelease one expectation you no longer need to carry tonight. Small efforts still deserve recognition.",
    "🌿 **Evening Grounding**\nNotice one thing you handled with courage today. What kind of care would feel supportive tonight?",
    "🌙 **Dusk Reflection**\nYou made it through another day. Drink some water, find something comforting, and let your pace become slower."
  ],
  "{{daily_night}}": [
    "🌌 **Nightly Wind-Down**\nSet down what cannot be solved tonight. Name one thing you are proud of, then let yourself rest.",
    "🌙 **The Coven Grows Quiet**\nDim the noise where you can. Take a slow breath and choose one peaceful intention for tomorrow.",
    "🖤 **Rest Beneath the Moon**\nYou have done enough for today. Make your space comfortable and allow unfinished things to remain unfinished.",
    "✨ **Closing the Day**\nRelease one worry, remember one good moment, and offer yourself the same kindness you would give a friend."
  ],
  "{{daily_night_checkin}}": [
    "🌙 **Nighttime Check-In**\nHow are you arriving at the end of today? Share only what feels comfortable. Drink some water, soften your shoulders, and remember that peer support is not professional care.",
    "🕯️ **A Gentle Pause Before Rest**\nYou made it through the day. If you would like company, tell the coven whether you need encouragement, quiet conversation, or simply a listening ear. No explanation is required.",
    "🌿 **Evening Wellness Check**\nBefore the night grows quiet, consider food, water, regular medication, rest, and one small comfort. You deserve care without having to earn it.",
    "✨ **The Haze Settles for the Night**\nLeave a heart, an emoji, or a few words if you want to check in. There is no pressure to share. Reach out to someone you trust or a qualified professional when you need more support."
  ],
  "{{daily_wellness}}": [
    "🌿 How are you feeling today?\n🟢 Doing well • 🟡 Managing • 🟠 Struggling • 🔴 Could use support • 💜 Not ready to share\nYou never have to share more than feels comfortable.",
    "💜 **Gentle Check-In**\nWhat do you need most today: rest, encouragement, connection, quiet, or practical help? Be kind to yourself and others.",
    "🕯️ **A Moment for You**\nTake one slow breath. Have you had water, food, medication you normally take, and a little movement or rest today?",
    "🌙 **Coven Wellness Check**\nNo feeling makes you a burden. Share only what feels safe, and consider reaching out to someone you trust or a qualified professional when you need support."
  ]
};

function renderRotatingContent(content: string, rotation: number, date = new Date()) {
  let rendered = content;
  for (const [token, variants] of Object.entries(dailyRotations)) {
    if (rendered.includes(token)) rendered = rendered.replaceAll(token, variants[rotation % variants.length]!);
  }
  const customVariants = rendered.split("|||").map(value => value.trim()).filter(Boolean);
  if (customVariants.length > 1) rendered = customVariants[rotation % customVariants.length]!;
  return renderMagicTemplate(rendered, date, rotation);
}

type ScheduledTaskEntry = {
  task: ReturnType<typeof cron.schedule>;
  signature: string;
};

const activeTasks = new Map<number, ScheduledTaskEntry>();
let schedulerMonitorStarted = false;

async function deliverScheduledPost(client: Client, postId: number) {
  const post = await prisma.scheduledPost.findUnique({ where: { id: postId } });
  if (!post?.enabled) return { ok: false, reason: "The scheduled post is missing or disabled." };
  const channel = await client.channels.fetch(post.channelId).catch(() => null);
  if (!channel || !("send" in channel)) {
    return { ok: false, reason: `Nymera cannot access or post in channel ${post.channelId}.` };
  }
  const nextVariant = post.lastVariantIndex + 1;
  try {
    const fallback = renderRotatingContent(post.content, nextVariant);
    const kind = `scheduled_post:${post.id}`;
    const history = await prisma.generatedContentHistory.findMany({
      where: { guildId: post.guildId, kind },
      orderBy: { createdAt: "desc" },
      take: 12
    });
    const content = await generateDynamicScheduledContent(
      post.content,
      fallback,
      history.map(entry => entry.content)
    );
    const magicPost = /\{\{(?:daily_tarot|herb_lore|moon_phase|magic_six_daily_)\S*\}\}/.test(post.content);
    const mentionedRoles = [...content.matchAll(/<@&(\d+)>/g)].map(match => match[1]!);
    await channel.send({
      content,
      allowedMentions: { roles: mentionedRoles },
      ...(magicPost ? discordArtwork("magic-banner.png") : { files: [], embeds: [] })
    });
    await prisma.$transaction([
      prisma.scheduledPost.update({
        where: { id: post.id },
        data: { lastVariantIndex: nextVariant }
      }),
      prisma.generatedContentHistory.create({
        data: { guildId: post.guildId, kind, content }
      })
    ]);
    const expired = await prisma.generatedContentHistory.findMany({
      where: { guildId: post.guildId, kind },
      orderBy: { createdAt: "desc" },
      skip: 30,
      select: { id: true }
    });
    if (expired.length) {
      await prisma.generatedContentHistory.deleteMany({ where: { id: { in: expired.map(entry => entry.id) } } });
    }
    logger.info({ postId: post.id, channelId: post.channelId }, "Scheduled post delivered");
    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.error({ err: error, postId: post.id, channelId: post.channelId }, "Scheduled post failed");
    return { ok: false, reason };
  }
}

async function synchronizeScheduledTasks(client: Client) {
  const posts = await prisma.scheduledPost.findMany({ where: { enabled: true } });
  const currentIds = new Set(posts.map(post => post.id));
  for (const [postId, entry] of activeTasks) {
    if (!currentIds.has(postId)) {
      entry.task.stop();
      activeTasks.delete(postId);
    }
  }
  for (const post of posts) {
    if (!cron.validate(post.cron)) {
      logger.warn({ postId: post.id }, "Skipping invalid scheduled post");
      continue;
    }
    const signature = `${post.cron}|${post.timezone}|${post.channelId}|${post.updatedAt.toISOString()}`;
    const existing = activeTasks.get(post.id);
    if (existing?.signature === signature) continue;
    existing?.task.stop();
    try {
      const task = cron.schedule(post.cron, async () => {
        await deliverScheduledPost(client, post.id);
      }, { timezone: post.timezone });
      activeTasks.set(post.id, { task, signature });
    } catch (error) {
      logger.error({ err: error, postId: post.id, timezone: post.timezone }, "Could not activate scheduled post");
    }
  }
  return activeTasks.size;
}

export async function runScheduledPostNow(client: Client, guildId: string, postId: number) {
  const post = await prisma.scheduledPost.findFirst({ where: { id: postId, guildId } });
  if (!post) return { ok: false, reason: "That scheduled post was not found in this server." };
  return deliverScheduledPost(client, post.id);
}

export async function startScheduler(client: Client) {
  const count = await synchronizeScheduledTasks(client);
  logger.info({ scheduledPosts: count }, `Scheduler initialized with ${count} active posts`);
  if (schedulerMonitorStarted) return;
  schedulerMonitorStarted = true;
  setInterval(() => {
    void synchronizeScheduledTasks(client).catch(error => {
      logger.error({ err: error }, "Scheduled-post synchronization failed");
    });
  }, 60_000).unref();
}

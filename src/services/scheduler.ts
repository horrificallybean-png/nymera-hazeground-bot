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

export async function startScheduler(client: Client) {
  const posts = await prisma.scheduledPost.findMany({ where: { enabled: true } });
  for (const post of posts) {
    if (!cron.validate(post.cron)) {
      logger.warn({ postId: post.id }, "Skipping invalid scheduled post");
      continue;
    }
    cron.schedule(post.cron, async () => {
      const channel = await client.channels.fetch(post.channelId).catch(() => null);
      if (!channel || !("send" in channel)) return;
      const nextVariant = post.lastVariantIndex + 1;
      try {
        const fallback = renderRotatingContent(post.content, nextVariant);
        const content = await generateDynamicScheduledContent(post.content, fallback);
        const magicPost = /\{\{(?:daily_tarot|herb_lore|moon_phase)\}\}/.test(post.content);
        await channel.send({
          content,
          ...(magicPost ? discordArtwork("magic-banner.png") : { files: [], embeds: [] })
        });
        post.lastVariantIndex = nextVariant;
        await prisma.scheduledPost.update({
          where: { id: post.id },
          data: { lastVariantIndex: nextVariant }
        });
      } catch (error) {
        logger.error({ err: error, postId: post.id }, "Scheduled post failed");
      }
    }, { timezone: post.timezone });
  }
  logger.info({ scheduledPosts: posts.length }, "Scheduler initialized");
}

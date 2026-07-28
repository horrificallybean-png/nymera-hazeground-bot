import { EmbedBuilder, type Client } from "discord.js";
import { prisma } from "../database.js";
import { logger } from "../logger.js";

type FeedItem = {
  id: string;
  title: string;
  link: string;
  description: string;
  publishedAt?: Date;
  imageUrl?: string;
};

let monitor: NodeJS.Timeout | undefined;
let checking = false;

function decodeXml(value: string) {
  return value
    .replaceAll("<![CDATA[", "")
    .replaceAll("]]>", "")
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match?.[1] ? decodeXml(match[1]) : "";
}

function attribute(block: string, element: string, name: string) {
  const match = block.match(new RegExp(`<${element}\\b[^>]*\\b${name}=["']([^"']+)["'][^>]*>`, "i"));
  return match?.[1] ? decodeXml(match[1]) : "";
}

function parseDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseFeed(xml: string): FeedItem[] {
  const atomEntries = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map(match => match[1]!);
  if (atomEntries.length) {
    return atomEntries.map(entry => {
      const link = attribute(entry, "link", "href") || tag(entry, "link");
      const imageUrl = attribute(entry, "media:thumbnail", "url") || attribute(entry, "media:content", "url");
      return {
        id: tag(entry, "id") || link || tag(entry, "title"),
        title: tag(entry, "title") || "New social media post",
        link,
        description: tag(entry, "summary") || tag(entry, "content"),
        publishedAt: parseDate(tag(entry, "published") || tag(entry, "updated")),
        imageUrl: imageUrl || undefined
      };
    }).filter(item => item.id && item.link);
  }
  const rssItems = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(match => match[1]!);
  return rssItems.map(item => {
    const link = tag(item, "link");
    const imageUrl = attribute(item, "media:content", "url") ||
      attribute(item, "media:thumbnail", "url") ||
      attribute(item, "enclosure", "url");
    return {
      id: tag(item, "guid") || link || tag(item, "title"),
      title: tag(item, "title") || "New social media post",
      link,
      description: tag(item, "description") || tag(item, "content:encoded"),
      publishedAt: parseDate(tag(item, "pubDate") || tag(item, "dc:date")),
      imageUrl: imageUrl || undefined
    };
  }).filter(item => item.id && item.link);
}

export async function fetchSocialFeed(feedUrl: string) {
  const response = await fetch(feedUrl, {
    headers: { "User-Agent": "Nymera-Hazeground/13.1 (+Discord social feed monitor)" },
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}`);
  const xml = await response.text();
  if (xml.length > 2_000_000) throw new Error("Feed response was too large");
  const items = parseFeed(xml);
  if (!items.length) throw new Error("No RSS or Atom posts were found at that URL");
  return items;
}

function postEmbed(platform: string, item: FeedItem) {
  const embed = new EmbedBuilder()
    .setColor(0x9b73d1)
    .setTitle(`📱 New ${platform} Post`)
    .setURL(item.link)
    .setDescription((item.description || item.title).slice(0, 1_500))
    .addFields({ name: "View the post", value: `[Open the new post](${item.link})` })
    .setFooter({ text: "Spellbound Hazeground • Automatic Social Alert" })
    .setTimestamp(item.publishedAt ?? new Date());
  if (item.imageUrl?.startsWith("https://")) embed.setImage(item.imageUrl);
  return embed;
}

export async function checkSocialFeed(client: Client, feedId: number, force = false) {
  const feed = await prisma.socialFeed.findUnique({ where: { id: feedId } });
  if (!feed?.enabled) return { ok: false, reason: "That automatic feed is disabled." };
  const items = await fetchSocialFeed(feed.feedUrl);
  const newest = items[0]!;
  await prisma.socialFeed.update({ where: { id: feed.id }, data: { lastCheckedAt: new Date() } });
  if (!force && newest.id === feed.lastItemId) return { ok: true, announced: false };
  const channel = await client.channels.fetch(feed.channelId).catch(() => null);
  if (!channel || !("send" in channel)) throw new Error("Nymera cannot access the configured social-alert channel");
  const guild = client.guilds.cache.get(feed.guildId);
  const alertRole = guild?.roles.cache.find(role => role.name.toLowerCase() === "social media alerts");
  await channel.send({
    content: alertRole ? `<@&${alertRole.id}>` : undefined,
    embeds: [postEmbed(feed.platform, newest)],
    allowedMentions: { roles: alertRole ? [alertRole.id] : [] }
  });
  await prisma.socialFeed.update({
    where: { id: feed.id },
    data: { lastItemId: newest.id, lastCheckedAt: new Date() }
  });
  return { ok: true, announced: true };
}

async function checkAll(client: Client) {
  if (checking) return;
  checking = true;
  try {
    const feeds = await prisma.socialFeed.findMany({ where: { enabled: true } });
    for (const feed of feeds) {
      try {
        await checkSocialFeed(client, feed.id);
      } catch (error) {
        logger.error({ error, feedId: feed.id, guildId: feed.guildId }, "Automatic social-feed check failed");
      }
    }
  } finally {
    checking = false;
  }
}

export function startSocialFeedMonitor(client: Client) {
  if (monitor) clearInterval(monitor);
  void checkAll(client);
  monitor = setInterval(() => void checkAll(client), 300_000);
  monitor.unref();
  logger.info("Automatic social-feed monitor initialized");
}

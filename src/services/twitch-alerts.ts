import { EmbedBuilder, type Client } from "discord.js";
import { env } from "../config.js";
import { prisma } from "../database.js";
import { logger } from "../logger.js";

type TwitchTokenResponse = {
  access_token?: string;
  expires_in?: number;
  message?: string;
};

export type TwitchStream = {
  id: string;
  user_login: string;
  user_name: string;
  game_name: string;
  title: string;
  viewer_count: number;
  started_at: string;
  thumbnail_url: string;
  is_mature: boolean;
};

let cachedToken = "";
let tokenExpiresAt = 0;
let monitor: NodeJS.Timeout | undefined;
let checking = false;

export const twitchConfigured = Boolean(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET);

async function appAccessToken() {
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) {
    throw new Error("TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET are not configured");
  }
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;
  const parameters = new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID,
    client_secret: env.TWITCH_CLIENT_SECRET,
    grant_type: "client_credentials"
  });
  const response = await fetch(`https://id.twitch.tv/oauth2/token?${parameters}`, { method: "POST" });
  const payload = await response.json() as TwitchTokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.message || `Twitch authentication failed with HTTP ${response.status}`);
  }
  cachedToken = payload.access_token;
  tokenExpiresAt = Date.now() + (payload.expires_in ?? 3_600) * 1_000;
  return cachedToken;
}

export async function getTwitchStream(login: string) {
  if (!env.TWITCH_CLIENT_ID) throw new Error("TWITCH_CLIENT_ID is not configured");
  const token = await appAccessToken();
  const response = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(login)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Client-Id": env.TWITCH_CLIENT_ID
    }
  });
  if (response.status === 401) {
    cachedToken = "";
    tokenExpiresAt = 0;
  }
  const payload = await response.json() as { data?: TwitchStream[]; message?: string };
  if (!response.ok) throw new Error(payload.message || `Twitch API returned HTTP ${response.status}`);
  return payload.data?.[0] ?? null;
}

function liveEmbed(stream: TwitchStream) {
  const streamUrl = `https://www.twitch.tv/${stream.user_login}`;
  const thumbnail = stream.thumbnail_url
    .replace("{width}", "1280")
    .replace("{height}", "720") + `?v=${Date.now()}`;
  return new EmbedBuilder()
    .setColor(0x9146ff)
    .setTitle(`🔴 ${stream.user_name} is live on Twitch!`)
    .setURL(streamUrl)
    .setDescription(stream.title || "The stream has begun beyond the haze.")
    .addFields(
      { name: "Playing", value: stream.game_name || "No category", inline: true },
      { name: "Viewers", value: stream.viewer_count.toLocaleString(), inline: true },
      { name: "Watch now", value: `[Open the live stream](${streamUrl})` }
    )
    .setImage(thumbnail)
    .setFooter({ text: stream.is_mature ? "Mature-content stream • Check Twitch for details" : "Spellbound Hazeground • Twitch Live Alert" })
    .setTimestamp(new Date(stream.started_at));
}

export async function checkTwitchAlert(client: Client, guildId: string, force = false) {
  const config = await prisma.twitchAlertConfig.findUnique({ where: { guildId } });
  if (!config?.enabled) return { ok: false, reason: "Twitch live alerts are not enabled." };
  const stream = await getTwitchStream(config.twitchLogin);
  await prisma.twitchAlertConfig.update({
    where: { guildId },
    data: { lastCheckedAt: new Date() }
  });
  if (!stream) return { ok: true, live: false, reason: `${config.twitchLogin} is currently offline.` };
  if (!force && config.lastStreamId === stream.id) return { ok: true, live: true, announced: false };
  const channel = await client.channels.fetch(config.channelId).catch(() => null);
  if (!channel || !("send" in channel)) throw new Error("Nymera cannot access the configured Twitch-alert channel");
  const guild = client.guilds.cache.get(guildId);
  const alertRole = guild?.roles.cache.find(role => role.name.toLowerCase() === "social media alerts");
  await channel.send({
    content: alertRole ? `<@&${alertRole.id}>` : undefined,
    embeds: [liveEmbed(stream)],
    allowedMentions: { roles: alertRole ? [alertRole.id] : [] }
  });
  await prisma.twitchAlertConfig.update({
    where: { guildId },
    data: { lastStreamId: stream.id, lastCheckedAt: new Date() }
  });
  return { ok: true, live: true, announced: true };
}

async function checkAll(client: Client) {
  if (checking || !twitchConfigured) return;
  checking = true;
  try {
    const configs = await prisma.twitchAlertConfig.findMany({ where: { enabled: true } });
    for (const config of configs) {
      try {
        await checkTwitchAlert(client, config.guildId);
      } catch (error) {
        logger.error({ error, guildId: config.guildId, twitchLogin: config.twitchLogin }, "Twitch live-alert check failed");
      }
    }
  } finally {
    checking = false;
  }
}

export function startTwitchAlertMonitor(client: Client) {
  if (monitor) clearInterval(monitor);
  if (!twitchConfigured) {
    logger.info("Twitch live-alert monitor disabled because Twitch credentials are not configured");
    return;
  }
  void checkAll(client);
  monitor = setInterval(() => void checkAll(client), 120_000);
  monitor.unref();
  logger.info("Twitch live-alert monitor initialized");
}

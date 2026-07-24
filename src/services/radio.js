const path = require('node:path');
const ffmpegPath = require('ffmpeg-static');

if (ffmpegPath) process.env.PATH = `${path.dirname(ffmpegPath)}${path.delimiter}${process.env.PATH || ''}`;

const {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel
} = require('@discordjs/voice');

const DEFAULT_STREAM = 'https://radio.loficafe.net/listen/chilling/radio.mp3';
const sessions = new Map();

async function startRadio(guild, channel, streamUrl = process.env.LOFI_STREAM_URL || DEFAULT_STREAM) {
  stopRadio(guild.id);
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true
  });
  await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

  const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
  player.on('error', error => console.error(`Radio playback failed in ${guild.name}:`, error));
  player.on(AudioPlayerStatus.Idle, () => console.warn(`Haunted Radio stopped in ${guild.name}.`));
  connection.on('error', error => console.error(`Radio connection failed in ${guild.name}:`, error));
  connection.subscribe(player);
  player.play(createAudioResource(streamUrl));
  sessions.set(guild.id, { connection, player, channelId: channel.id, streamUrl });
  return streamUrl;
}

function stopRadio(guildId) {
  const session = sessions.get(guildId);
  if (!session) return false;
  session.player.stop(true);
  session.connection.destroy();
  sessions.delete(guildId);
  return true;
}

function getRadio(guildId) {
  return sessions.get(guildId) || null;
}

module.exports = { startRadio, stopRadio, getRadio, DEFAULT_STREAM };

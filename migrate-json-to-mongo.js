require('dotenv').config();
const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Guild = require('../src/models/Guild');
const Giveaway = require('../src/models/Giveaway');
const Record = require('../src/models/Record');

async function run() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  const file = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'nymera-data.json');
  const data = JSON.parse(await fs.readFile(file, 'utf8'));
  await mongoose.connect(process.env.MONGODB_URI);
  for (const user of Object.values(data.users || {})) await User.updateOne({ guildId: user.guildId, userId: user.userId }, { $set: user }, { upsert: true });
  for (const [guildId, settings] of Object.entries(data.guilds || {})) await Guild.updateOne({ guildId }, { $set: { settings, shop: settings.shop || [], levelRewards: settings.levelRewards || [] } }, { upsert: true });
  for (const giveaway of Object.values(data.giveaways || {})) await Giveaway.updateOne({ _id: giveaway.id }, { $set: giveaway }, { upsert: true }).catch(() => {});
  for (const record of [...(data.transactions || []), ...(data.audit || [])]) await Record.create({ guildId: record.guildId, type: record.type || 'legacy', data: record });
  console.log('Nymera JSON data migrated to MongoDB.');
  await mongoose.disconnect();
}
run().catch(error => { console.error(error); process.exit(1); });

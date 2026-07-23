const mongoose = require('mongoose');
const config = require('./config');

async function connectDatabase() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10_000 });
  console.log('Nymera’s archives are connected to MongoDB.');
}

module.exports = { connectDatabase };

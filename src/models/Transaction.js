const { Schema, model } = require('mongoose');

const transactionSchema = new Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  reason: { type: String, required: true, maxlength: 200 }
}, { timestamps: true });

module.exports = model('Transaction', transactionSchema);

const Giveaway = require('../models/Giveaway');
async function enter(giveawayId, userId) { return Giveaway.findOneAndUpdate({ _id: giveawayId, ended: false }, { $addToSet: { entries: userId } }, { new: true }); }
async function due() { return Giveaway.find({ ended: false, endsAt: { $lte: new Date() } }); }
module.exports = { enter, due };

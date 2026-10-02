const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
    cacheKey: { type: String, required: true, unique: true },
    match: {
        id: { type: Number, required: true },
        opponent: { type: String, required: true },
        opponentCrest: { type: String, default: '' },
        homeTeam: { type: String, required: true },
        awayTeam: { type: String, required: true },
        venue: { type: String, required: true },
        isHome: { type: Boolean, required: true },
        competition: { type: String, required: true },
        competitionEmblem: { type: String, default: '' },
        kickoff: { type: Date, required: true },
    },
    fetchedAt: { type: Date, required: true, default: Date.now },
}, { versionKey: false });

module.exports = mongoose.model('Match', matchSchema);
require('dotenv').config();

const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const mongoose = require('mongoose');
const Match = require('./models/Match');

const app = express();
const PORT = process.env.PORT || 5000;
const CACHE_KEY = 'manchester-united-next-match';
const CACHE_TTL_MS = 60 * 60 * 1000;
const API_URL = 'https://api.football-data.org/v4/teams/66/matches?status=SCHEDULED&limit=1';
const allowedOrigins = [
    process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
    'https://united-match-checker.vercel.app',
];
let pendingFixtureRequest;

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: allowedOrigins, methods: ['GET'] }));
app.use(express.json({ limit: '10kb' }));

app.get('/api/match/next', async (req, res) => {
    try {
        const cached = await Match.findOne({ cacheKey: CACHE_KEY }).lean();
        if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
            return res.json(cached.match);
        }

        if (!process.env.API_KEY) {
            return res.status(503).json({ error: 'Match data is not configured on the server.' });
        }

        if (!pendingFixtureRequest) pendingFixtureRequest = fetchNextFixture();
        const match = await pendingFixtureRequest;
        await Match.findOneAndUpdate(
            { cacheKey: CACHE_KEY },
            { $set: { match, fetchedAt: new Date() } },
            { upsert: true, new: true, runValidators: true },
        );
        return res.json(match);
    } catch (error) {
        console.error('Unable to load the next Manchester United fixture:', error.message);
        return res.status(error.status || 502).json({
            error: error.status ? error.message : 'Match data is temporarily unavailable.',
        });
    } finally {
        pendingFixtureRequest = undefined;
    }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

async function fetchNextFixture() {
    const response = await fetch(API_URL, {
        headers: { 'X-Auth-Token': process.env.API_KEY },
        signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
        throw new Error(`Football data API responded with ${response.status}.`);
    }

    const payload = await response.json();
    const fixture = payload.matches?.[0];
    if (!fixture) {
        const error = new Error('No upcoming Manchester United fixture was found.');
        error.status = 404;
        throw error;
    }

    const isHome = fixture.homeTeam.id === 66;
    return {
        id: fixture.id,
        opponent: isHome ? fixture.awayTeam.name : fixture.homeTeam.name,
        opponentCrest: isHome ? fixture.awayTeam.crest : fixture.homeTeam.crest,
        homeTeam: fixture.homeTeam.name,
        awayTeam: fixture.awayTeam.name,
        venue: fixture.venue || (isHome ? 'Old Trafford' : 'Away ground'),
        isHome,
        competition: fixture.competition.name,
        competitionEmblem: fixture.competition.emblem,
        kickoff: fixture.utcDate,
    };
}

async function start() {
    if (!process.env.MONGO_URI) {
        throw new Error('MONGO_URI must be set in the backend environment.');
    }
    await mongoose.connect(process.env.MONGO_URI);
    app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
}

start().catch((error) => {
    console.error('Backend startup failed:', error.message);
    process.exit(1);
});
import mongoose from 'mongoose';

// Global context schema (shared knowledge)
const globalContextSchema = new mongoose.Schema({
    botPersonality: String,
    knowledgeBase: Array,
    recentGlobalTopics: Array,
    lastUpdate: Date,
});

// User context schema (individual user memory)
const userContextSchema = new mongoose.Schema({
    userId: String,
    username: String,
    conversationHistory: [
        {
            message: String,
            response: String,
            timestamp: Date,
        },
    ],
    mood: String,
    preferences: Object,
    contextTokens: Array,
    lastActive: Date,
});

const UserContext = mongoose.model("UserContext", userContextSchema)
const GlobalContext = mongoose.model("GlobalContext", globalContextSchema)
mongoose.set('strictQuery', true);

export {UserContext, GlobalContext}
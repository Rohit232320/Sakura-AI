import express from 'express';
import mongoose from 'mongoose';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';

// Import routes
import chatRoutes from './routes/chatRoutes.js';

dotenv.config();

const app = express();
app.use(bodyParser.json());

// Health check endpoint for Docker
app.get('/health', (req, res) => {
    const status = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    };
    res.json(status);
});

// MongoDB Connection with better error handling
console.log('Connecting to MongoDB...');

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => {
    console.log('✅ Connected to MongoDB successfully');
})
.catch((error) => {
    console.error('❌ MongoDB connection error:', error.message);
    console.error('Please check:');
    console.error('1. Your MONGO_URI in .env file');
    console.error('2. MongoDB Atlas IP whitelist (add 0.0.0.0/0 for testing)');
    console.error('3. Database user credentials and permissions');
    console.error('4. Special characters in password are URL-encoded');
    process.exit(1);
});

const db = mongoose.connection;

db.on('error', (error) => {
    console.error('MongoDB connection error:', error);
});

db.on('disconnected', () => {
    console.warn('⚠️  MongoDB disconnected. Attempting to reconnect...');
});

db.on('reconnected', () => {
    console.log('✅ MongoDB reconnected');
});

// Use the routes
app.use('/api/chat', chatRoutes);

// Start the server
const PORT = process.env.PORT || 7860;
app.listen(PORT, () => {
    console.log(`AI Bot server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Closing server gracefully...');
    db.close(() => {
        console.log('MongoDB connection closed');
        process.exit(0);
    });
});
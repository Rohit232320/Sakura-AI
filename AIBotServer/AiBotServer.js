import express from 'express';
import mongoose from 'mongoose';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';

// Import routes
import chatRoutes from './routes/chatRoutes.js';

dotenv.config();

const app = express();

// BODY PARSER - Parse JSON and URL-encoded data
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Also add express built-in parsers as backup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Use MONGODB_URI (matches your .env file)
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!mongoUri) {
    console.error('❌ ERROR: MONGODB_URI not found in .env file!');
    console.error('Please add: MONGODB_URI=mongodb+srv://...');
    process.exit(1);
}

mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => {
    console.log('✅ Connected to MongoDB successfully');
})
.catch((error) => {
    console.error('❌ MongoDB connection error:', error.message);
    console.error('Please check:');
    console.error('1. Your MONGODB_URI in .env file');
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

// Error handling middleware (add this!)
app.use((err, req, res, next) => {
    console.error('Express error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: err.message 
    });
});

// Start the server
const PORT = process.env.PORT || 7860;
app.listen(PORT, () => {
    console.log(`AI Bot server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Closing server gracefully...');
    db.close(() => {
        console.log('MongoDB connection closed');
        process.exit(0);
    });
});

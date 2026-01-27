import express from 'express';
import { chatController } from '../controllers/chatController.js';

const router = express.Router();

// Chat with Gemini API route
router.post('/:userId', chatController);

export default router;

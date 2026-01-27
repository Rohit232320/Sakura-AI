# 🌸 Sakura AI: Contextually Aware Conversational Bot

![version](https://img.shields.io/badge/version-1.0.0-blue)
![license](https://img.shields.io/badge/license-MIT-green)

## 📝 Project Overview
Sakura AI is a sophisticated conversational AI designed to maintain human-like interactions with personalized context awareness. This project demonstrates advanced natural language processing techniques and contextual memory management to create engaging, continuous conversations.

## ✨ Key Features

### 🧠 Advanced Context Management
- **Memory Retention**: Stores and recalls past conversations to maintain continuity
- **RAG Implementation**: Retrieves and applies relevant past interactions using TF-IDF scoring
- **Contextual Awareness**: Maintains conversation flow by recognizing references to previous topics

### 👤 User Profiling
- **Dynamic User Profiles**: Builds comprehensive user profiles over time
- **Preference Tracking**: Automatically extracts and remembers user preferences and interests
- **Mood Detection**: Analyzes emotional tone in messages to adapt conversation style

### 💬 Natural Language Processing
- **Entity Extraction**: Identifies important people, places, and concepts in conversations
- **Sentiment Analysis**: Recognizes emotional patterns in text
- **Topic Classification**: Categorizes conversations into relevant domains

### ⚙️ Technical Implementation
- **MongoDB Integration**: Scalable document storage for user context and conversation history
- **NLP Pipeline**: Text preprocessing, tokenization, and semantic analysis
- **Memory Management**: Smart trimming of conversation history to maintain relevant context

### 🌐 Global Context Awareness
- **Trending Topics**: Tracks common themes across all conversations
- **Shared Knowledge Base**: Maintains global context that benefits all user interactions

## 🛠️ Technology Stack

<p align="center">
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js"/></a>
  <a href="https://expressjs.com/"><img src="https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express.js"/></a>
  <a href="https://www.mongodb.com/"><img src="https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB"/></a>
  <a href="https://mongoosejs.com/"><img src="https://img.shields.io/badge/Mongoose-880000?style=for-the-badge&logo=mongoose&logoColor=white" alt="Mongoose"/></a>
  <a href="https://axios-http.com/"><img src="https://img.shields.io/badge/Axios-5A29E4?style=for-the-badge&logo=axios&logoColor=white" alt="Axios"/></a>
  <a href="https://www.npmjs.com/package/natural"><img src="https://img.shields.io/badge/Natural.js-CB3837?style=for-the-badge&logo=npm&logoColor=white" alt="Natural.js"/></a>
  <a href="https://deepmind.google/technologies/gemini/"><img src="https://img.shields.io/badge/Gemini_API-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Gemini API"/></a>
</p>

## 📋 Features In Depth

### Retrieval-Augmented Generation (RAG)
The bot uses a custom RAG system that:
- Tokenizes and processes user messages
- Employs TF-IDF to score relevance of previous conversations
- Retrieves the most contextually appropriate historical exchanges
- Combines recent and relevant history for LLM context

### Contextual Understanding
```javascript
// Example of the context building process
let contextPrompt = "";
if (userInfo) {
  contextPrompt += `USER INFORMATION:
  - You're talking to ${effectiveUserName} (user ID: ${userId})
  - Last active: ${timeSinceLastActive} ago
  - Current mood: ${userInfo.mood || "neutral"}
  ${userInfo.preferences && Object.keys(userInfo.preferences).length > 0 ? 
    `- User preferences: ${JSON.stringify(userInfo.preferences)}` : ""}
  `;
}
```

### Mood and Preference Detection
The system automatically extracts:
- User mood through keyword and pattern analysis
- Preferences using natural language processing
- Named entities for building user knowledge graphs

## 🚀 Applications
This chatbot framework demonstrates advanced techniques applicable to:
- Customer service virtual assistants
- Mental health support bots
- Educational tutoring systems
- Entertainment applications
- Personalized social companions

## 🔧 Installation & Setup
- Make sure you get the Gemini API key and Discord API key and Setup to .env

- .env structure must be like this.
```bash
MONGO_URI = your mongo API key
GEMINI_API_URL = your Gemini API URL
GEMINI_API_KEY = your Gemini API key
DISCORD_BOT_TOKEN = your Discord bot Token
AI_BOT_SERVER_URL = your AI bot server URL
PORT = 3000
ALLOWED_GUILD_IDS = Discord Guild (server) IDs ,more than one can be added by seperating commas
ALLOWED_CHANNEL_NAMES = Discord Channel (channel) IDs ,more than one can be added by seperating commas
```
```bash
# Clone the repository
git clone https://github.com/0xRoS-200/sakura-ai.git

# Install dependencies
cd sakura-ai
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your MongoDB and Gemini API credentials

# Start the server
npm start
```

## 📜 License
This project is licensed under the MIT License - see the LICENSE file for details.

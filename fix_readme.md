# 🌸 Sakura AI - Setup Instructions

## Fixed Issues
This update fixes the following critical issues:
1. ✅ **ENOTFOUND discord.com** - Network connectivity in Docker
2. ✅ **MongoDB authentication failed** - Better error messages and configuration
3. ✅ **Channel name parsing** - Fixed whitespace issues in ALLOWED_CHANNEL_NAMES

## Quick Start

### 1. Prerequisites
- Node.js 16+ installed
- Docker and Docker Compose (optional, but recommended)
- MongoDB Atlas account (free tier works)
- Discord Bot Token
- Google Gemini API Key

### 2. Get Your API Keys

#### MongoDB Atlas
1. Go to [MongoDB Atlas](https://cloud.mongodb.com/)
2. Create a free cluster
3. **Database Access**: Create a user with a simple password (no special characters for now)
4. **Network Access**: Add IP Address → **Allow Access from Anywhere** (0.0.0.0/0)
5. Get your connection string (should look like: `mongodb+srv://...`)

#### Discord Bot
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create New Application
3. Go to **Bot** section
4. Click **Add Bot**
5. Enable these Privileged Gateway Intents:
   - ✅ Message Content Intent
   - ✅ Server Members Intent
6. Copy the bot token
7. Go to **OAuth2 → URL Generator**
8. Select scopes: `bot`
9. Select permissions: `Send Messages`, `Read Messages/View Channels`, `Read Message History`
10. Use the generated URL to invite bot to your server

#### Gemini API
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create API Key
3. Copy the key

### 3. Configuration

#### Create .env file
```bash
# Copy the example
cp .env.example .env

# Edit with your credentials
nano .env
```

#### Fill in your credentials:
```env
MONGO_URI=mongodb+srv://username:password@your-cluster.mongodb.net/sakura-ai?retryWrites=true&w=majority
GEMINI_API_KEY=your-gemini-api-key-here
GEMINI_API_URL=https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent
DISCORD_BOT_TOKEN=your-discord-bot-token-here
AI_BOT_SERVER_URL=http://localhost:7860
PORT=7860
ALLOWED_GUILD_IDS=your-server-id-1,your-server-id-2
ALLOWED_CHANNEL_NAMES=sakura,sakura2
```

**Important Notes:**
- No spaces in comma-separated lists
- If MongoDB password has special characters, URL-encode them:
  - `@` → `%40`, `#` → `%23`, `%` → `%25`, `:` → `%3A`, `/` → `%2F`

#### Get Discord Server/Channel IDs
1. Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode)
2. Right-click your server → Copy ID (for ALLOWED_GUILD_IDS)
3. Right-click your channel → Copy ID (or just use the channel name)

### 4. Installation

#### Option A: Using Docker (Recommended)
```bash
# Build and start
docker-compose up --build

# Or run in background
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

#### Option B: Without Docker
```bash
# Install dependencies
npm install

# Run diagnostic check and start
chmod +x start.sh
./start.sh

# Or start directly
npm start
```

### 5. Verify It's Working

You should see output like this:
```
[0] AI Bot server running on port 7860
[0] ✅ Connected to MongoDB successfully
[1] Environment check:
[1] DISCORD_BOT_TOKEN: Set
[1] ✅ Successfully logged into Discord
[1] 🤖 Bot is online as YourBot#1234
```

### 6. Test the Bot

In your Discord channel:
1. Type a message in the allowed channel
2. The bot should respond

## Troubleshooting

### Error: ENOTFOUND discord.com
**Cause:** Docker container has no internet access

**Fix:**
```bash
# Use the provided docker-compose.yml which includes:
# - network_mode: bridge
# - DNS: 8.8.8.8, 8.8.4.4

docker-compose down
docker-compose up --build
```

### Error: bad auth : authentication failed
**Cause:** Wrong MongoDB credentials or IP not whitelisted

**Fix:**
1. Go to MongoDB Atlas → Database Access
2. Edit user → Generate new simple password (alphanumeric only)
3. Go to Network Access → Add 0.0.0.0/0
4. Update MONGO_URI in .env
5. Restart: `docker-compose restart`

### Bot not responding in channels
**Fix:**
1. Check bot has permissions in Discord server
2. Verify channel names match exactly (case-sensitive)
3. Check ALLOWED_GUILD_IDS and ALLOWED_CHANNEL_NAMES in .env
4. Ensure no spaces in the comma-separated lists

### Port 7860 already in use
**Fix:**
```bash
# Find what's using it
lsof -i :7860

# Kill it
kill -9 <PID>

# Or change port in .env
PORT=8080
AI_BOT_SERVER_URL=http://localhost:8080
```

## Project Structure

```
sakura-ai/
├── AIBotServer/
│   ├── AiBotServer.js          # Express server (UPDATED)
│   ├── controllers/
│   │   └── chatController.js    # Main bot logic
│   ├── models/
│   │   └── AiBotDbSchema.js     # MongoDB schemas
│   └── routes/
│       └── chatRoutes.js        # API routes
├── DiscordBot/
│   └── Discord_Bot_Integration.js  # Discord bot (UPDATED)
├── Dockerfile                   # Docker config (UPDATED)
├── docker-compose.yml           # Docker Compose (NEW)
├── package.json
├── .env                         # Your credentials (create this)
├── .env.example                 # Template (NEW)
├── start.sh                     # Diagnostic script (NEW)
└── TROUBLESHOOTING.md          # Detailed troubleshooting (NEW)
```

## Updated Files

Replace these files in your project:
1. **Dockerfile** - Fixed network configuration
2. **Discord_Bot_Integration.js** - Fixed channel parsing, better error handling
3. **AiBotServer.js** - Added health checks, better MongoDB error messages
4. **docker-compose.yml** - NEW - Proper Docker networking
5. **.env.example** - NEW - Configuration template
6. **start.sh** - NEW - Pre-flight diagnostics
7. **TROUBLESHOOTING.md** - NEW - Comprehensive troubleshooting guide

## Running in Production

### Using Docker Compose
```bash
# Start in detached mode
docker-compose up -d

# View logs
docker-compose logs -f

# Restart
docker-compose restart

# Stop
docker-compose down
```

### Using PM2 (without Docker)
```bash
# Install PM2
npm install -g pm2

# Start
pm2 start npm --name "sakura-ai" -- start

# View logs
pm2 logs sakura-ai

# Restart
pm2 restart sakura-ai

# Stop
pm2 stop sakura-ai
```

## Health Check

Test if the server is running:
```bash
curl http://localhost:7860/health
```

Should return:
```json
{
  "status": "OK",
  "timestamp": "2026-01-27T...",
  "mongodb": "connected"
}
```

## Getting Help

If you encounter issues:
1. Check logs: `docker-compose logs -f` or `npm start`
2. Read `TROUBLESHOOTING.md`
3. Verify all environment variables are correct
4. Test network: `ping discord.com` and `ping 8.8.8.8`

## Security Notes

⚠️ **Important:**
- Never commit `.env` file to Git (it's in .gitignore)
- Use MongoDB Atlas IP whitelist for production (don't use 0.0.0.0/0)
- Rotate API keys regularly
- Use strong passwords for MongoDB users

## License

MIT License - See LICENSE file
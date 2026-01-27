# 🔧 Sakura AI - Troubleshooting Guide

## Quick Fix Checklist

### 1. Fix MongoDB Authentication Error
```bash
# Error: MongoServerError: bad auth : authentication failed
```

**Solution:**
1. Go to [MongoDB Atlas](https://cloud.mongodb.com/)
2. Navigate to **Database Access**
3. Click on your user → **Edit**
4. Generate a new password (use alphanumeric only for testing, no special characters)
5. Set privileges to "Atlas admin" or "Read and write to any database"
6. Click **Update User**

Then go to **Network Access**:
1. Click **"Add IP Address"**
2. Click **"Allow Access from Anywhere"** (adds 0.0.0.0/0)
3. Click **Confirm**

Update your `.env` file with the new credentials:
```env
MONGO_URI=mongodb+srv://username:NEW_PASSWORD@cluster.mongodb.net/sakura-ai?retryWrites=true&w=majority
```

**If your password has special characters, URL-encode them:**
- `@` → `%40`
- `#` → `%23`
- `%` → `%25`
- `:` → `%3A`
- `/` → `%2F`

### 2. Fix Discord Connection Error (ENOTFOUND)
```bash
# Error: getaddrinfo ENOTFOUND discord.com
```

**This means your Docker container has no internet access.**

**Solution A - Using Docker Compose (Recommended):**
```bash
# Stop any running containers
docker-compose down

# Remove old containers
docker rm -f sakura-ai-bot

# Rebuild with the fixed docker-compose.yml
docker-compose up --build
```

**Solution B - Using Docker directly:**
```bash
# Build the image
docker build -t sakura-ai .

# Run with proper network settings
docker run --rm \
  --env-file .env \
  -p 7860:7860 \
  --dns 8.8.8.8 \
  --dns 8.8.4.4 \
  sakura-ai
```

**Solution C - Test network inside container:**
```bash
# Enter the running container
docker exec -it sakura-ai-bot sh

# Test network connectivity
ping -c 3 8.8.8.8
curl -I https://discord.com
nslookup discord.com

# If these fail, your Docker network configuration is wrong
```

### 3. Environment Variables

Create a `.env` file in your project root (use .env.example as template):

```env
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/sakura-ai?retryWrites=true&w=majority
GEMINI_API_KEY=your-gemini-api-key
GEMINI_API_URL=https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent
DISCORD_BOT_TOKEN=your-discord-bot-token
AI_BOT_SERVER_URL=http://localhost:7860
PORT=7860
ALLOWED_GUILD_IDS=1371693836715298878,1369762643652509756
ALLOWED_CHANNEL_NAMES=sakura,sakura2
```

**Important:**
- No spaces in ALLOWED_GUILD_IDS
- No spaces in ALLOWED_CHANNEL_NAMES
- URL-encode special characters in MONGO_URI password

## Expected Success Output

When everything is working correctly, you should see:

```bash
[0] AI Bot server running on port 7860
[0] Connecting to MongoDB...
[0] ✅ Connected to MongoDB successfully
[1] Environment check:
[1] DISCORD_BOT_TOKEN: Set
[1] AI_BOT_SERVER_URL: http://localhost:7860
[1] Allowed Guild IDs: [ '1371693836715298878', ... ]
[1] Allowed Channel Names: [ 'sakura', 'sakura2' ]
[1] Attempting to login to Discord...
[1] ✅ Successfully logged into Discord
[1] 🤖 Bot is online as YourBotName#1234
```

## Common Issues

### Issue: Port 7860 already in use
```bash
# Find what's using the port
lsof -i :7860

# Kill the process
kill -9 <PID>

# Or change the port in .env
PORT=8080
```

### Issue: Discord bot not responding in channels
**Check:**
1. Bot has proper permissions in Discord server
2. Channel names match exactly (case-sensitive)
3. Guild IDs are correct
4. Bot has "Read Messages" and "Send Messages" permissions

### Issue: Can't find .env file
```bash
# Make sure .env is in the project root
ls -la .env

# Copy from example if needed
cp .env.example .env

# Edit with your actual credentials
nano .env
```

## Docker Network Debugging

### Check Docker network configuration:
```bash
# List Docker networks
docker network ls

# Inspect bridge network
docker network inspect bridge

# Check container network
docker inspect sakura-ai-bot | grep -A 20 NetworkSettings
```

### Force recreate network:
```bash
# Stop all containers
docker-compose down

# Remove networks
docker network prune

# Rebuild
docker-compose up --build
```

## MongoDB Connection String Format

**Correct format:**
```
mongodb+srv://username:password@cluster-name.mongodb.net/database-name?retryWrites=true&w=majority
```

**Common mistakes:**
- Using `mongodb://` instead of `mongodb+srv://`
- Forgetting the database name
- Not URL-encoding special characters in password
- Wrong cluster name

## Testing Individual Components

### Test MongoDB connection:
```bash
node -e "
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected!'))
  .catch(err => console.error('MongoDB Error:', err));
"
```

### Test Discord bot only:
```bash
npm run start:discord
```

### Test AI server only:
```bash
node AIBotServer/AiBotServer.js
```

## Getting Help

If you're still stuck:
1. Check the logs: `docker logs sakura-ai-bot`
2. Verify all environment variables are set: `docker exec sakura-ai-bot env`
3. Test network: `docker exec sakura-ai-bot ping -c 3 8.8.8.8`

## Files You Need to Update

Replace these files in your project:
- `Dockerfile` - Fixed network configuration
- `Discord_Bot_Integration.js` - Fixed channel parsing and error handling
- `AiBotServer.js` - Added health checks and better error messages
- `docker-compose.yml` - NEW FILE - Proper network and DNS settings
- `.env` - Update with your actual credentials

## Final Checklist Before Running

- [ ] `.env` file exists with all required variables
- [ ] MongoDB password is URL-encoded if it has special characters
- [ ] MongoDB Atlas IP whitelist includes 0.0.0.0/0
- [ ] MongoDB user has "Atlas admin" or proper permissions
- [ ] No spaces in ALLOWED_GUILD_IDS or ALLOWED_CHANNEL_NAMES
- [ ] Discord bot token is valid
- [ ] Gemini API key is valid
- [ ] Port 7860 is not in use
- [ ] Docker has network access

Run with:
```bash
docker-compose up --build
```

Or without Docker:
```bash
npm install
npm start
```
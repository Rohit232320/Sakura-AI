# Use the official Node.js image
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package files first (better caching)
COPY package*.json ./

# Install dependencies
RUN npm install
RUN npm install openai


# Copy the rest of the application
COPY . .

# Expose the port
EXPOSE 7860

# Start the app

CMD ["npm", "start"]

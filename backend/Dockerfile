# Base image
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies)
RUN --mount=type=cache,target=/root/.npm \
    npm install

# Copy full source
COPY . .

# Build the application
RUN npm run build

# Production image
FROM node:24-alpine AS runner

WORKDIR /app

# Set to production
ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Provide a default port for Next locally vs Azure App Service vs Render
EXPOSE 3284
ENV PORT=3284

# Start the application
CMD ["node", "dist/main"]

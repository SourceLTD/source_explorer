#!/bin/bash

# Load environment variables from .env.local
export $(grep -v '^#' .env.local | xargs)

echo "================================================"
echo "Pulling database schema and generating clients"
echo "================================================"

# 1. Pull database schema and generate Prisma client for main app
echo ""
echo "[1/2] Main Prisma schema (root)..."
npx prisma db pull && npx prisma generate

if [ $? -ne 0 ]; then
  echo "❌ Failed to update main Prisma schema"
  exit 1
fi

echo "✅ Main Prisma schema updated"

# 2. Pull database schema and generate Prisma client for Lambda
echo ""
echo "[2/2] Lambda Prisma schema..."
cd lambda/llm-job-poller
npx prisma db pull && npx prisma generate

if [ $? -ne 0 ]; then
  echo "❌ Failed to update Lambda Prisma schema"
  exit 1
fi

echo "✅ Lambda Prisma schema updated"
cd ../..

echo ""
echo "================================================"
echo "✅ All Prisma schemas updated successfully!"
echo "================================================"


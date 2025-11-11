#!/bin/bash

# Load environment variables from .env.local
export $(grep -v '^#' .env.local | xargs)

# Pull database schema and generate Prisma client
npx prisma db pull && npx prisma generate


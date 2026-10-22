# Stockroom

Stockroom is a small-shop inventory tracker built with Next.js, Better Auth, and PostgreSQL. For local development, PostgreSQL runs in Docker and has no hosting fee.

## Run locally

Requirements: Node.js 20+ and Docker Desktop.

1. Copy `.env.example` to `.env.local` and replace `BETTER_AUTH_SECRET` with a random secret of at least 32 characters. Keep `.env.local` private.
2. Install the app dependencies:

   ```bash
   npm install
   ```

3. Start Docker Desktop and wait for it to finish starting.
4. Start the database container:

   ```bash
   npm run db:up
   ```

5. Create Better Auth's tables:

   ```bash
   npm run db:migrate
   ```

6. Start the app:

   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000), create an account, and add products. Product records are tied to the signed-in account. The Docker named volume keeps the database when the container stops; `npm run db:down` stops the container without deleting that volume.

## Current scope

- Email and password sign-up and sign-in
- Per-account product inventory
- Product search, categories, stock adjustments, and low-stock alerts
- Local PostgreSQL storage in Docker

This is a local development setup. To serve customers over the internet, the app and database need to run on an internet-accessible host, which may have costs. Email verification and password reset email delivery are not configured yet.

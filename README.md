# Stockroom

Stockroom is a small-shop inventory tracker built with Next.js, Better Auth, and PostgreSQL. Docker Compose runs the app, database, and local database viewer together.

## Run with Docker

Requirement: Docker Desktop.

1. Copy `.env.example` to `.env.local` and replace `BETTER_AUTH_SECRET` with a random secret of at least 32 characters. Keep `.env.local` private.
2. Start Docker Desktop and wait for it to finish starting.
3. Build and start the full system:

   ```bash
   docker compose up --build -d
   ```

The app container waits for PostgreSQL, applies the database migrations, then starts the app. Open:

- App: [http://localhost:3000](http://localhost:3000)
- Local database viewer: [http://localhost:8080](http://localhost:8080)

In Adminer, select **PostgreSQL** and use server `database`, username `stockroom`, password `stockroom_local_only`, and database `stockroom`.

Stop the containers with `docker compose down`. The database volume remains on that computer, so the data is still there when the system starts again.

Create an account at the app address and add products. Product records are tied to the signed-in account.

## Current scope

- Email and password sign-up and sign-in
- Per-account product inventory
- Product search, categories, stock adjustments, and low-stock alerts
- PostgreSQL database in Docker
- App, database, and local database viewer started together with Docker Compose

This Compose setup is for local use. To serve customers over the internet, the app and database need to run on a secured, internet-accessible host, which may have costs. Email verification and password reset email delivery are not configured yet.

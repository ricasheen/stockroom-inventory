# Stockroom

Stockroom is a small-shop inventory system built to demonstrate Rica Sheen G. Cabidog's web and mobile development stack: Laravel/PHP, MySQL, HTML/CSS/JavaScript, Flutter, Docker, and Git.

## Stack and project layout

- `backend/` — Laravel 12 JSON API, Sanctum bearer-token authentication, Eloquent models, migrations, and the Blade web client.
- `mobile/` — Flutter companion app for signing in and viewing inventory.
- `docker-compose.yml` — MySQL, Laravel API/web app, and Adminer for local development.

The original Next.js/PostgreSQL source is archived in `legacy-next/` as a migration reference; the repository root now uses Laravel/MySQL and Flutter. Data in the old PostgreSQL volume is not migrated automatically.

## Run the web app and API

Requirement: Docker Desktop with Compose.

```bash
docker compose up --build -d
```

Open the web app at [http://localhost:8000](http://localhost:8000). Adminer is at [http://localhost:8080](http://localhost:8080), with server `database`, user `stockroom`, password `stockroom_local_only`, and database `stockroom`.

The PHP 8.4 Laravel container installs dependencies with Composer and runs database migrations at startup. MySQL is exposed on host port 3307 because port 3306 is already in use on this computer; other containers connect on 3306. The Compose credentials and app key are for local development only. For a shared or deployed environment, set a fresh `APP_KEY` (generate it with `php artisan key:generate --show`) and unique database credentials in your deployment configuration.

### API

- `POST /api/register` — create an account (`name`, `email`, `password`).
- `POST /api/login` — sign in and receive a Sanctum bearer token (`email`, `password`).
- `POST /api/logout` — revoke the current token.
- `GET /api/products` — list the signed-in user's products.
- `POST /api/products` — add a product (`name`, `sku`, optional `category`, `quantity`, `price`, `reorder_level`).
- `PUT/PATCH /api/products/{id}` — update a product.
- `DELETE /api/products/{id}` — delete a product.

Product endpoints require `Authorization: Bearer <token>`. Records are scoped to their owner, and product codes are unique per account.

## Run the Flutter app

Flutter 3.41.2 or newer is recommended. From `mobile/`, restore the locked packages, then run in Chrome:

```bash
cd mobile
flutter pub get
flutter run -d chrome --web-port=8081 --dart-define=API_URL=http://localhost:8000/api
```

For an Android emulator, use `flutter run -d <device-id> --dart-define=API_URL=http://10.0.2.2:8000/api`; `10.0.2.2` reaches the host machine from the emulator. For a physical phone, use the computer's LAN IP address. The mobile client currently supports sign-in and inventory viewing; web handles adding and deleting products.

## Current scope

- Account registration, sign-in, and token revocation API.
- Product create, list, update, and delete API with per-user ownership.
- Responsive Blade inventory page for sign-in, listing, adding, and deleting products.
- MySQL schema and Docker Compose development environment.
- Flutter sign-in and inventory list client.

Email verification, password reset, sales reports, and the old PostgreSQL data migration are not included in this first stack conversion.

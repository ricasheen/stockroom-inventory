FROM composer:2 AS composer
WORKDIR /app
COPY . .
RUN mkdir -p bootstrap/cache storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs \
 && composer install --no-dev --no-scripts --no-interaction --prefer-dist --optimize-autoloader

FROM php:8.4-cli
RUN docker-php-ext-install pdo_mysql
WORKDIR /app
COPY . .
COPY --from=composer /app/vendor ./vendor
RUN mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs storage/app/private storage/app/public bootstrap/cache \
 && chmod -R 775 storage bootstrap/cache
EXPOSE 8000
CMD ["sh", "-c", "php artisan package:discover --ansi && php artisan migrate --force && php artisan serve --host=0.0.0.0 --port=8000"]

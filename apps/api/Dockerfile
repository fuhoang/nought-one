# syntax=docker/dockerfile:1
FROM php:8.5-fpm-bookworm AS extensions
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev libpng-dev libjpeg62-turbo-dev libwebp-dev libonig-dev libzip-dev libicu-dev \
    && docker-php-ext-configure gd --with-jpeg --with-webp \
    && docker-php-ext-install -j"$(nproc)" pdo_pgsql gd zip intl pcntl \
    && rm -rf /var/lib/apt/lists/*

FROM php:8.5-fpm-bookworm AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx supervisor ca-certificates libpq5 libpng16-16 libjpeg62-turbo libwebp7 libzip4 libicu72 \
    && apt-get purge -y --auto-remove $PHPIZE_DEPS \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 app && useradd --uid 10001 --gid app --no-create-home app
COPY --from=extensions /usr/local/lib/php/extensions/ /usr/local/lib/php/extensions/
COPY --from=extensions /usr/local/etc/php/conf.d/ /usr/local/etc/php/conf.d/
COPY docker/php.ini /usr/local/etc/php/conf.d/99-app.ini
COPY docker/php-fpm.conf /usr/local/etc/php-fpm.d/zz-app.conf
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/supervisord.conf /etc/supervisor/app.conf
COPY --chmod=755 docker/entrypoint.sh docker/healthcheck.sh /usr/local/bin/
COPY docker/supervisor-exit.py /usr/local/bin/supervisor-exit.py
ENV PORT=8080
EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["entrypoint.sh"]
CMD ["api"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s CMD healthcheck.sh

FROM base AS dependencies
COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer
RUN apt-get update && apt-get install -y --no-install-recommends git unzip && rm -rf /var/lib/apt/lists/*
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction
COPY . .
RUN mkdir -p bootstrap/cache storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs storage/app/private/card-assets \
    && composer dump-autoload --no-dev --classmap-authoritative --no-interaction

FROM dependencies AS development
ARG DEV_UID=1000
ARG DEV_GID=1000
RUN groupmod -o --gid "$DEV_GID" app && usermod -o --uid "$DEV_UID" --gid "$DEV_GID" app \
    && composer install --prefer-dist --no-interaction \
    && chown -R app:app /app
USER app
ENV APP_ENV=local APP_DEBUG=true

FROM base AS production
COPY --from=dependencies /app/artisan /app/composer.json /app/composer.lock ./
COPY --from=dependencies /app/app ./app
COPY --from=dependencies /app/bootstrap ./bootstrap
COPY --from=dependencies /app/config ./config
COPY --from=dependencies /app/database ./database
COPY --from=dependencies /app/public ./public
COPY --from=dependencies /app/resources ./resources
COPY --from=dependencies /app/routes ./routes
COPY --from=dependencies /app/storage ./storage
COPY --from=dependencies /app/vendor ./vendor
RUN chown -R app:app /app/storage /app/bootstrap/cache
USER 10001:10001
ENV APP_ENV=production APP_DEBUG=false LOG_CHANNEL=stderr

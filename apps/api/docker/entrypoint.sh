#!/bin/sh
set -eu
cd /app
# Accept an explicit start command whether the platform retains ENTRYPOINT or replaces it.
case "${1:-}" in entrypoint.sh|/usr/local/bin/entrypoint.sh) shift;; esac
mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache
if [ "${APP_ENV:-production}" = production ]; then
    : "${APP_KEY:?APP_KEY must be supplied at runtime}"
    php artisan config:cache --no-interaction
fi
case "${1:-api}" in
    api|worker|scheduler) printf '%s\n' "${1:-api}" > /tmp/container-role;;
esac
case "${1:-api}" in
    api)
        case "${PORT:-8080}" in *[!0-9]*|'') echo "PORT must be numeric" >&2; exit 1;; esac
        sed "s/__PORT__/${PORT:-8080}/g" /etc/nginx/nginx.conf > /tmp/nginx.conf
        exec /usr/bin/supervisord -c /etc/supervisor/app.conf
        ;;
    worker)
        export CONTAINER_ROLE=worker
        exec php artisan queue:work --sleep=3 --tries=3 --timeout=60 --max-time=3600
        ;;
    scheduler)
        export CONTAINER_ROLE=scheduler
        exec php artisan schedule:work
        ;;
    *) exec "$@";;
esac

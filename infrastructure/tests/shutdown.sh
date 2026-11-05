#!/bin/sh
set -eu
# Run from the repository root, only against the named integration stack.
compose() { docker compose -f infrastructure/compose.test.yaml "$@"; }
compose exec -T api php /checks/queue-probe.php enqueue
attempt=0
until [ "$(compose exec -T api php /checks/queue-probe.php status)" = started ]; do
    attempt=$((attempt + 1))
    [ "$attempt" -lt 30 ] || { echo 'Worker did not start the probe' >&2; exit 1; }
    sleep 0.2
done
compose stop -t 90 worker
[ "$(compose exec -T api php /checks/queue-probe.php status)" = completed ]
worker_id=$(compose ps -aq worker)
[ "$(docker inspect --format '{{.State.ExitCode}}' "$worker_id")" = 0 ]
compose start worker
compose stop -t 90 api scheduler web
for service in api scheduler web; do
    container_id=$(compose ps -aq "$service")
    exit_code=$(docker inspect --format '{{.State.ExitCode}}' "$container_id")
    [ "$exit_code" != 137 ] || { echo "$service required SIGKILL" >&2; exit 1; }
done
compose start api scheduler web
echo 'Graceful shutdown passed; the in-flight job completed before the worker exited.'

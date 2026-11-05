#!/bin/sh
set -eu
CONTAINER_ROLE=$(cat /tmp/container-role 2>/dev/null || printf api)
export CONTAINER_ROLE
case "$CONTAINER_ROLE" in
    worker|scheduler)
        php -r '$file="/tmp/".getenv("CONTAINER_ROLE")."-heartbeat"; exit(is_file($file) && time()-filemtime($file)<120 ? 0 : 1);'
        ;;
    *) php -r '$r=@file_get_contents("http://127.0.0.1:".(getenv("PORT") ?: "8080")."/ready"); exit($r === false ? 1 : 0);';;
esac

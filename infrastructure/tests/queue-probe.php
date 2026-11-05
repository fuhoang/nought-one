<?php

require '/app/vendor/autoload.php';
$app = require '/app/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (getenv('CONTAINER_TESTING') !== '1' || $app['db']->connection()->getDatabaseName() !== 'nought_one_e2e') {
    throw new RuntimeException('Queue probe requires the isolated integration database.');
}

if (($argv[1] ?? '') === 'enqueue') {
    Illuminate\Support\Facades\Cache::store('database')->forget('container-queue-probe');
    dispatch(static function (): void {
        Illuminate\Support\Facades\Cache::store('database')->put('container-queue-probe', 'started', 120);
        sleep(5);
        Illuminate\Support\Facades\Cache::store('database')->put('container-queue-probe', 'completed', 120);
    })->onConnection('database');
} else {
    echo Illuminate\Support\Facades\Cache::store('database')->get('container-queue-probe', 'pending');
}

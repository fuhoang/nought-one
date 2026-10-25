<?php

$api = realpath(__DIR__.'/../../../api');
require $api.'/vendor/autoload.php';
$app = require $api.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Http\Kernel::class)->bootstrap();
if (config('database.default') !== 'pgsql' || $app['db']->connection()->getDatabaseName() !== 'nought_one_e2e') {
    http_response_code(500);
    exit('Refusing to run against a non-E2E database.');
}
$runtime = realpath(__DIR__.'/../.runtime');
if (is_file($runtime.'/public-api-unavailable') && str_starts_with($_SERVER['REQUEST_URI'], '/api/v1/public/cards/')) {
    http_response_code(503);
    header('Content-Type: application/json');
    exit('{"message":"Simulated upstream outage."}');
}
config([
    'session.driver' => 'file', 'session.files' => $runtime.'/sessions',
    'session.cookie' => 'nought-e2e-session', 'session.domain' => null, 'session.secure' => false,
    'cache.default' => 'array',
    'filesystems.disks.card_assets.root' => $runtime.'/assets',
    'filesystems.disks.local.root' => $runtime.'/private',
    'logging.channels.single.path' => $runtime.'/laravel.log',
]);
$app->handleRequest(Illuminate\Http\Request::capture());

<?php

$api = getenv('E2E_API_PATH') ?: realpath(__DIR__.'/../../../api');
require $api.'/vendor/autoload.php';
$app = require $api.'/bootstrap/app.php';
$app->instance('request', Illuminate\Http\Request::capture());
$app->make(Illuminate\Contracts\Http\Kernel::class)->bootstrap();
if (! $app->environment('testing') || config('database.default') !== 'pgsql' || $app['db']->connection()->getDatabaseName() !== 'nought_one_e2e') {
    http_response_code(500);
    exit('Refusing to run against a non-E2E database.');
}
$runtime = getenv('E2E_RUNTIME_PATH') ?: realpath(__DIR__.'/../.runtime');
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
// Capture only isolated test-account notifications; never deliver real email.
config(['mail.default' => 'array']);
Illuminate\Support\Facades\Event::listen(Illuminate\Notifications\Events\NotificationSent::class, function ($event) use ($runtime): void {
    if ($event->channel !== 'mail') {
        return;
    }
    $message = $event->notification->toMail($event->notifiable);
    $kind = $event->notification instanceof Illuminate\Auth\Notifications\ResetPassword ? 'reset' : 'verify';
    file_put_contents($runtime.'/'.hash('sha256', $event->notifiable->email).'-'.$kind.'.json', json_encode(['url' => $message->actionUrl]));
});
$app->handleRequest(Illuminate\Http\Request::capture());

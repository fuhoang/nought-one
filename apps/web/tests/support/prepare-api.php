<?php

$api = realpath(__DIR__.'/../../../api');
require $api.'/vendor/autoload.php';
$values = Dotenv\Dotenv::parse(file_get_contents($api.'/.env.testing'));
if (getenv('DB_DATABASE') !== 'nought_one_e2e') {
    exit("Refusing to prepare any database except nought_one_e2e.\n");
}
try {
    $pdo = new PDO(
        'pgsql:host='.($values['DB_HOST'] ?? '127.0.0.1').';port='.($values['DB_PORT'] ?? '5432').';dbname=postgres',
        $values['DB_USERNAME'], $values['DB_PASSWORD'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    if (! $pdo->query("SELECT 1 FROM pg_database WHERE datname = 'nought_one_e2e'")->fetchColumn()) {
        $pdo->exec('CREATE DATABASE nought_one_e2e');
    }
    echo "Isolated E2E database ready.\n";
} catch (Throwable $exception) {
    fwrite(STDERR, "Could not prepare the isolated E2E database. Check local PostgreSQL access.\n");
    exit(1);
}

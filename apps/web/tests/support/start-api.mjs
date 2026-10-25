import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const api = fileURLToPath(new URL('../../../api/', import.meta.url));
const runtime = fileURLToPath(new URL('../.runtime/', import.meta.url));
for (const folder of ['sessions', 'assets', 'private']) mkdirSync(`${runtime}/${folder}`, { recursive: true });
const env = { ...process.env, APP_ENV: 'testing', APP_DEBUG: 'false', APP_URL: 'http://localhost:8011',
  DB_CONNECTION: 'pgsql', DB_DATABASE: 'nought_one_e2e', DB_URL: '', SESSION_DRIVER: 'file',
  SANCTUM_STATEFUL_DOMAINS: 'localhost:3011,localhost:8011', CORS_ALLOWED_ORIGINS: 'http://localhost:3011', CACHE_STORE: 'array', CARD_ASSETS_DISK: 'card_assets' };
execFileSync('php', [fileURLToPath(new URL('prepare-api.php', import.meta.url))], { env, stdio: 'inherit' });
execFileSync('php', ['artisan', 'migrate', '--no-interaction'], { cwd: api, env, stdio: 'inherit' });
const server = spawn('php', ['-S', 'localhost:8011', fileURLToPath(new URL('api-server.php', import.meta.url))], { cwd: api, env, stdio: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.kill(signal));
server.on('exit', code => process.exit(code ?? 0));

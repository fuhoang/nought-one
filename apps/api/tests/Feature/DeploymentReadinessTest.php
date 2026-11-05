<?php

namespace Tests\Feature;

use App\Models\Card;
use App\Providers\AppServiceProvider;
use GuzzleHttp\Promise\Create;
use GuzzleHttp\Promise\PromiseInterface;
use GuzzleHttp\Psr7\Response;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use League\Flysystem\UnableToWriteFile;
use Psr\Http\Message\RequestInterface;
use RuntimeException;
use Tests\TestCase;

class DeploymentReadinessTest extends TestCase
{
    use RefreshDatabase;

    public function test_readiness_is_public_and_not_cached(): void
    {
        $this->getJson('/ready')->assertOk()->assertExactJson(['status' => 'ok'])
            ->assertHeader('Cache-Control', 'no-store, private');
    }

    public function test_dependency_failure_returns_no_sensitive_diagnostics(): void
    {
        Cache::shouldReceive('get')->once()->with('deployment-readiness')
            ->andThrow(new RuntimeException('secret database credentials'));

        $this->getJson('/ready')->assertStatus(503)->assertExactJson(['status' => 'unavailable']);
    }

    public function test_internal_requests_generate_public_https_asset_urls(): void
    {
        config(['deployment.force_public_url' => true, 'app.url' => 'https://api.app.example.com']);
        $this->app->getProvider(AppServiceProvider::class)->boot();

        try {
            $this->assertSame('https://api.app.example.com/api/v1/cards', URL::to('/api/v1/cards'));
        } finally {
            URL::useOrigin(null);
            URL::forceScheme(null);
        }
    }

    public function test_trusted_proxy_honors_https_and_client_ip_but_not_forwarded_host(): void
    {
        config(['deployment.trusted_proxies' => '*']);
        $this->app->getProvider(AppServiceProvider::class)->boot();
        Route::get('/proxy-test', fn (Request $request) => [
            'secure' => $request->secure(), 'ip' => $request->ip(), 'host' => $request->host(),
        ]);

        try {
            $this->withHeaders([
                'X-Forwarded-Proto' => 'https', 'X-Forwarded-For' => '203.0.113.8',
                'X-Forwarded-Host' => 'attacker.example',
            ])->getJson('/proxy-test')->assertOk()->assertExactJson([
                'secure' => true, 'ip' => '203.0.113.8', 'host' => 'localhost',
            ]);
        } finally {
            TrustProxies::at([]);
        }
    }

    public function test_public_asset_response_uses_configured_origin_for_internal_requests(): void
    {
        $card = Card::factory()->published()->create();
        $asset = $card->assets()->create([
            'type' => 'avatar', 'disk' => 'card_assets_s3', 'storage_key' => 'private/avatar.png',
            'mime_type' => 'image/png', 'file_size' => 100,
        ]);
        config(['deployment.force_public_url' => true, 'app.url' => 'https://api.app.example.com']);
        $this->app->getProvider(AppServiceProvider::class)->boot();

        try {
            $this->getJson('http://api:8080/api/v1/public/cards/'.$card->slug)
                ->assertOk()->assertJsonPath('data.assets.0.url',
                    'https://api.app.example.com/api/v1/public/cards/'.$card->slug.'/assets/'.$asset->id);
        } finally {
            URL::useOrigin(null);
            URL::forceScheme(null);
        }
    }

    public function test_s3_asset_disk_writes_private_objects_to_the_configured_endpoint(): void
    {
        $requests = [];
        config(['filesystems.disks.card_assets_s3' => array_merge(config('filesystems.disks.card_assets_s3'), [
            'key' => 'test-key', 'secret' => 'test-secret', 'region' => 'auto',
            'bucket' => 'private-cards', 'endpoint' => 'https://objects.example.com',
            'use_path_style_endpoint' => true,
            'http_handler' => function (RequestInterface $request) use (&$requests): PromiseInterface {
                $requests[] = $request;

                return Create::promiseFor(new Response(200, ['ETag' => '"test"']));
            },
        ])]);

        $this->assertTrue(Storage::disk('card_assets_s3')->put('card/avatar.png', 'image-bytes'));
        $this->assertCount(1, $requests);
        $this->assertSame('private', $requests[0]->getHeaderLine('x-amz-acl'));
        $this->assertSame('https://objects.example.com/private-cards/card/avatar.png', (string) $requests[0]->getUri());
    }

    public function test_s3_asset_disk_throws_when_object_storage_rejects_a_write(): void
    {
        config(['filesystems.disks.card_assets_s3' => array_merge(config('filesystems.disks.card_assets_s3'), [
            'key' => 'test-key', 'secret' => 'test-secret', 'region' => 'auto',
            'bucket' => 'private-cards', 'endpoint' => 'https://objects.example.com',
            'http_handler' => fn (): PromiseInterface => Create::rejectionFor([
                'response' => new Response(403, [], '<Error><Code>AccessDenied</Code></Error>'),
                'exception' => new RuntimeException('Object storage denied the write.'),
            ]),
        ])]);

        $this->expectException(UnableToWriteFile::class);
        Storage::disk('card_assets_s3')->put('card/avatar.png', 'image-bytes');
    }
}

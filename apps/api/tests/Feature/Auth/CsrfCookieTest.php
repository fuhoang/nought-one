<?php

namespace Tests\Feature\Auth;

use Illuminate\Cookie\CookieValuePrefix;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class CsrfCookieTest extends TestCase
{
    use RefreshDatabase;

    public function test_default_cookie_name_remains_compatible(): void
    {
        $this->get('/sanctum/csrf-cookie')->assertNoContent()
            ->assertCookie('XSRF-TOKEN')->assertHeader('X-CSRF-Cookie-Name', 'XSRF-TOKEN');
    }

    public function test_custom_cookie_is_encrypted_and_advertised_to_allowed_frontend(): void
    {
        config(['session.csrf_cookie' => 'XSRF-TOKEN-STAGING', 'session.secure' => true]);
        $response = $this->withHeader('Origin', 'http://localhost:3000')->get('/sanctum/csrf-cookie');
        $response->assertNoContent()->assertCookie('XSRF-TOKEN-STAGING')->assertCookieMissing('XSRF-TOKEN')
            ->assertHeader('X-CSRF-Cookie-Name', 'XSRF-TOKEN-STAGING');
        $this->assertStringContainsString('X-CSRF-Cookie-Name', $response->headers->get('Access-Control-Expose-Headers'));
        $cookie = $response->getCookie('XSRF-TOKEN-STAGING', false);
        $this->assertTrue($cookie->isSecure());
        $this->assertFalse($cookie->isHttpOnly());
        $this->assertNotSame(session()->token(), $cookie->getValue());
        $this->assertStringContainsString('no-store', $response->headers->get('Cache-Control'));
    }

    public function test_web_and_stateful_api_still_reject_missing_and_wrong_tokens(): void
    {
        config(['session.csrf_cookie' => 'XSRF-TOKEN-STAGING']);
        // Exercise real CSRF validation, which Laravel bypasses in the testing environment.
        $this->app['env'] = 'local';
        Route::post('/csrf-probe', fn () => response()->noContent())->middleware('web');
        Route::post('/api/csrf-probe', fn () => response()->noContent())->middleware('api');
        $this->withHeader('Origin', 'http://localhost:3000');
        foreach (['/csrf-probe', '/api/csrf-probe'] as $path) {
            $this->withSession(['_token' => 'staging-token'])->postJson($path)->assertStatus(419);
            $wrong = $this->encryptedToken('XSRF-TOKEN-PRODUCTION', 'production-token');
            $this->withHeader('X-XSRF-TOKEN', $wrong)->postJson($path)->assertStatus(419);
            $correct = $this->encryptedToken('XSRF-TOKEN-STAGING', 'staging-token');
            $this->withHeader('X-XSRF-TOKEN', $correct)->postJson($path)->assertNoContent();
            $this->flushHeaders()->withHeader('Origin', 'http://localhost:3000');
        }
    }

    private function encryptedToken(string $name, string $token): string
    {
        $encrypter = $this->app['encrypter'];

        return $encrypter->encrypt(CookieValuePrefix::create($name, $encrypter->getKey()).$token, false);
    }
}

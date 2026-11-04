<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Auth\Events\Verified;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Contracts\Notifications\Dispatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\URL;
use RuntimeException;
use Tests\TestCase;

class EmailVerificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_registration_sends_a_website_verification_link_without_changing_its_contract(): void
    {
        Notification::fake();
        config(['app.frontend_url' => 'https://cards.example']);
        $this->postJson('/register', ['name' => 'New User', 'email' => 'new@example.com', 'password' => 'SecurePassword123!', 'password_confirmation' => 'SecurePassword123!'])
            ->assertCreated()->assertJsonStructure(['message', 'user' => ['id', 'name', 'email']]);
        $user = User::where('email', 'new@example.com')->firstOrFail();
        $this->assertNull($user->email_verified_at);
        Notification::assertSentTo($user, VerifyEmail::class, function (VerifyEmail $notification) use ($user): bool {
            $url = $notification->toMail($user)->actionUrl;
            $this->assertStringStartsWith('https://cards.example/verify-email?', $url);
            parse_str(parse_url($url, PHP_URL_QUERY), $params);
            $endpoint = '/email/verify/'.$params['id'].'/'.$params['hash'].'?'.http_build_query(['expires' => $params['expires'], 'signature' => $params['signature']]);
            $this->getJson($endpoint)->assertOk();
            $this->assertNotNull($user->fresh()->email_verified_at);

            return true;
        });
    }

    public function test_valid_verification_is_idempotent_and_refreshes_me(): void
    {
        $user = User::factory()->unverified()->create();
        Event::fake([Verified::class]);
        $url = $this->link($user);
        $this->actingAs($user)->getJson($url)->assertOk()->assertHeader('Cache-Control', 'no-store, private');
        $this->assertNotNull($user->fresh()->email_verified_at);
        $this->getJson($url)->assertOk();
        Event::assertDispatchedTimes(Verified::class, 1);
        $this->getJson('/api/v1/me')->assertOk()->assertJsonPath('user.email_verified_at', $user->fresh()->email_verified_at->toJSON());
    }

    public function test_guest_and_wrong_account_cannot_verify(): void
    {
        $owner = User::factory()->unverified()->create();
        $url = $this->link($owner);
        $this->getJson($url)->assertUnauthorized();
        $this->postJson('/email/verification-notification')->assertUnauthorized();
        $this->actingAs(User::factory()->create())->getJson($url)->assertForbidden();
        $this->assertNull($owner->fresh()->email_verified_at);
    }

    public function test_tampered_expired_and_changed_email_links_are_rejected(): void
    {
        $this->freezeTime();
        $user = User::factory()->unverified()->create();
        $url = $this->link($user);
        $this->actingAs($user)->getJson($url.'tampered')->assertForbidden();
        $this->travel(61)->minutes();
        $this->getJson($url)->assertForbidden();
        $new = $this->link($user);
        $user->update(['email' => 'changed@example.com']);
        $this->getJson($new)->assertForbidden();
        $this->assertNull($user->fresh()->email_verified_at);
    }

    public function test_resend_is_throttled_and_skips_verified_users(): void
    {
        Notification::fake();
        $user = User::factory()->unverified()->create();
        $this->actingAs($user)->postJson('/email/verification-notification')->assertOk();
        $this->postJson('/email/verification-notification')->assertTooManyRequests()->assertHeader('Retry-After');
        Notification::assertSentToTimes($user, VerifyEmail::class, 1);
        $verified = User::factory()->create();
        $this->actingAs($verified)->postJson('/email/verification-notification')->assertOk()->assertJsonPath('message', 'Your email is already verified.');
        Notification::assertNotSentTo($verified, VerifyEmail::class);
    }

    public function test_mail_failure_does_not_undo_registration_and_resend_returns_retryable_error(): void
    {
        Exceptions::fake();
        $this->mock(Dispatcher::class)->shouldReceive('send')->twice()->andThrow(new RuntimeException('Mail unavailable'));
        $this->postJson('/register', ['name' => 'New User', 'email' => 'new@example.com', 'password' => 'SecurePassword123!', 'password_confirmation' => 'SecurePassword123!'])->assertCreated();
        $this->assertAuthenticated();
        $this->postJson('/email/verification-notification')->assertStatus(503);
        Exceptions::assertReported(RuntimeException::class);
        $this->assertDatabaseHas('users', ['email' => 'new@example.com', 'email_verified_at' => null]);
    }

    public function test_unverified_users_can_still_create_and_publish_cards(): void
    {
        $this->actingAs(User::factory()->unverified()->create())->postJson('/api/v1/cards', ['slug' => 'unverified-card', 'display_name' => 'Test User', 'is_published' => true])->assertCreated();
        $this->getJson('/api/v1/public/cards/unverified-card')->assertOk();
    }

    private function link(User $user): string
    {
        return URL::temporarySignedRoute('verification.verify', now()->addMinutes(60), ['id' => $user->id, 'hash' => sha1($user->email)], absolute: false);
    }
}

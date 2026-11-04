<?php

namespace App\Providers;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        ResetPassword::createUrlUsing(fn (User $user, string $token): string => rtrim(config('app.frontend_url'), '/').'/reset-password?'.http_build_query([
            'token' => $token,
            'email' => $user->getEmailForPasswordReset(),
        ]));

        VerifyEmail::createUrlUsing(function (User $user): string {
            $parameters = ['id' => $user->getKey(), 'hash' => sha1($user->getEmailForVerification())];
            $signed = URL::temporarySignedRoute('verification.verify', now()->addMinutes(60), $parameters, absolute: false);
            parse_str(parse_url($signed, PHP_URL_QUERY), $signature);

            return rtrim(config('app.frontend_url'), '/').'/verify-email?'.http_build_query([...$parameters, ...$signature]);
        });

        RateLimiter::for('recovery', fn (Request $request): array => [
            Limit::perMinute(10)->by('recovery-ip:'.$request->ip()),
            Limit::perMinute(3)->by('recovery-email:'.hash('sha256', (is_string($request->input('email')) ? strtolower($request->input('email')) : '').'|'.$request->ip())),
        ]);
        RateLimiter::for('verification', fn (Request $request): Limit => Limit::perMinute(1)->by('verification:'.$request->user()->getAuthIdentifier()));
    }
}

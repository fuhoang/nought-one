<?php

use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Auth\EmailVerificationController;
use App\Http\Controllers\Auth\PasswordResetController;
use App\Http\Middleware\EnsureCurrentSession;
use Illuminate\Support\Facades\Route;

Route::middleware('throttle:10,1')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
});

Route::post('/logout', [AuthController::class, 'logout'])
    ->middleware(['auth:web', EnsureCurrentSession::class]);

Route::middleware('throttle:recovery')->group(function () {
    Route::post('/forgot-password', [PasswordResetController::class, 'store'])->name('password.email');
    Route::post('/reset-password', [PasswordResetController::class, 'update'])->name('password.update');
});

Route::middleware(['auth:web', EnsureCurrentSession::class])->group(function () {
    Route::post('/email/verification-notification', [EmailVerificationController::class, 'store'])
        ->middleware('throttle:verification')->name('verification.send');
    Route::get('/email/verify/{id}/{hash}', [EmailVerificationController::class, 'show'])
        ->middleware(['signed:relative', 'throttle:10,1'])->name('verification.verify');
});

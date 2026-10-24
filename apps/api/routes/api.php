<?php

use App\Http\Controllers\Api\V1\CardController;
use App\Http\Controllers\Api\V1\PublicCardController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Route::get('/user', function (Request $request) {
//     return $request->user();
// })->middleware('auth:sanctum');

Route::get('/v1/health', function () {
    return response()->json([
        'status' => 'ok',
        'service' => 'nought-one-api',
    ]);
});

Route::prefix('v1')->group(function () {
    Route::middleware('auth:sanctum')->get('/me', function (Request $request) {
        return response()->json([
            'user' => $request->user()->only(
                'id',
                'name',
                'email',
                'email_verified_at'
            ),
        ]);
    });
});

Route::prefix('v1')->name('api.v1.')->group(function () {
    Route::get('/public/cards/{slug}', PublicCardController::class)->name('public.cards.show');

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/cards', [CardController::class, 'index'])->name('cards.index');
        Route::post('/cards', [CardController::class, 'store'])->name('cards.store');
        Route::get('/cards/{card}', [CardController::class, 'show'])->whereUuid('card')->name('cards.show');
        Route::patch('/cards/{card}', [CardController::class, 'update'])->whereUuid('card')->name('cards.update');
        Route::delete('/cards/{card}', [CardController::class, 'destroy'])->whereUuid('card')->name('cards.destroy');
    });
});

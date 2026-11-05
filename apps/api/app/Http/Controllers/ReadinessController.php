<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Throwable;

class ReadinessController extends Controller
{
    public function __invoke(): JsonResponse
    {
        try {
            DB::connection()->select('select 1');
            Cache::get('deployment-readiness');
        } catch (Throwable) {
            return response()->json(['status' => 'unavailable'], 503)->header('Cache-Control', 'no-store');
        }

        return response()->json(['status' => 'ok'])->header('Cache-Control', 'no-store');
    }
}

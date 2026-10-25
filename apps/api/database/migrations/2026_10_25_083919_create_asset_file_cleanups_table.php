<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('asset_file_cleanups', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('disk', 100);
            $table->string('storage_key', 500);
            $table->timestamp('available_at')->index();
            $table->unsignedInteger('attempts')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('asset_file_cleanups');
    }
};

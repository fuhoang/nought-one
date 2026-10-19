
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('card_assets', function (Blueprint $table) {
            $table->uuid('id')->primary();

            $table->foreignUuid('card_id')
                ->constrained('cards')
                ->cascadeOnDelete();

            $table->string('type', 30);
            $table->string('storage_key', 500);
            $table->string('mime_type', 100);
            $table->unsignedBigInteger('file_size');

            $table->timestamps();

            $table->index(['card_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('card_assets');
    }
};

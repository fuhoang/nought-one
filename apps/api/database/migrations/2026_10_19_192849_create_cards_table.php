
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cards', function (Blueprint $table) {
            $table->uuid('id')->primary();

            $table->foreignUuid('user_id')
                ->constrained('users')
                ->cascadeOnDelete();

            $table->string('slug', 100)->unique();

            $table->string('display_name', 150);
            $table->string('job_title', 150)->nullable();
            $table->string('company', 150)->nullable();

            $table->text('bio')->nullable();

            $table->string('phone', 30)->nullable();
            $table->string('email')->nullable();
            $table->string('website', 2048)->nullable();
            $table->string('location')->nullable();

            $table->string('template_key', 50)
                ->default('minimal');

            $table->jsonb('theme_settings')->nullable();

            $table->boolean('is_published')->default(false);

            $table->timestamps();

            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cards');
    }
};

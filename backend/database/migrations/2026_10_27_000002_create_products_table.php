<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table): void {
            $table->id(); $table->foreignId('user_id')->constrained()->cascadeOnDelete(); $table->string('name', 120); $table->string('sku', 80); $table->string('category', 80)->default('Uncategorized'); $table->unsignedInteger('quantity')->default(0); $table->decimal('price', 12, 2)->default(0); $table->unsignedInteger('reorder_level')->default(5); $table->timestamps(); $table->unique(['user_id', 'sku']);
        });
    }
    public function down(): void { Schema::dropIfExists('products'); }
};

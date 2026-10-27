<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Product extends Model
{
    protected $fillable = ['name', 'sku', 'category', 'quantity', 'price', 'reorder_level'];

    protected function casts(): array
    {
        return ['quantity' => 'integer', 'price' => 'decimal:2', 'reorder_level' => 'integer'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}

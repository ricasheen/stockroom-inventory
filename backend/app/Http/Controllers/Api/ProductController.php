<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProductController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json($request->user()->products()->latest()->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:120'], 'sku' => ['required', 'string', 'max:80', Rule::unique('products', 'sku')->where('user_id', $request->user()->id)], 'category' => ['nullable', 'string', 'max:80'], 'quantity' => ['required', 'integer', 'min:0'], 'price' => ['required', 'numeric', 'min:0'], 'reorder_level' => ['required', 'integer', 'min:0']]);
        $data['category'] = $data['category'] ?? 'Uncategorized';
        $product = $request->user()->products()->create($data);
        return response()->json($product, 201);
    }

    public function update(Request $request, Product $product): JsonResponse
    {
        abort_unless($product->user_id === $request->user()->id, 404);
        $data = $request->validate(['name' => ['sometimes', 'required', 'string', 'max:120'], 'sku' => ['sometimes', 'required', 'string', 'max:80', Rule::unique('products', 'sku')->where('user_id', $request->user()->id)->ignore($product->id)], 'category' => ['sometimes', 'nullable', 'string', 'max:80'], 'quantity' => ['sometimes', 'required', 'integer', 'min:0'], 'price' => ['sometimes', 'required', 'numeric', 'min:0'], 'reorder_level' => ['sometimes', 'required', 'integer', 'min:0']]);
        if (array_key_exists('category', $data) && $data['category'] === null) $data['category'] = 'Uncategorized';
        $product->update($data);
        return response()->json($product->refresh());
    }

    public function destroy(Request $request, Product $product): JsonResponse
    {
        abort_unless($product->user_id === $request->user()->id, 404);
        $product->delete();
        return response()->json(['message' => 'Product deleted.']);
    }
}

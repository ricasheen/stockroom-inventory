<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\Sale;
use Carbon\CarbonPeriod;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class SalesController extends Controller
{
    public function analytics(Request $request): JsonResponse
    {
        $period = $request->query('period', 'week');
        abort_unless(in_array($period, ['week', 'month'], true), 422, 'Choose a 7-day or 30-day period.');

        $days = $period === 'month' ? 30 : 7;
        $today = now()->startOfDay();
        $start = $today->copy()->subDays($days - 1);
        $userId = $request->user()->id;

        $dailyRows = Sale::query()
            ->where('user_id', $userId)
            ->where('created_at', '>=', $start)
            ->selectRaw('DATE(created_at) as sale_date, SUM(total) as revenue, SUM(quantity) as units_sold, COUNT(*) as sales_count')
            ->groupBy('sale_date')
            ->get()
            ->keyBy('sale_date');

        $daily = [];
        foreach (CarbonPeriod::create($start, $today) as $date) {
            $dateKey = $date->toDateString();
            $row = $dailyRows->get($dateKey);
            $daily[] = [
                'date' => $dateKey,
                'label' => $period === 'month' ? $date->format('M j') : $date->format('D'),
                'revenue' => (float) ($row->revenue ?? 0),
                'units_sold' => (int) ($row->units_sold ?? 0),
                'sales_count' => (int) ($row->sales_count ?? 0),
            ];
        }

        $topProducts = Sale::query()
            ->where('user_id', $userId)
            ->where('created_at', '>=', $start)
            ->select('product_name as name')
            ->selectRaw('SUM(quantity) as units_sold, SUM(total) as revenue')
            ->groupBy('product_name')
            ->orderByDesc('units_sold')
            ->limit(5)
            ->get();

        $recent = Sale::query()
            ->with('product:id,name,sku')
            ->where('user_id', $userId)
            ->where('created_at', '>=', $start)
            ->latest()
            ->limit(8)
            ->get()
            ->map(fn (Sale $sale): array => [
                'id' => $sale->id,
                'product_name' => $sale->product?->name ?? $sale->product_name,
                'sku' => $sale->product?->sku ?? '',
                'quantity' => $sale->quantity,
                'unit_price' => (float) $sale->unit_price,
                'total' => (float) $sale->total,
                'created_at' => $sale->created_at?->toIso8601String(),
            ]);

        return response()->json([
            'period' => $period,
            'totals' => [
                'revenue' => array_sum(array_column($daily, 'revenue')),
                'units_sold' => array_sum(array_column($daily, 'units_sold')),
                'sales_count' => array_sum(array_column($daily, 'sales_count')),
            ],
            'daily' => $daily,
            'top_products' => $topProducts,
            'recent' => $recent,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'product_id' => ['required', 'integer', 'exists:products,id'],
            'quantity' => ['required', 'integer', 'min:1'],
            'unit_price' => ['required', 'numeric', 'min:0', 'max:9999999999.99'],
        ]);

        $sale = DB::transaction(function () use ($request, $data): Sale {
            $product = Product::query()
                ->where('user_id', $request->user()->id)
                ->whereKey($data['product_id'])
                ->lockForUpdate()
                ->firstOrFail();

            if ($product->quantity < $data['quantity']) {
                throw ValidationException::withMessages([
                    'quantity' => ['The sale quantity is greater than the stock available.'],
                ]);
            }

            $product->decrement('quantity', $data['quantity']);
            $unitPrice = (float) $data['unit_price'];

            return $request->user()->sales()->create([
                'product_id' => $product->id,
                'product_name' => $product->name,
                'quantity' => $data['quantity'],
                'unit_price' => number_format($unitPrice, 2, '.', ''),
                'total' => number_format($unitPrice * $data['quantity'], 2, '.', ''),
            ]);
        });

        return response()->json([
            'message' => 'Sale recorded.',
            'sale' => $sale->load('product:id,name,sku'),
            'remaining_quantity' => Product::find($sale->product_id)?->quantity ?? 0,
        ], 201);
    }
}

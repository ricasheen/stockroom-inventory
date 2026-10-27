"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";

type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  price: number;
  reorderLevel: number;
};

type ProductForm = Omit<Product, "id" | "price"> & { price: string };
type SalesReportRow = { productId: string; productName: string; unitsSold: number; revenue: number | null };
type SalesTrendRow = { label: string; unitsSold: number; revenue: number; grossProfit: number };
type UserProfile = { displayName: string; storeName: string; imageDataUrl: string };
type ActivityEntry = { id: string; actorLabel: string; action: string; summary: string; createdAt: string };

const emptyForm: ProductForm = { name: "", sku: "", category: "", quantity: 0, price: "", reorderLevel: 5 };
const legacyStorageKey = "stockroom-products-v1";
const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 2 });

function Icon({ name }: { name: "grid" | "box" | "alert" | "settings" | "search" | "plus" | "close" | "chart" | "clock" | "chevron-left" | "chevron-right" }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    box: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="M3 8v9l9 5 9-5V8M12 13v9" /></>,
    alert: <><path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.6-1.4-2.4L7.3 15a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4-1.4 1.1a8 8 0 0 1-.1 2Z" transform="translate(-1 -1)" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    chart: <><path d="M4 19V5m0 14h16" /><path d="m7 15 4-4 3 2 5-6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    "chevron-left": <path d="m15 18-6-6 6-6" />,
    "chevron-right": <path d="m9 18 6-6-6-6" />,
  };
  return <svg {...common} aria-hidden="true">{paths[name]}</svg>;
}

function statusFor(product: Product) {
  if (product.quantity === 0) return { label: "Out of stock", className: "bg-rose-50 text-rose-700" };
  if (product.quantity <= product.reorderLevel) return { label: "Low stock", className: "bg-amber-50 text-amber-800" };
  return { label: "In stock", className: "bg-emerald-50 text-emerald-700" };
}

function categoryTone(category: string) {
  const tones = [
    "bg-lime-100 text-green-950",
    "bg-lime-200 text-green-950",
    "bg-lime-300 text-green-950",
    "bg-green-100 text-green-900",
    "bg-green-200 text-green-900",
    "bg-emerald-100 text-emerald-900",
    "bg-[#d4ed55] text-[#216c38]",
    "bg-[#a6d84b] text-[#216c38]",
  ];
  let hash = 0;
  for (let index = 0; index < category.length; index += 1) hash = (hash * 31 + category.charCodeAt(index)) >>> 0;
  return tones[hash % tones.length];
}

export default function Home() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All items");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState("home");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<"all" | "sign-ins" | "changes">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [salesPeriod, setSalesPeriod] = useState<"week" | "month">("month");
  const [salesReport, setSalesReport] = useState<SalesReportRow[]>([]);
  const [trendPeriod, setTrendPeriod] = useState<"week" | "month">("week");
  const [trendMetric, setTrendMetric] = useState<"revenue" | "unitsSold" | "grossProfit">("revenue");
  const [salesTrends, setSalesTrends] = useState<SalesTrendRow[]>([]);
  const [saleProduct, setSaleProduct] = useState<Product | null>(null);
  const [saleQuantity, setSaleQuantity] = useState(1);
  const [saleSellingPrice, setSaleSellingPrice] = useState("");
  const [profile, setProfile] = useState<UserProfile>({ displayName: "", storeName: "", imageDataUrl: "" });
  const [profileDraft, setProfileDraft] = useState<UserProfile>({ displayName: "", storeName: "", imageDataUrl: "" });
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    if (sessionPending) return;
    if (!session?.user.id) {
      setProducts([]);
      setProductsLoading(false);
      return;
    }
    let active = true;
    setProductsLoading(true);
    void (async () => {
      try {
        const response = await fetch("/api/products");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load inventory.");
        let loaded = data as Product[];

        // Bring forward products saved by the earlier browser-only prototype.
        if (loaded.length === 0) {
          const legacy = localStorage.getItem(legacyStorageKey);
          if (legacy) {
            const previousProducts = JSON.parse(legacy) as Product[];
            const imported: Product[] = [];
            for (const { id: _oldId, ...product } of previousProducts) {
              const importResponse = await fetch("/api/products", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(product),
              });
              if (importResponse.ok) imported.push(await importResponse.json() as Product);
              else if (importResponse.status !== 409) throw new Error("Could not import your saved browser inventory.");
            }
            localStorage.removeItem(legacyStorageKey);
            loaded = imported;
          }
        }
        if (active) setProducts(loaded);
      } catch (error: unknown) {
        if (active) setNotice(error instanceof Error ? error.message : "Could not load inventory.");
      } finally {
        if (active) setProductsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [session?.user.id, sessionPending]);

  useEffect(() => {
    if (!session?.user.id) return;
    let active = true;
    void fetch(`/api/sales?period=${salesPeriod}`).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load sales report.");
      if (active) setSalesReport(data as SalesReportRow[]);
    }).catch((error: unknown) => {
      if (active) setNotice(error instanceof Error ? error.message : "Could not load sales report.");
    });
    return () => { active = false; };
  }, [session?.user.id, salesPeriod]);

  useEffect(() => {
    if (!session?.user.id) return;
    let active = true;
    void fetch(`/api/sales/trends?period=${trendPeriod}`).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load sales trends.");
      if (active) setSalesTrends(data as SalesTrendRow[]);
    }).catch((error: unknown) => {
      if (active) setNotice(error instanceof Error ? error.message : "Could not load sales trends.");
    });
    return () => { active = false; };
  }, [session?.user.id, trendPeriod]);

  useEffect(() => {
    if (!session?.user.id) return;
    let active = true;
    void fetch("/api/profile").then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load your profile.");
      if (active) setProfile(data as UserProfile);
    }).catch((error: unknown) => {
      if (active) setNotice(error instanceof Error ? error.message : "Could not load your profile.");
    });
    return () => { active = false; };
  }, [session?.user.id]);

  useEffect(() => {
    if (!session?.user.id) return;
    let active = true;
    void fetch("/api/activity", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load history.");
      if (active) setActivity(data as ActivityEntry[]);
    }).catch((error: unknown) => {
      if (active) setNotice(error instanceof Error ? error.message : "Could not load history.");
    });
    return () => { active = false; };
  }, [session?.user.id]);

  const lowStock = products.filter((product) => product.quantity <= product.reorderLevel);
  const inventoryValue = products.reduce((sum, product) => sum + product.price * product.quantity, 0);
  const categories = ["All items", ...Array.from(new Set(products.map((product) => product.category).filter(Boolean)))];
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesQuery = !query || `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(query);
      const matchesFilter = filter === "All items" || product.category === filter;
      return matchesQuery && matchesFilter;
    });
  }, [filter, products, search]);
  const displayedProducts = activeSection === "low-stock"
    ? filteredProducts.filter((product) => product.quantity <= product.reorderLevel)
    : filteredProducts;
  const trendValues = salesTrends.map((row) => trendMetric === "grossProfit" ? Math.abs(row[trendMetric]) : row[trendMetric]);
  const trendMax = Math.max(0, ...trendValues);
  const currentTrend = salesTrends[salesTrends.length - 1];
  const previousTrend = salesTrends[salesTrends.length - 2];
  const currentTrendValue = currentTrend?.[trendMetric] ?? 0;
  const previousTrendValue = previousTrend?.[trendMetric] ?? 0;
  const trendDifference = currentTrendValue - previousTrendValue;
  const trendChangePercent = previousTrendValue > 0 ? Math.round((trendDifference / previousTrendValue) * 100) : null;

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function navigateTo(section: string, filterBy?: string) {
    if (filterBy) setFilter(filterBy);
    setActiveSection(section);
    if (section === "history") void refreshActivity();
  }

  function openEdit(product: Product) {
    setEditingId(product.id);
    const { id: _id, ...values } = product;
    setForm({ ...values, price: String(values.price) });
    setModalOpen(true);
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    const cleaned = { ...form, name: form.name.trim(), sku: form.sku.trim(), category: form.category.trim() || "Uncategorized", price: Number(form.price) };
    try {
      const response = await fetch(editingId ? `/api/products/${editingId}` : "/api/products", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleaned),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save product.");
      if (editingId) setProducts((current) => current.map((product) => product.id === editingId ? data as Product : product));
      else setProducts((current) => [data as Product, ...current]);
      setModalOpen(false);
      await refreshActivity();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save product.");
    }
  }

  async function adjustStock(id: string, change: number) {
    const product = products.find((item) => item.id === id);
    if (!product) return;
    const updated = { ...product, quantity: Math.max(0, product.quantity + change) };
    try {
      const response = await fetch(`/api/products/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updated) });
      const data = await response.json();
      if (!response.ok) { setNotice(data.error || "Could not update stock."); return; }
      setProducts((current) => current.map((item) => item.id === id ? data as Product : item));
      await refreshActivity();
    } catch {
      setNotice("Could not reach the local database. Try again.");
    }
  }

  async function deleteProduct(id: string) {
    if (window.confirm("Remove this product from your inventory?")) {
      try {
        const response = await fetch(`/api/products/${id}`, { method: "DELETE" });
        const data = await response.json();
        if (!response.ok) { setNotice(data.error || "Could not remove product."); return; }
        setProducts((current) => current.filter((product) => product.id !== id));
        await refreshActivity();
      } catch {
        setNotice("Could not reach the local database. Try again.");
      }
    }
  }

  async function refreshActivity() {
    const response = await fetch("/api/activity", { cache: "no-store" });
    const data = await response.json();
    if (response.ok) setActivity(data as ActivityEntry[]);
  }

  async function recordSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!saleProduct) return;
    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: saleProduct.id, quantity: saleQuantity, sellingPrice: Number(saleSellingPrice) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not record sale.");
      setProducts((current) => current.map((item) => item.id === saleProduct.id ? { ...item, quantity: data.remaining } : item));
      setSaleProduct(null);
      setNotice("");
      const reportResponse = await fetch(`/api/sales?period=${salesPeriod}`);
      const reportData = await reportResponse.json();
      if (reportResponse.ok) setSalesReport(reportData as SalesReportRow[]);
      const activityResponse = await fetch("/api/activity", { cache: "no-store" });
      const activityData = await activityResponse.json();
      if (activityResponse.ok) setActivity(activityData as ActivityEntry[]);
      const trendResponse = await fetch(`/api/sales/trends?period=${trendPeriod}`);
      const trendData = await trendResponse.json();
      if (trendResponse.ok) setSalesTrends(trendData as SalesTrendRow[]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not record sale.");
    }
  }

  function openProfile() {
    setProfileDraft(profile);
    setProfileOpen(true);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileSaving(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileDraft),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save your profile.");
      setProfile(data as UserProfile);
      setProfileOpen(false);
      setNotice("");
      await refreshActivity();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save your profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function chooseProfileImage(file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setNotice("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > 1_000_000) {
      setNotice("Choose an image under 1 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setProfileDraft((current) => ({ ...current, imageDataUrl: String(reader.result || "") }));
    reader.readAsDataURL(file);
  }

  if (sessionPending) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading Stockroom…</div>;
  if (!session) return <AccountScreen />;
  if (productsLoading) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading your inventory…</div>;

  const sectionTitles: Record<string, string> = {
    home: "Overview",
    products: "Products",
    "manage-products": "Manage products",
    "low-stock": "Low stock",
    "sales-trends": "Sales trends",
    "best-sellers": "Best sellers",
    history: "History",
  };
  const sectionTitle = sectionTitles[activeSection] || "Overview";

  return (
    <div className="dashboard-shell min-h-screen text-slate-900">
      <aside className={`dashboard-sidebar fixed inset-y-0 left-0 z-20 hidden flex-col border-r border-slate-200 bg-white py-7 transition-[width,padding] duration-200 lg:flex ${sidebarCollapsed ? "w-[76px] px-3" : "w-[248px] px-5"}`}>
        <a href="#home" onClick={() => navigateTo("home", "All items")} title="Stockroom home" className={`mb-8 flex items-center gap-3 ${sidebarCollapsed ? "justify-center" : "px-2"}`}>
          <span className="brand-mark flex h-10 w-10 items-center justify-center rounded-xl text-white"><Icon name="box" /></span>
          {!sidebarCollapsed && <span><span className="block text-lg font-bold tracking-tight">Stockroom</span><span className="text-xs text-slate-500">Inventory, made simple</span></span>}
        </a>
        <button onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} aria-expanded={!sidebarCollapsed} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} className="sidebar-collapse-toggle absolute -right-3 top-[92px] z-30 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md transition hover:scale-110 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"><Icon name={sidebarCollapsed ? "chevron-right" : "chevron-left"} /></button>
        <div className={`mb-3 flex items-center ${sidebarCollapsed ? "justify-center" : "px-3"}`}>
          {!sidebarCollapsed && <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Workspace</p>}
        </div>
        <nav className="space-y-1">
          <button onClick={() => navigateTo("home", "All items")} title="Overview" className={`flex w-full items-center rounded-lg py-2.5 text-sm font-medium ${sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3 text-left"} ${activeSection === "home" ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-50"}`}><Icon name="grid" />{!sidebarCollapsed && "Overview"}</button>
          <button onClick={() => navigateTo("products", "All items")} title="Products" className={`flex w-full items-center rounded-lg py-2.5 text-sm font-medium ${sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3 text-left"} ${activeSection === "products" ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-50"}`}><Icon name="box" />{!sidebarCollapsed && <>Products<span className="ml-auto text-xs text-slate-400">{products.length}</span></>}</button>
          <button onClick={() => navigateTo("manage-products", "All items")} title="Manage products" className={`flex w-full items-center rounded-lg py-2.5 text-sm font-medium ${sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3 text-left"} ${activeSection === "manage-products" ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-50"}`}><Icon name="settings" />{!sidebarCollapsed && <>Manage products<span className="ml-auto text-xs text-slate-400">{products.length}</span></>}</button>
          <button onClick={() => navigateTo("low-stock", "All items")} title="Low stock" className={`flex w-full items-center rounded-lg py-2.5 text-sm font-medium ${sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3 text-left"} ${activeSection === "low-stock" ? "bg-amber-50 text-amber-800" : "text-slate-600 hover:bg-slate-50"}`}><Icon name="alert" />{!sidebarCollapsed && <>Low stock{lowStock.length > 0 && <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{lowStock.length}</span>}</>}</button>
          <button onClick={() => navigateTo("sales-trends")} title="Sales trends" className={`flex w-full items-center rounded-lg py-2.5 text-sm font-medium ${sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3 text-left"} ${activeSection === "sales-trends" ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-50"}`}><Icon name="chart" />{!sidebarCollapsed && "Sales trends"}</button>
          <button onClick={() => navigateTo("best-sellers")} title="Best sellers" className={`flex w-full items-center rounded-lg py-2.5 text-sm font-medium ${sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3 text-left"} ${activeSection === "best-sellers" ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-50"}`}><Icon name="chart" />{!sidebarCollapsed && "Best sellers"}</button>
          <button onClick={() => navigateTo("history")} title="History" className={`flex w-full items-center rounded-lg py-2.5 text-sm font-medium ${sidebarCollapsed ? "justify-center px-0" : "gap-3 px-3 text-left"} ${activeSection === "history" ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-50"}`}><Icon name="clock" />{!sidebarCollapsed && "History"}</button>
        </nav>
        <div title={sidebarCollapsed ? "Your products are saved in this app’s local database under your account." : undefined} className={`sidebar-note mt-auto rounded-xl ${sidebarCollapsed ? "flex justify-center p-3" : "p-4"}`}>
          <div className={`mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700 ${sidebarCollapsed ? "mb-0" : ""}`}><Icon name="settings" />{!sidebarCollapsed && "Your data stays here"}</div>
          {!sidebarCollapsed && <p className="text-xs leading-5 text-slate-600">Your products are saved in this app’s local database under your account.</p>}
        </div>
      </aside>

      <main id="home" className={`dashboard-main mx-auto min-h-screen max-w-[1440px] px-5 py-7 sm:px-8 lg:px-10 lg:py-10 ${sidebarCollapsed ? "lg:ml-[76px]" : "lg:ml-[248px]"}`}>
        <header className="mb-9 flex flex-wrap items-center justify-between gap-4">
          <div className="lg:hidden flex items-center gap-2 font-bold"><span className="brand-mark flex h-9 w-9 items-center justify-center rounded-lg text-white"><Icon name="box" /></span>Stockroom</div>
          <div className="hidden lg:block"><p className="text-sm text-slate-500">Workspace / <span className="text-slate-800">{sectionTitle}</span></p></div>
          <div className="flex w-full items-center justify-between gap-3 lg:w-auto lg:justify-end">
            <div className="relative flex items-center gap-5"><button aria-expanded={accountMenuOpen} aria-haspopup="menu" onClick={() => setAccountMenuOpen((open) => !open)} className="flex min-w-0 max-w-[260px] items-center gap-3 text-left"><span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-50 text-xs font-bold text-emerald-800">{profile.imageDataUrl ? <img src={profile.imageDataUrl} alt="" className="h-full w-full object-cover" /> : (profile.displayName || session.user.email).slice(0, 1).toUpperCase()}</span><span className="hidden min-w-0 sm:block"><span className="block truncate text-sm font-semibold leading-5 text-slate-700">{profile.displayName || session.user.email}</span><span className="block truncate text-xs leading-4 text-slate-400">{profile.storeName || "Account settings"}</span></span></button>{accountMenuOpen && <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"><button role="menuitem" onClick={() => { setAccountMenuOpen(false); openProfile(); }} className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50">Edit profile</button><div className="my-1 border-t border-slate-100" /><button role="menuitem" onClick={() => authClient.signOut()} className="w-full px-4 py-2.5 text-left text-sm font-medium text-rose-700 hover:bg-rose-50">Sign out</button></div>}</div>
            <button onClick={openAdd} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800"><Icon name="plus" /> Add product</button>
          </div>
        </header>

        <section className="welcome-panel mb-8 flex flex-wrap items-end justify-between gap-4">
          <div><p className="mb-2 text-sm font-medium text-emerald-700">{activeSection === "home" ? "INVENTORY OVERVIEW" : "WORKSPACE"}</p><h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-[34px]">{activeSection === "home" ? (profile.storeName ? `Good day ${profile.storeName}!` : "Good day 👋") : sectionTitle}</h1><p className="mt-2 text-sm text-slate-500">{activeSection === "home" ? "Here’s what’s happening with your stock." : `View and manage your ${sectionTitle.toLowerCase()}.`}</p></div>
        </section>

        {notice && <p role="alert" className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{notice}</p>}

        {activeSection === "home" && <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total products" value={String(products.length)} note="Products in your catalog" icon="box" tint="emerald" />
          <StatCard label="Stock on hand" value={String(products.reduce((sum, product) => sum + product.quantity, 0))} note="Units across all products" icon="grid" tint="blue" />
          <StatCard label="Low stock alerts" value={String(lowStock.length)} note={lowStock.length ? "Items need a restock soon" : "Everything is well stocked"} icon="alert" tint="amber" />
          <StatCard label="Inventory value" value={peso.format(inventoryValue)} note="Based on unit cost × quantity" icon="box" tint="violet" />
        </section>}

        {activeSection === "best-sellers" && <section id="best-sellers" className="gradient-surface mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-base font-bold text-slate-900">Best sellers</h2><p className="mt-1 text-xs text-slate-500">Ranked by units sold in the current {salesPeriod}.</p></div>
            <div className="flex gap-2"><button onClick={() => setSalesPeriod("week")} className={`rounded-lg px-3 py-2 text-xs font-semibold ${salesPeriod === "week" ? "bg-emerald-50 text-emerald-800" : "text-slate-500 hover:bg-slate-50"}`}>This week</button><button onClick={() => setSalesPeriod("month")} className={`rounded-lg px-3 py-2 text-xs font-semibold ${salesPeriod === "month" ? "bg-emerald-50 text-emerald-800" : "text-slate-500 hover:bg-slate-50"}`}>This month</button></div>
          </div>
          {salesReport.length ? <div className="divide-y divide-slate-100">{salesReport.slice(0, 5).map((row, index) => <div key={row.productId} className="flex items-center justify-between py-3"><div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-xs font-bold text-emerald-800">{index + 1}</span><span className="text-sm font-semibold text-slate-800">{row.productName}</span></div><div className="text-right"><p className="text-sm font-bold text-slate-800">{row.unitsSold} sold</p><p className="text-xs text-slate-400">{row.revenue === null ? "Revenue not recorded" : peso.format(row.revenue)}</p></div></div>)}</div> : <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No sales recorded this {salesPeriod} yet. Record a sale from a product row to see your best sellers.</p>}
        </section>}

        {activeSection === "sales-trends" && <section className="gradient-surface mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-bold text-slate-900">Sales performance</h2><p className="mt-1 text-xs text-slate-500">Track sales across the last eight weeks or six months.</p></div><div className="flex gap-2"><button onClick={() => setTrendPeriod("week")} className={`rounded-lg px-3 py-2 text-xs font-semibold ${trendPeriod === "week" ? "bg-emerald-50 text-emerald-800" : "text-slate-500 hover:bg-slate-50"}`}>Weeks</button><button onClick={() => setTrendPeriod("month")} className={`rounded-lg px-3 py-2 text-xs font-semibold ${trendPeriod === "month" ? "bg-emerald-50 text-emerald-800" : "text-slate-500 hover:bg-slate-50"}`}>Months</button></div></div>
          <div className="mb-5 flex flex-wrap gap-2">{([['revenue', 'Money from sales'], ['unitsSold', 'Items sold'], ['grossProfit', 'Profit after item cost']] as const).map(([key, label]) => <button key={key} onClick={() => setTrendMetric(key)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${trendMetric === key ? "bg-emerald-700 text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"}`}>{label}</button>)}</div>
          <div className={`mb-5 rounded-xl px-4 py-3 text-sm font-semibold ${trendDifference > 0 ? "bg-emerald-50 text-emerald-800" : trendDifference < 0 ? "bg-rose-50 text-rose-800" : "bg-slate-50 text-slate-600"}`}>
            {previousTrendValue === 0 && currentTrendValue === 0 ? "No sales recorded for this measure yet." : previousTrendValue === 0 ? `Sales were recorded this ${trendPeriod}; the previous ${trendPeriod} had none.` : `${trendMetric === "unitsSold" ? "Items sold" : trendMetric === "revenue" ? "Money from sales" : "Profit after item cost"} ${trendDifference > 0 ? "increased" : trendDifference < 0 ? "decreased" : "stayed the same"} ${trendChangePercent === null ? "" : `${Math.abs(trendChangePercent)}%`} compared with the previous ${trendPeriod === "week" ? "week" : "month"}.`}
          </div>
          {salesTrends.length ? <div className="flex h-56 items-end gap-2 border-b border-l border-slate-200 px-2 pb-1 pt-3 sm:gap-3">{salesTrends.map((row) => { const amount = row[trendMetric]; const scaleAmount = trendMetric === "grossProfit" ? Math.abs(amount) : amount; const height = trendMax > 0 ? Math.max(3, scaleAmount / trendMax * 100) : 3; const display = trendMetric === "unitsSold" ? `${amount} units` : peso.format(amount); const color = trendMetric === "unitsSold" ? "bg-emerald-500" : trendMetric === "revenue" ? "bg-emerald-600" : amount < 0 ? "bg-rose-500" : "bg-green-500"; return <div key={row.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"><span className="max-w-full truncate text-[10px] text-slate-500 sm:text-xs">{trendMax > 0 ? display : "—"}</span><div title={`${row.label}: ${display}`} className={`w-full max-w-12 rounded-t-md ${color}`} style={{ height: `${height}%` }} /><span className="whitespace-nowrap text-[10px] text-slate-500 sm:text-xs">{row.label}</span></div>; })}</div> : <p className="rounded-lg bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">No sales trend data yet. Record sales to start building this chart.</p>}
          <p className="mt-4 text-xs leading-5 text-slate-400">Each bar shows sales for the dates below it. The current {trendPeriod === "week" ? "week" : "month"} is still in progress. “Money from sales” uses the price customers paid. “Profit after item cost” subtracts what you paid for the items, but not rent, wages, or other expenses. Older sales without a recorded selling price count toward items sold, but not money from sales.</p>
        </section>}

        {activeSection === "history" && <section id="history" className="gradient-surface mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4"><h2 className="text-base font-bold text-slate-900">Account history</h2><p className="mt-1 text-xs text-slate-500">Sign-ins, product changes, sales, and profile updates in one place.</p></div>
          <div className="mb-3 flex gap-2 overflow-x-auto border-b border-slate-100 pb-3">{([['all', 'All activity'], ['sign-ins', 'Sign-ins'], ['changes', 'Changes']] as const).map(([key, label]) => <button key={key} onClick={() => setHistoryFilter(key)} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold ${historyFilter === key ? "bg-emerald-50 text-emerald-800" : "text-slate-500 hover:bg-slate-50"}`}>{label}</button>)}</div>
          {(() => {
            const visibleActivity = activity.filter((entry) => historyFilter === "all" || (historyFilter === "sign-ins" ? entry.action === "Signed in" : entry.action !== "Signed in"));
            return visibleActivity.length ? <div className="divide-y divide-slate-100">{visibleActivity.slice(0, 30).map((entry) => <article key={entry.id} className="py-3 first:pt-0 last:pb-0"><div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"><p className="text-sm font-semibold text-slate-800">{entry.action}</p><time className="text-xs text-slate-400" dateTime={entry.createdAt}>{new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(entry.createdAt))}</time></div><p className="mt-1 text-sm text-slate-600">{entry.summary}</p><p className="mt-1 text-xs text-slate-400">Account: {entry.actorLabel}</p></article>)}</div> : <p className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No history in this view yet.</p>;
          })()}
        </section>}

        {(activeSection === "products" || activeSection === "low-stock") && <section id="products" className="gradient-surface overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
            <div><h2 className="text-base font-bold text-slate-900">{activeSection === "low-stock" ? "Low stock products" : "Products"}</h2><p className="mt-1 text-xs text-slate-500">{activeSection === "low-stock" ? "Only items at or below their restock level are shown." : "Manage items and keep stock levels up to date."}</p></div>
            <label className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-slate-400 sm:w-64"><Icon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products..." className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" /></label>
          </div>
          {activeSection === "products" && <div className="flex gap-2 overflow-x-auto border-b border-slate-100 px-5 py-3 sm:px-6">
            {categories.map((category) => <button key={category} onClick={() => setFilter(category)} className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${category === "All items" ? (filter === category ? "bg-emerald-100 text-emerald-900" : "text-slate-500 hover:bg-slate-50") : `${categoryTone(category)} ${filter === category ? "shadow-sm ring-1 ring-current/20" : "opacity-75 hover:opacity-100"}`}`}>{category}</button>)}
          </div>}
          {displayedProducts.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] table-fixed border-collapse text-left">
                <colgroup><col className="w-[22%]" /><col className="w-[13%]" /><col className="w-[11%]" /><col className="w-[13%]" /><col className="w-[17%]" /><col className="w-[12%]" /><col className="w-[12%]" /></colgroup>
                <thead><tr className="bg-slate-50/70 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400"><th className="whitespace-nowrap px-4 py-3">Product</th><th className="whitespace-nowrap px-4 py-3">Product code</th><th className="whitespace-nowrap px-4 py-3">Category</th><th className="whitespace-nowrap px-4 py-3">Unit cost</th><th className="whitespace-nowrap px-4 py-3 text-center">Quantity</th><th className="whitespace-nowrap px-4 py-3 text-center">Actions</th><th className="whitespace-nowrap px-4 py-3 text-center">Status</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedProducts.map((product) => {
                    const status = statusFor(product);
                    return <tr key={product.id} className="transition hover:bg-slate-50/70">
                      <td className="overflow-hidden px-4 py-3"><div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-sm font-bold text-emerald-800">{product.name.slice(0, 1).toUpperCase()}</div><span className="truncate text-sm font-semibold text-slate-800">{product.name}</span></div></td>
                      <td className="overflow-hidden px-4 py-3 font-mono text-xs text-slate-500"><span className="block truncate">{product.sku}</span></td><td className="overflow-hidden px-4 py-3"><span className={`inline-flex max-w-full truncate rounded-full px-2.5 py-1 text-[11px] font-semibold ${categoryTone(product.category || "Uncategorized")}`}>{product.category || "Uncategorized"}</span></td><td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{peso.format(product.price)}</td>
                      <td className="whitespace-nowrap px-4 py-3"><div className="flex items-center justify-center gap-1.5"><button aria-label={`Remove one ${product.name}`} onClick={() => adjustStock(product.id, -1)} className="h-7 w-7 shrink-0 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100">−</button><span className="min-w-6 text-center text-sm font-semibold text-slate-800">{product.quantity}</span><button aria-label={`Add one ${product.name}`} onClick={() => adjustStock(product.id, 1)} className="h-7 w-7 shrink-0 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100">+</button><span className="text-xs text-slate-400">units</span></div></td>
                      <td className="whitespace-nowrap px-4 py-3 text-center"><button disabled={product.quantity < 1} onClick={() => { setSaleProduct(product); setSaleQuantity(1); setSaleSellingPrice(""); }} className="text-xs font-semibold text-emerald-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-300">Record sale</button></td>
                      <td className="whitespace-nowrap px-4 py-3 text-center"><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.className}`}>{status.label}</span></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          ) : <div className="px-6 py-16 text-center"><p className="font-semibold text-slate-800">{activeSection === "low-stock" && lowStock.length === 0 ? "Everything is well stocked" : "No products found"}</p><p className="mt-1 text-sm text-slate-500">{activeSection === "low-stock" && lowStock.length === 0 ? "There are no products at or below their restock levels." : "Try another search or add a product to your inventory."}</p>{activeSection === "products" && <button onClick={openAdd} className="mt-4 text-sm font-semibold text-emerald-800 hover:underline">Add your first product</button>}</div>}
          <footer className="border-t border-slate-100 px-6 py-3 text-xs text-slate-400">Showing {displayedProducts.length} of {activeSection === "low-stock" ? lowStock.length : products.length} products</footer>
        </section>}
        {activeSection === "manage-products" && <section className="gradient-surface overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-6">
            <div><h2 className="text-base font-bold text-slate-900">Manage products</h2><p className="mt-1 text-xs text-slate-500">Edit product details or remove items from your inventory.</p></div>
            <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">{products.length} {products.length === 1 ? "product" : "products"}</span>
          </div>
          {products.length ? <div className="divide-y divide-slate-100 px-5 sm:px-6">{products.map((product) => <article key={product.id} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-50 to-teal-100 text-sm font-bold text-emerald-800">{product.name.slice(0, 1).toUpperCase()}</span><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-900">{product.name}</h3><div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500"><span>{product.sku}</span><span className="text-slate-300">·</span><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${categoryTone(product.category || "Uncategorized")}`}>{product.category || "Uncategorized"}</span><span className="text-slate-300">·</span><span>{product.quantity} in stock</span></div></div></div>
            <div className="flex shrink-0 items-center gap-2 sm:pl-4"><button onClick={() => openEdit(product)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-800 transition hover:border-emerald-300 hover:bg-emerald-100">Edit product</button><button onClick={() => void deleteProduct(product.id)} className="rounded-lg border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50">Remove</button></div>
          </article>)}</div> : <div className="px-6 py-16 text-center"><p className="font-semibold text-slate-800">No products to manage</p><p className="mt-1 text-sm text-slate-500">Add a product to your inventory to get started.</p><button onClick={openAdd} className="mt-4 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800">Add product</button></div>}
        </section>}
        <p className="mt-5 text-center text-xs text-slate-400">Stockroom · A simple way to stay on top of your stock.</p>
      </main>

      {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
        <form onSubmit={saveProduct} className="gradient-surface w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl sm:p-7">
          <div className="mb-6 flex items-start justify-between"><div><h2 className="text-xl font-bold text-slate-900">{editingId ? "Edit product" : "Add a product"}</h2><p className="mt-1 text-sm text-slate-500">Enter the product details and current stock.</p></div><button type="button" aria-label="Close" onClick={() => setModalOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><Icon name="close" /></button></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Product name"><input required autoFocus maxLength={19} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. House Blend" /><span className="mt-1 block text-xs font-normal text-slate-400">Up to 19 characters.</span></Field>
            <Field label="Product code"><input required value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} placeholder="A short ID, e.g. DRK-001" /><span className="mt-1 block text-xs font-normal text-slate-400">A unique code to help identify this product.</span></Field>
            <Field label="Category"><input maxLength={19} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="e.g. Drinks" /><span className="mt-1 block text-xs font-normal text-slate-400">Up to 19 characters.</span></Field>
            <Field label="Quantity"><input required min="0" type="number" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })} /></Field>
            <Field label="Unit cost (₱)"><input required min="0" step="0.01" type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} placeholder="Enter cost per item" /></Field>
            <Field label="Show low-stock alert at"><input required min="0" type="number" value={form.reorderLevel} onChange={(event) => setForm({ ...form, reorderLevel: Number(event.target.value) })} /><span className="mt-1 block text-xs font-normal text-slate-400">Get an alert when stock reaches this many items.</span></Field>
          </div>
          <div className="mt-7 flex justify-end gap-3"><button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button><button type="submit" className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800">{editingId ? "Save changes" : "Add product"}</button></div>
        </form>
      </div>}
      {saleProduct && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSaleProduct(null); }}>
        <form onSubmit={recordSale} className="gradient-surface w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
          <h2 className="text-xl font-bold text-slate-900">Record a sale</h2><p className="mt-1 text-sm text-slate-500">{saleProduct.name} · {saleProduct.quantity} in stock</p>
          <div className="mt-5 space-y-4"><Field label="Quantity sold"><input autoFocus required min="1" max={saleProduct.quantity} type="number" value={saleQuantity} onChange={(event) => setSaleQuantity(Number(event.target.value))} /></Field><Field label="Selling price per item (₱)"><input required min="0" step="0.01" type="number" value={saleSellingPrice} onChange={(event) => setSaleSellingPrice(event.target.value)} placeholder="Enter the price customer paid" /></Field><p className="text-xs text-slate-400">This is the amount charged to the customer, not the unit cost.</p></div>
          <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setSaleProduct(null)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button><button type="submit" className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">Save sale</button></div>
        </form>
      </div>}
      {profileOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}>
        <form onSubmit={saveProfile} className="gradient-surface w-full max-w-md rounded-2xl bg-white p-6 shadow-xl sm:p-7">
          <div className="mb-6 flex items-start justify-between"><div><h2 className="text-xl font-bold text-slate-900">Edit profile</h2><p className="mt-1 text-sm text-slate-500">Set your name, shop, and profile picture.</p></div><button type="button" aria-label="Close" onClick={() => setProfileOpen(false)} className="rounded-lg px-2 py-1 text-xl text-slate-400 hover:bg-slate-100">×</button></div>
          <div className="mb-5 flex items-center gap-4"><span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-emerald-50 text-xl font-bold text-emerald-800">{profileDraft.imageDataUrl ? <img src={profileDraft.imageDataUrl} alt="Profile preview" className="h-full w-full object-cover" /> : (profileDraft.displayName || session.user.email).slice(0, 1).toUpperCase()}</span><div><label className="block cursor-pointer text-sm font-semibold text-emerald-800 hover:underline">Upload picture<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => void chooseProfileImage(event.target.files?.[0])} /></label><p className="mt-1 text-xs text-slate-400">PNG, JPEG, or WebP · up to 1 MB</p>{profileDraft.imageDataUrl && <button type="button" onClick={() => setProfileDraft((current) => ({ ...current, imageDataUrl: "" }))} className="mt-1 text-xs text-slate-500 hover:text-rose-700">Remove picture</button>}</div></div>
          <div className="space-y-4"><Field label="Your name"><input maxLength={100} value={profileDraft.displayName} onChange={(event) => setProfileDraft({ ...profileDraft, displayName: event.target.value })} placeholder={session.user.name || "Your name"} /></Field><Field label="Company or store name"><input maxLength={140} value={profileDraft.storeName} onChange={(event) => setProfileDraft({ ...profileDraft, storeName: event.target.value })} placeholder="e.g. Rica's Store" /></Field><Field label="Account email"><input value={session.user.email} disabled /></Field></div>
          <div className="mt-7 flex justify-end gap-3"><button type="button" onClick={() => setProfileOpen(false)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button><button disabled={profileSaving} type="submit" className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{profileSaving ? "Saving…" : "Save profile"}</button></div>
        </form>
      </div>}
    </div>
  );
}

function AccountScreen() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = mode === "sign-up"
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) setError(result.error.message || "Could not sign in. Check your details and try again.");
    } catch {
      setError("Could not reach the local server. Check that the app is running and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell flex min-h-screen items-center justify-center px-5 py-12">
      <section className="auth-card w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <div className="mb-8 flex items-center gap-3"><span className="brand-mark flex h-11 w-11 items-center justify-center rounded-xl text-white"><Icon name="box" /></span><div><p className="text-lg font-bold text-slate-900">Stockroom</p><p className="text-xs text-slate-500">Simple inventory for small shops</p></div></div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">{mode === "sign-in" ? "Welcome back" : "Create your account"}</h1>
        <p className="mt-2 text-sm text-slate-500">{mode === "sign-in" ? "Sign in to manage your inventory." : "Start keeping your stock organized."}</p>
        <form onSubmit={submit} className="mt-7 space-y-4">
          {mode === "sign-up" && <Field label="Your name"><input required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Shop owner" /></Field>}
          <Field label="Email"><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></Field>
          <Field label="Password"><input required minLength={8} type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></Field>
          {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-800">{error}</p>}
          <button disabled={busy} className="w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">{busy ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}</button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-500">{mode === "sign-in" ? "New to Stockroom?" : "Already have an account?"}{" "}<button onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setError(""); }} className="font-semibold text-emerald-800 hover:underline">{mode === "sign-in" ? "Create account" : "Sign in"}</button></p>
        <p className="mt-7 text-center text-xs leading-5 text-slate-400">Your account and inventory are stored in the local database for this development setup.</p>
      </section>
    </main>
  );
}

function StatCard({ label, value, note, icon, tint }: { label: string; value: string; note: string; icon: "box" | "grid" | "alert"; tint: "emerald" | "blue" | "amber" | "violet" }) {
  const colors = { emerald: "bg-emerald-50 text-emerald-700", blue: "bg-green-50 text-green-700", amber: "bg-green-50 text-green-700", violet: "bg-emerald-50 text-emerald-700" };
  return <article className={`gradient-surface stat-card stat-${tint} rounded-xl border border-slate-200 bg-white p-5 shadow-sm`}><div className="mb-4 flex items-center justify-between"><p className="text-sm font-medium text-slate-500">{label}</p><span className={`flex h-9 w-9 items-center justify-center rounded-lg ${colors[tint]}`}><Icon name={icon} /></span></div><p className="text-2xl font-bold tracking-tight text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-400">{note}</p></article>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1.5 text-sm font-medium text-slate-700">{label}<span className="block [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-slate-200 [&_input]:px-3 [&_input]:py-2.5 [&_input]:text-sm [&_input]:font-normal [&_input]:text-slate-800 [&_input]:outline-none [&_input]:focus:border-emerald-600 [&_input]:focus:ring-2 [&_input]:focus:ring-emerald-100">{children}</span></label>;
}

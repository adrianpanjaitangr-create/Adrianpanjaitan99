import React, { useEffect, useState, useRef } from "react";

// Portfolio Dashboard (single-file React component)
// - Tailwind CSS classes used for styling (no imports needed here)
// - Uses localStorage to persist holdings
// - Supports fetching realtime prices from TwelveData API (configurable)
// - Uses recharts for charts (assumes recharts is available in project)
// - Default export is the Dashboard component

// NOTE for deployment / local run:
// 1) Install dependencies: react, react-dom, recharts, axios, tailwindcss (optional if your project already has Tailwind).
//    npm i axios recharts
// 2) Provide a TwelveData API key (free tier available) and set provider to 'twelvedata' in settings.
//    Twelve Data price endpoint example: https://api.twelvedata.com/price?symbol=BMRI.JK&apikey=YOUR_KEY
//    For other providers change fetchPrice implementation accordingly.
// 3) Symbol format used here expects the exchange suffix (e.g. ":" or ".JK" depending on provider). For IDX you may use "BBRI.JK", "BMRI.JK".
// 4) This component is intentionally single-file to be easy to paste into a CRA/Vite React app.

import axios from "axios";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

const STORAGE_KEY = "portfolio_holdings_v1";
const SETTINGS_KEY = "portfolio_settings_v1";

const DEFAULT_SETTINGS = {
  provider: "twelvedata", // currently supported: 'twelvedata'
  apiKey: "", // put your API key here
  priceSuffix: ".JK", // default suffix for IDX tickers
  refreshIntervalSec: 60, // how often to refresh prices
};

function currencyFormat(num) {
  if (num === null || num === undefined || Number.isNaN(num)) return "-";
  return new Intl.NumberFormat("id-ID").format(Math.round(num));
}

function percentFormat(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return `${(n * 100).toFixed(2)}%`;
}

export default function PortfolioDashboard() {
  const [holdings, setHoldings] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  });

  const [settings, setSettings] = useState(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? JSON.parse(raw) : DEFAULT_SETTINGS;
    } catch (e) {
      return DEFAULT_SETTINGS;
    }
  });

  const [form, setForm] = useState({
    symbol: "",
    name: "",
    qty: "",
    priceBuy: "",
    dateBuy: "",
    sector: "",
  });

  const [loadingPrices, setLoadingPrices] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);

  // Save holdings to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
  }, [holdings]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    // fetch prices immediately on mount
    fetchAllPrices();
    // set interval
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetchAllPrices, (settings.refreshIntervalSec || 60) * 1000);
    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  async function fetchPrice(symbol) {
    // symbol must include suffix if needed (we append if missing)
    let querySymbol = symbol;
    if (settings.priceSuffix && !symbol.includes(".")) {
      // only append if user didn't include a dot-suffix
      querySymbol = `${symbol}${settings.priceSuffix}`;
    }

    try {
      if (settings.provider === "twelvedata") {
        if (!settings.apiKey) throw new Error("API key for TwelveData not set in Settings.");
        const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(querySymbol)}&apikey=${encodeURIComponent(settings.apiKey)}`;
        const res = await axios.get(url);
        // sample response: { status: 'ok', symbol: 'BMRI.JK', price: '6400.00' }
        if (res.data && res.data.price) {
          const p = parseFloat(res.data.price);
          if (Number.isFinite(p)) return p;
        }
        throw new Error("No price in response");
      }

      // fallback: return null
      return null;
    } catch (err) {
      console.error("fetchPrice error", err?.message || err);
      return null;
    }
  }

  async function fetchAllPrices() {
    if (!holdings || holdings.length === 0) return;
    setLoadingPrices(true);
    const updated = await Promise.all(
      holdings.map(async (h) => {
        const price = await fetchPrice(h.symbol);
        return { ...h, lastPrice: price !== null ? price : h.lastPrice ?? null };
      })
    );
    setHoldings(updated);
    setLoadingPrices(false);
    setLastUpdated(new Date().toISOString());
  }

  function addHolding(e) {
    e?.preventDefault();
    const qty = parseFloat(form.qty);
    const priceBuy = parseFloat(form.priceBuy);
    if (!form.symbol || !qty || !priceBuy) {
      alert("Mohon isi minimal: Kode saham, jumlah, dan harga beli.");
      return;
    }
    const newItem = {
      id: Date.now(),
      symbol: form.symbol.toUpperCase(),
      name: form.name || "-",
      dateBuy: form.dateBuy || new Date().toISOString().slice(0, 10),
      qty,
      priceBuy,
      sector: form.sector || "-",
      totalBuy: qty * priceBuy,
      lastPrice: null,
    };
    setHoldings((s) => [newItem, ...s]);
    setForm({ symbol: "", name: "", qty: "", priceBuy: "", dateBuy: "", sector: "" });
  }

  function removeHolding(id) {
    if (!confirm("Hapus transaksi ini?")) return;
    setHoldings((s) => s.filter((x) => x.id !== id));
  }

  function updateSetting(key, value) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  // Aggregations
  const totalModal = holdings.reduce((acc, h) => acc + (h.qty * h.priceBuy || 0), 0);
  const totalValue = holdings.reduce((acc, h) => acc + (h.qty * (h.lastPrice ?? h.priceBuy) || 0), 0);
  const totalPL = totalValue - totalModal;
  const totalPLPercent = totalModal ? totalPL / totalModal : 0;

  const compositionData = holdings.map((h) => ({ name: h.symbol, value: h.qty * (h.lastPrice ?? h.priceBuy) }));
  const profitBars = holdings.map((h) => ({ name: h.symbol, profit: (h.qty * (h.lastPrice ?? h.priceBuy)) - (h.qty * h.priceBuy) }));

  const COLORS = ["#4ade80", "#60a5fa", "#f97316", "#f43f5e", "#a78bfa", "#f59e0b"];

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Portfolio Saham — Dashboard</h1>
          <div className="text-sm text-gray-600">Last update: {lastUpdated ? new Date(lastUpdated).toLocaleString() : "-"}</div>
        </header>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-white rounded-lg shadow-sm">
            <div className="text-xs text-gray-500">Total Modal</div>
            <div className="text-xl font-bold">Rp {currencyFormat(totalModal)}</div>
          </div>
          <div className="p-4 bg-white rounded-lg shadow-sm">
            <div className="text-xs text-gray-500">Nilai Sekarang</div>
            <div className="text-xl font-bold">Rp {currencyFormat(totalValue)}</div>
          </div>
          <div className="p-4 bg-white rounded-lg shadow-sm">
            <div className="text-xs text-gray-500">Profit / Loss (Rp)</div>
            <div className={`text-xl font-bold ${totalPL >= 0 ? "text-green-600" : "text-red-600"}`}>Rp {currencyFormat(totalPL)}</div>
          </div>
          <div className="p-4 bg-white rounded-lg shadow-sm">
            <div className="text-xs text-gray-500">Profit / Loss (%)</div>
            <div className={`text-xl font-bold ${totalPLPercent >= 0 ? "text-green-600" : "text-red-600"}`}>{(totalPLPercent * 100).toFixed(2)}%</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 bg-white p-4 rounded-lg shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Daftar Saham</h2>
              <div className="text-sm text-gray-500">{loadingPrices ? "Refreshing prices..." : "Prices OK"}</div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs text-gray-500 border-b">
                  <tr>
                    <th className="py-2">Kode</th>
                    <th>Nama</th>
                    <th>Tgl Beli</th>
                    <th>Jumlah</th>
                    <th>Harga Beli</th>
                    <th>Total Modal</th>
                    <th>Harga Sekarang</th>
                    <th>Nilai Sekarang</th>
                    <th>PL (Rp)</th>
                    <th>PL (%)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => {
                    const current = h.lastPrice ?? null;
                    const valueNow = h.qty * (current ?? h.priceBuy);
                    const plRp = valueNow - h.qty * h.priceBuy;
                    const plPct = h.priceBuy ? plRp / (h.qty * h.priceBuy) : 0;
                    return (
                      <tr key={h.id} className="border-b">
                        <td className="py-2">{h.symbol}</td>
                        <td>{h.name}</td>
                        <td>{h.dateBuy}</td>
                        <td>{h.qty}</td>
                        <td>Rp {currencyFormat(h.priceBuy)}</td>
                        <td>Rp {currencyFormat(h.qty * h.priceBuy)}</td>
                        <td>{current ? `Rp ${currencyFormat(current)}` : "-"}</td>
                        <td>Rp {currencyFormat(valueNow)}</td>
                        <td className={plRp >= 0 ? "text-green-600" : "text-red-600"}>Rp {currencyFormat(plRp)}</td>
                        <td className={plPct >= 0 ? "text-green-600" : "text-red-600"}>{(plPct * 100).toFixed(2)}%</td>
                        <td>
                          <button onClick={() => removeHolding(h.id)} className="text-xs text-red-600">Hapus</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4">
              <form onSubmit={addHolding} className="grid grid-cols-1 md:grid-cols-6 gap-2">
                <input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} placeholder="Kode (contoh: BMRI)" className="md:col-span-1 p-2 border rounded" />
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama Emiten" className="md:col-span-1 p-2 border rounded" />
                <input value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} placeholder="Jumlah (lembar)" className="md:col-span-1 p-2 border rounded" />
                <input value={form.priceBuy} onChange={(e) => setForm({ ...form, priceBuy: e.target.value })} placeholder="Harga Beli (Rp)" className="md:col-span-1 p-2 border rounded" />
                <input type="date" value={form.dateBuy} onChange={(e) => setForm({ ...form, dateBuy: e.target.value })} className="md:col-span-1 p-2 border rounded" />
                <div className="md:col-span-1 flex gap-2">
                  <button type="submit" className="px-3 py-2 bg-blue-600 text-white rounded">Tambah</button>
                  <button type="button" onClick={() => fetchAllPrices()} className="px-3 py-2 bg-gray-200 rounded">Refresh Prices</button>
                </div>
              </form>
            </div>
          </div>

          <aside className="bg-white p-4 rounded-lg shadow-sm">
            <h3 className="font-semibold mb-2">Ringkasan Visual</h3>
            <div style={{ width: "100%", height: 220 }}>
              {compositionData.length > 0 ? (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie dataKey="value" data={compositionData} labelLine={false} outerRadius={80}> 
                      {compositionData.map((entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                      ))}
                    </Pie>
                    <ReTooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-sm text-gray-500">Tidak ada data</div>
              )}
            </div>

            <div className="mt-4">
              <h4 className="text-sm font-medium">Komposisi (%)</h4>
              <ul className="text-sm mt-2">
                {compositionData.map((d, i) => (
                  <li key={d.name} className="flex justify-between py-1">
                    <span>{d.name}</span>
                    <span>{totalValue ? ((d.value / totalValue) * 100).toFixed(2) : 0}%</span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
          <h3 className="font-semibold mb-3">Analisis Cepat</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-medium mb-2">Profit per Saham</h4>
              <div style={{ width: "100%", height: 200 }}>
                {profitBars.length > 0 ? (
                  <ResponsiveContainer>
                    <BarChart data={profitBars}>
                      <XAxis dataKey="name" />
                      <YAxis />
                      <ReTooltip />
                      <Bar dataKey="profit">
                        {profitBars.map((entry, idx) => (
                          <Cell key={`c-${idx}`} fill={entry.profit >= 0 ? "#16a34a" : "#ef4444"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-sm text-gray-500">Tidak ada data</div>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-2">Pengaturan & Provider</h4>
              <div className="text-sm text-gray-600 mb-2">Provider saat ini: <strong>{settings.provider}</strong></div>
              <div className="grid grid-cols-1 gap-2">
                <label className="text-xs">API Key (TwelveData)</label>
                <input value={settings.apiKey} onChange={(e) => updateSetting("apiKey", e.target.value)} className="p-2 border rounded text-sm" placeholder="Masukkan API key jika ingin auto price" />

                <label className="text-xs">Price suffix (contoh .JK untuk IDX). Jika symbol sudah berisi suffix, biarkan kosong.</label>
                <input value={settings.priceSuffix} onChange={(e) => updateSetting("priceSuffix", e.target.value)} className="p-2 border rounded text-sm" />

                <label className="text-xs">Refresh interval (detik)</label>
                <input type="number" value={settings.refreshIntervalSec} onChange={(e) => updateSetting("refreshIntervalSec", parseInt(e.target.value || "60"))} className="p-2 border rounded text-sm" />

                <div className="flex gap-2 mt-2">
                  <button onClick={() => { localStorage.removeItem(STORAGE_KEY); setHoldings([]); }} className="px-3 py-2 bg-red-600 text-white rounded text-sm">Reset Data</button>
                  <button onClick={() => fetchAllPrices()} className="px-3 py-2 bg-blue-600 text-white rounded text-sm">Fetch Prices Now</button>
                </div>

                <div className="mt-3 text-xs text-gray-500">
                  Tips: Jika tidak punya API key, biarkan kosong dan masukkan harga secara manual pada saat input/atau edit. Untuk mendapatkan API key gratis, daftar pada layanan seperti TwelveData.
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer className="text-center text-sm text-gray-500">Made with ❤️ — Paste this component into your React app. Customize provider if you prefer other APIs.</footer>
      </div>
    </div>
  );
}

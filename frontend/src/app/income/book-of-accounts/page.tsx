"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useState, useEffect } from "react";
import api from "@/lib/api";
import Button from "@/components/ui/Button";
import { Search } from "lucide-react";

const MONTHS = [
  { value: "1", label: "January" }, { value: "2", label: "February" }, { value: "3", label: "March" },
  { value: "4", label: "April" }, { value: "5", label: "May" }, { value: "6", label: "June" },
  { value: "7", label: "July" }, { value: "8", label: "August" }, { value: "9", label: "September" },
  { value: "10", label: "October" }, { value: "11", label: "November" }, { value: "12", label: "December" },
];

const SOURCES = [
  { value: "ALL", label: "All" },
  { value: "IP", label: "IP" },
  { value: "OP", label: "OP" },
  { value: "LAB", label: "Lab" },
  { value: "PHARMA", label: "Pharma" },
];

const getYearOptions = () => {
  const currentYear = new Date().getFullYear();
  const years: { value: string; label: string }[] = [];
  for (let y = currentYear; y >= currentYear - 10; y--) {
    years.push({ value: String(y), label: String(y) });
  }
  return years;
};

const getMonthRange = (year: number, month: number) => {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: fmt(first), to: fmt(last) };
};

interface MoneySplit {
  cash: number;
  bank: number;
  total: number;
}

interface BookRow {
  sourceCode: string;
  source: string;
  newCredit: number;
  advanceAdjusted: number;
  advanceCollected: MoneySplit;
  creditCollected: MoneySplit;
  income: MoneySplit;
}

export default function BookOfAccountsPage() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [source, setSource] = useState("ALL");
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [fromDate, setFromDate] = useState(() => getMonthRange(currentYear, currentMonth).from);
  const [toDate, setToDate] = useState(() => getMonthRange(currentYear, currentMonth).to);
  const [rows, setRows] = useState<BookRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReport = async (fd = fromDate, td = toDate, src = source) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fd) params.set("fromDate", fd);
      if (td) params.set("toDate", td);
      if (src) params.set("source", src);
      const { data } = await api.get(`/reports/book-of-accounts?${params.toString()}`);
      setRows(data.rows || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMonthChange = (m: number) => {
    setMonth(m);
    const range = getMonthRange(year, m);
    setFromDate(range.from);
    setToDate(range.to);
    fetchReport(range.from, range.to, source);
  };

  const handleYearChange = (y: number) => {
    setYear(y);
    const range = getMonthRange(y, month);
    setFromDate(range.from);
    setToDate(range.to);
    fetchReport(range.from, range.to, source);
  };

  const formatCurrency = (val: number | null | undefined) => {
    if (val == null) return "₹0";
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(val);
  };

  const totals = rows.reduce<BookRow>(
    (acc, r) => {
      acc.newCredit += r.newCredit;
      acc.advanceAdjusted += r.advanceAdjusted;
      acc.advanceCollected.cash += r.advanceCollected.cash;
      acc.advanceCollected.bank += r.advanceCollected.bank;
      acc.advanceCollected.total += r.advanceCollected.total;
      acc.creditCollected.cash += r.creditCollected.cash;
      acc.creditCollected.bank += r.creditCollected.bank;
      acc.creditCollected.total += r.creditCollected.total;
      acc.income.cash += r.income.cash;
      acc.income.bank += r.income.bank;
      acc.income.total += r.income.total;
      return acc;
    },
    {
      sourceCode: "",
      source: "Total",
      newCredit: 0,
      advanceAdjusted: 0,
      advanceCollected: { cash: 0, bank: 0, total: 0 },
      creditCollected: { cash: 0, bank: 0, total: 0 },
      income: { cash: 0, bank: 0, total: 0 },
    },
  );

  const th = "px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider text-right whitespace-nowrap";
  const thLabel = "px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider text-left";
  const td = "px-4 py-3 text-sm text-slate-700 text-right whitespace-nowrap";
  const subTh = "px-3 py-2 text-xs font-semibold text-slate-500 text-right";

  return (
    <DashboardLayout>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Book Of Accounts</h1>
            <p className="text-sm text-slate-400 mt-1">Income source wise credit, advance and collection summary</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/60 p-4 mb-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-auto">
              <label className="block text-xs font-medium text-slate-500 mb-1">Income Source</label>
              <select
                value={source}
                onChange={(e) => { setSource(e.target.value); fetchReport(fromDate, toDate, e.target.value); }}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              >
                {SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-auto">
              <select
                value={year}
                onChange={(e) => handleYearChange(parseInt(e.target.value))}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              >
                {getYearOptions().map((y) => (
                  <option key={y.value} value={y.value}>{y.label}</option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-auto">
              <select
                value={month}
                onChange={(e) => handleMonthChange(parseInt(e.target.value))}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              >
                {MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-auto">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>
            <div className="w-full sm:w-auto">
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>
            <Button onClick={() => fetchReport()} isLoading={loading}>
              <Search size={16} className="mr-1" /> Load
            </Button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200/60 bg-slate-50/60">
                  <th rowSpan={2} className={`${thLabel} border-r border-slate-200/60`}>Income Source</th>
                  <th rowSpan={2} className={`${th} border-r border-slate-200/60`}>New Credit</th>
                  <th rowSpan={2} className={`${th} border-r border-slate-200/60`}>Advance Adjusted</th>
                  <th colSpan={3} className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider text-center border-r border-slate-200/60">Advance Collected</th>
                  <th colSpan={3} className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider text-center border-r border-slate-200/60">Credit Collected</th>
                  <th colSpan={3} className="px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider text-center">Income</th>
                </tr>
                <tr className="border-b border-slate-200/60">
                  <th className={`${subTh} border-r border-slate-200/60`}>Cash</th>
                  <th className={`${subTh} border-r border-slate-200/60`}>Bank</th>
                  <th className={`${subTh} border-r border-slate-200/60`}>Total</th>
                  <th className={`${subTh} border-r border-slate-200/60`}>Cash</th>
                  <th className={`${subTh} border-r border-slate-200/60`}>Bank</th>
                  <th className={`${subTh} border-r border-slate-200/60`}>Total</th>
                  <th className={`${subTh} border-r border-slate-200/60`}>Cash</th>
                  <th className={`${subTh} border-r border-slate-200/60`}>Bank</th>
                  <th className={subTh}>Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={12} className="text-center py-12 text-slate-400">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                        Loading...
                      </div>
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={12} className="text-center py-12 text-slate-400">No data for the selected period</td></tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.sourceCode} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 text-sm font-medium text-slate-800 border-r border-slate-100">{r.source}</td>
                      <td className={`${td} border-r border-slate-100`}>{formatCurrency(r.newCredit)}</td>
                      <td className={`${td} border-r border-slate-100`}>{formatCurrency(r.advanceAdjusted)}</td>
                      <td className={`${td} border-r border-slate-100`}>{formatCurrency(r.advanceCollected.cash)}</td>
                      <td className={`${td} border-r border-slate-100`}>{formatCurrency(r.advanceCollected.bank)}</td>
                      <td className={`${td} border-r border-slate-100 font-semibold`}>{formatCurrency(r.advanceCollected.total)}</td>
                      <td className={`${td} border-r border-slate-100`}>{formatCurrency(r.creditCollected.cash)}</td>
                      <td className={`${td} border-r border-slate-100`}>{formatCurrency(r.creditCollected.bank)}</td>
                      <td className={`${td} border-r border-slate-100 font-semibold`}>{formatCurrency(r.creditCollected.total)}</td>
                      <td className={`${td} border-r border-slate-100`}>{formatCurrency(r.income.cash)}</td>
                      <td className={`${td} border-r border-slate-100`}>{formatCurrency(r.income.bank)}</td>
                      <td className={`${td} font-semibold`}>{formatCurrency(r.income.total)}</td>
                    </tr>
                  ))
                )}
                {!loading && rows.length > 0 && (
                  <tr className="bg-indigo-50/40">
                    <td className="px-4 py-3 text-sm font-bold text-slate-800 border-r border-slate-200/60">Total</td>
                    <td className={`${td} font-bold border-r border-slate-200/60`}>{formatCurrency(totals.newCredit)}</td>
                    <td className={`${td} font-bold border-r border-slate-200/60`}>{formatCurrency(totals.advanceAdjusted)}</td>
                    <td className={`${td} font-bold border-r border-slate-200/60`}>{formatCurrency(totals.advanceCollected.cash)}</td>
                    <td className={`${td} font-bold border-r border-slate-200/60`}>{formatCurrency(totals.advanceCollected.bank)}</td>
                    <td className={`${td} font-bold border-r border-slate-200/60`}>{formatCurrency(totals.advanceCollected.total)}</td>
                    <td className={`${td} font-bold border-r border-slate-200/60`}>{formatCurrency(totals.creditCollected.cash)}</td>
                    <td className={`${td} font-bold border-r border-slate-200/60`}>{formatCurrency(totals.creditCollected.bank)}</td>
                    <td className={`${td} font-bold border-r border-slate-200/60`}>{formatCurrency(totals.creditCollected.total)}</td>
                    <td className={`${td} font-bold border-r border-slate-200/60`}>{formatCurrency(totals.income.cash)}</td>
                    <td className={`${td} font-bold border-r border-slate-200/60`}>{formatCurrency(totals.income.bank)}</td>
                    <td className={`${td} font-bold`}>{formatCurrency(totals.income.total)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

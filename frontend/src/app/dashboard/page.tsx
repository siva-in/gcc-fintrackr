"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuthStore } from "@/stores/authStore";
import { useEffect, useState } from "react";
import api from "@/lib/api";

interface IncomeSourceRow {
  code: string;
  name: string;
  total: number;
}

const INCOME_COLORS: Record<string, string> = {
  OP: "#3b82f6",
  IP: "#8b5cf6",
  LAB: "#10b981",
  PHARMACY: "#f59e0b",
  PHARMA: "#f59e0b",
  ADV: "#64748b",
};

const SOURCE_LABELS: Record<string, string> = {
  OP: "OP",
  IP: "IP",
  LAB: "Lab",
  PHARMACY: "Pharma",
  PHARMA: "Pharma",
  ADV: "Unrealised Advance",
};

const getMonthRange = (year: number, month: number) => {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: fmt(first), to: fmt(last) };
};

const MONTHS = [
  { value: "1", label: "January" }, { value: "2", label: "February" }, { value: "3", label: "March" },
  { value: "4", label: "April" }, { value: "5", label: "May" }, { value: "6", label: "June" },
  { value: "7", label: "July" }, { value: "8", label: "August" }, { value: "9", label: "September" },
  { value: "10", label: "October" }, { value: "11", label: "November" }, { value: "12", label: "December" },
];

function PieChart({ data }: { data: IncomeSourceRow[] }) {
  const total = data.reduce((sum, d) => sum + d.total, 0);
  const r = 80;
  const C = 2 * Math.PI * r;
  const segments = data.filter((d) => d.total > 0);

  if (segments.length === 0) {
    return <div className="text-center text-slate-400 py-12">No income data for the selected period</div>;
  }

  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-6">
      <svg width="200" height="200" viewBox="0 0 200 200">
        <g style={{ transform: "rotate(-90deg)", transformOrigin: "100px 100px" }}>
          <circle cx="100" cy="100" r={r} fill="none" stroke="#f1f5f9" strokeWidth="40" />
          {segments.map((seg) => {
            const frac = seg.total / total;
            const dash = frac * C;
            const el = (
              <circle
                key={seg.code}
                cx="100"
                cy="100"
                r={r}
                fill="none"
                stroke={INCOME_COLORS[seg.code] || "#94a3b8"}
                strokeWidth="40"
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return el;
          })}
        </g>
        <text x="100" y="100" textAnchor="middle" dominantBaseline="central" style={{ fontSize: "20px", fontWeight: 700, fill: "#1e293b" }}>
          {new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(total)}
        </text>
      </svg>
      <div className="w-full space-y-2">
        {segments.map((seg) => (
          <div key={seg.code} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-slate-600">
              <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: INCOME_COLORS[seg.code] || "#94a3b8" }} />
              {SOURCE_LABELS[seg.code] || seg.code}
            </span>
            <span className="font-semibold text-slate-800">
              {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(seg.total)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { orgId } = useAuthStore();

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const [incomeYear, setIncomeYear] = useState(currentYear);
  const [incomeMonth, setIncomeMonth] = useState(currentMonth);
  const [fromDate, setFromDate] = useState(() => getMonthRange(currentYear, currentMonth).from);
  const [toDate, setToDate] = useState(() => getMonthRange(currentYear, currentMonth).to);
  const [income, setIncome] = useState<IncomeSourceRow[]>([]);
  const [incomeTotal, setIncomeTotal] = useState(0);
  const [incomeLoading, setIncomeLoading] = useState(false);

  const fetchIncome = async (fd = fromDate, td = toDate) => {
    setIncomeLoading(true);
    try {
      const params = new URLSearchParams();
      if (fd) params.set("fromDate", fd);
      if (td) params.set("toDate", td);
      const { data } = await api.get(`/reports/income-summary?${params.toString()}`);
      setIncome(data.sources || []);
      setIncomeTotal(data.total || 0);
    } catch {
      // non-critical
    } finally {
      setIncomeLoading(false);
    }
  };

  useEffect(() => {
    fetchIncome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const handleMonthChange = (m: string) => {
    setIncomeMonth(Number(m));
    const range = getMonthRange(incomeYear, Number(m));
    setFromDate(range.from);
    setToDate(range.to);
    fetchIncome(range.from, range.to);
  };

  const handleYearChange = (y: string) => {
    setIncomeYear(Number(y));
    const range = getMonthRange(Number(y), incomeMonth);
    setFromDate(range.from);
    setToDate(range.to);
    fetchIncome(range.from, range.to);
  };

  const handleDateChange = (from: string, to: string) => {
    setFromDate(from);
    setToDate(to);
    fetchIncome(from, to);
  };

  const incomeCards = ["OP", "IP", "LAB", "PHARMACY", "ADV"].map((code) => {
    const row = income.find((r) => r.code === code);
    return { code, total: row?.total || 0 };
  });

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(val);
  };

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Welcome back to FinTrackr</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Total Income</h2>
            <p className="text-sm text-slate-400 mt-0.5">Consolidated income across income sources</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={incomeMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <select
              value={incomeYear}
              onChange={(e) => handleYearChange(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              {[currentYear, currentYear - 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => handleDateChange(e.target.value, toDate)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => handleDateChange(fromDate, e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
        </div>

        {incomeLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="grid grid-cols-2 gap-4 content-start">
              {incomeCards.map((c) => (
                <div key={c.code} className="rounded-2xl border border-slate-200/60 p-5">
                  <p className="text-sm font-medium text-slate-400">{SOURCE_LABELS[c.code] || c.code} Income</p>
                  <p className="text-2xl font-bold text-slate-800 mt-2">{formatCurrency(c.total)}</p>
                </div>
              ))}
              <div className="col-span-2 rounded-2xl bg-indigo-50/60 border border-indigo-100 p-5">
                <p className="text-sm font-medium text-indigo-500">Total Income</p>
                <p className="text-2xl font-bold text-indigo-700 mt-2">{formatCurrency(incomeTotal)}</p>
              </div>
            </div>
            <div className="bg-slate-50/50 border border-slate-200/60 rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-slate-600 mb-4 text-center">Income Distribution</h3>
              <PieChart data={income} />
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

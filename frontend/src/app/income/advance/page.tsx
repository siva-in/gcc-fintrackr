"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useState, useRef, useEffect, useCallback } from "react";
import api from "@/lib/api";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { Upload, Search, X, Wallet, TrendingUp, List, LayoutDashboard, FileText, AlertTriangle, CheckCircle, ChevronRight } from "lucide-react";
import Pagination from "@/components/ui/Pagination";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

interface Dashboard {
  unrealised: number;
  realised: number;
  cash: number;
  bank: number;
  card: number;
  paymentModes: { code: string; name: string; total: number }[];
  total: number;
}

const MODE_COLORS: Record<string, string> = {
  CASH: "#10b981",
  BANK: "#3b82f6",
  UPI: "#8b5cf6",
  CARD: "#f59e0b",
  CHEQUE: "#ef4444",
  NEFT: "#64748b",
};

interface AdvTxn {
  id: number;
  billNo: string;
  billDate: string | null;
  billAmt: number | null;
  pymt_status: string;
  txn_status: string;
  grossAmount: number | null;
  discountAmount: number | null;
  advAdjt: number | null;
  ipAdm?: { id: number; ipNo: string } | null;
  rcvdPymts: { id: number; amount: number | null; paymentDate: string | null; paymentMode: { code: string; name: string } | null }[];
  incomeSource: { code: string; name: string } | null;
  realisedByTxn?: { billNo: string; billDate: string } | null;
}

interface ImportLogEntry {
  id: number;
  fileName: string;
  fileType: string;
  totalRecords: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  importStarted: string;
  importEnded: string | null;
  _count: { errors: number };
}

interface ImportErrorEntry {
  id: number;
  rowNumber: number;
  rowData: string;
  reason: string;
}

const MONTHS = [
  { value: "1", label: "January" }, { value: "2", label: "February" }, { value: "3", label: "March" },
  { value: "4", label: "April" }, { value: "5", label: "May" }, { value: "6", label: "June" },
  { value: "7", label: "July" }, { value: "8", label: "August" }, { value: "9", label: "September" },
  { value: "10", label: "October" }, { value: "11", label: "November" }, { value: "12", label: "December" },
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

export default function IncomeAdvancePage() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const [activeTab, setActiveTab] = useState<"dashboard" | "transactions" | "importlog">("dashboard");
  const [dashboard, setDashboard] = useState<Dashboard>({ unrealised: 0, realised: 0, cash: 0, bank: 0, card: 0, paymentModes: [], total: 0 });
  const [dashYear, setDashYear] = useState(currentYear);
  const [dashMonth, setDashMonth] = useState(currentMonth);
  const [dashFromDate, setDashFromDate] = useState(() => getMonthRange(currentYear, currentMonth).from);
  const [dashToDate, setDashToDate] = useState(() => getMonthRange(currentYear, currentMonth).to);
  const [dashLoading, setDashLoading] = useState(false);

  const [txns, setTxns] = useState<AdvTxn[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [txnPaymentFilter, setTxnPaymentFilter] = useState("");
  const [txnPymtStatusFilter, setTxnPymtStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [hasSearched, setHasSearched] = useState(false);

  const [importLogs, setImportLogs] = useState<ImportLogEntry[]>([]);
  const [logPagination, setLogPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [logPage, setLogPage] = useState(1);
  const [logLoading, setLogLoading] = useState(false);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importType, setImportType] = useState<"adv" | "ipadm">("adv");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ inserted: number; updated: number; skipped: number; failed: number; total: number; errors?: { row: number; rowData: string; reason: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [selectedLogErrors, setSelectedLogErrors] = useState<ImportErrorEntry[]>([]);
  const [selectedLogInfo, setSelectedLogInfo] = useState<ImportLogEntry | null>(null);
  const [errorLoading, setErrorLoading] = useState(false);

  useEffect(() => {
    const range = getMonthRange(dashYear, dashMonth);
    setDashFromDate(range.from);
    setDashToDate(range.to);
  }, [dashYear, dashMonth]);

  const fetchDashboard = useCallback(async (fd: string, td: string) => {
    setDashLoading(true);
    try {
      const params = new URLSearchParams();
      if (fd) params.set("fromDate", fd);
      if (td) params.set("toDate", td);
      const { data } = await api.get(`/income/adv/dashboard?${params.toString()}`);
      setDashboard(data);
    } catch {
      toast.error("Failed to load dashboard");
    } finally {
      setDashLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard(dashFromDate, dashToDate);
  }, [dashFromDate, dashToDate, fetchDashboard]);

  const fetchTxns = async (p = page, s = search, fd = fromDate, td = toDate, pm = txnPaymentFilter, ps = txnPymtStatusFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "10" });
      if (s) params.set("search", s);
      if (fd) params.set("fromDate", fd);
      if (td) params.set("toDate", td);
      if (pm) params.set("paymentMode", pm);
      if (ps) params.set("pymtStatus", ps);
      const { data } = await api.get(`/income/adv/txns?${params.toString()}`);
      setTxns(data.txns || []);
      setPagination(data.pagination || { total: 0, page: 1, pages: 1 });
    } catch {
      toast.error("Failed to load transactions");
    } finally {
      setLoading(false);
    }
  };

  const fetchImportLogs = async (p = logPage) => {
    setLogLoading(true);
    try {
      const { data } = await api.get(`/income/adv/import-logs?page=${p}&limit=10`);
      setImportLogs(data.logs || []);
      setLogPagination(data.pagination || { total: 0, page: 1, pages: 1 });
    } catch {
      toast.error("Failed to load import logs");
    } finally {
      setLogLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "importlog") fetchImportLogs();
  }, [activeTab, logPage]);

  useEffect(() => {
    if (activeTab === "transactions" && !hasSearched) {
      setHasSearched(true);
      fetchTxns(1, search, fromDate, toDate, txnPaymentFilter, txnPymtStatusFilter);
    }
  }, [activeTab]);

  const handleDashFilter = () => {
    fetchDashboard(dashFromDate, dashToDate);
  };

  const handleSearch = () => {
    setPage(1);
    fetchTxns(1, search, fromDate, toDate, txnPaymentFilter, txnPymtStatusFilter);
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    fetchTxns(p);
  };

  const handleLogPageChange = (p: number) => { setLogPage(p); };

  const handleCardClick = (pymtStatus?: string, paymentMode?: string) => {
    setTxnPymtStatusFilter(pymtStatus || "");
    setTxnPaymentFilter(paymentMode || "");
    setFromDate(dashFromDate);
    setToDate(dashToDate);
    setActiveTab("transactions");
    setHasSearched(true);
    setPage(1);
    setTimeout(() => fetchTxns(1, "", dashFromDate, dashToDate, paymentMode || "", pymtStatus || ""), 0);
  };

  const openImportModal = (type: "adv" | "ipadm") => {
    setImportType(type);
    setSelectedFile(null);
    setImportResult(null);
    setImportModalOpen(true);
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const endpoint = importType === "ipadm" ? "/income/ip/import-adm" : "/income/adv/import";
      const { data } = await api.post(endpoint, formData, { headers: { "Content-Type": "multipart/form-data" } });
      setImportResult(data);
      setSelectedFile(null);
      toast.success(data.message || "Import complete");
      setLogPage(1);
      fetchImportLogs(1);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Import failed";
      toast.error(msg);
    } finally {
      setImporting(false);
    }
  };

  const handleViewErrors = async (log: ImportLogEntry) => {
    setErrorModalOpen(true);
    setSelectedLogInfo(log);
    setSelectedLogErrors([]);
    setErrorLoading(true);
    try {
      const { data } = await api.get(`/income/adv/import-logs/${log.id}/errors`);
      setSelectedLogErrors(data.errors || []);
    } catch {
      toast.error("Failed to load errors");
    } finally {
      setErrorLoading(false);
    }
  };

  const formatCurrency = (val: number | null | undefined) => {
    if (val == null) return "₹0.00";
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(val);
  };

  const formatDate = (d: string | null | undefined) => {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("en-GB");
  };

  const formatDateTime = (d: string | null | undefined) => {
    if (!d) return "-";
    return new Date(d).toLocaleString("en-GB");
  };

  const getFileTypeLabel = (ft: string) => {
    if (ft === "ADV") return "Advance Import";
    if (ft === "IP_ADM") return "IP Admission";
    return ft;
  };

  return (
    <DashboardLayout>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Advance Collection</h1>
            <p className="text-sm text-slate-400">Manage advance collections and realisations</p>
          </div>
        </div>

        <div className="bg-slate-100 rounded-xl p-1 max-w-2xl mb-6">
          <div className="flex">
            {[
              { key: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
              { key: "transactions" as const, label: "Transactions", icon: List },
              { key: "importlog" as const, label: "Advance Data Import", icon: FileText },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 flex-1 justify-center ${
                  activeTab === tab.key
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "dashboard" && (
          <>
            <div className="bg-white rounded-2xl border border-slate-200/60 p-4 mb-6">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Year</span>
                  <select value={dashYear} onChange={(e) => setDashYear(parseInt(e.target.value))} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                    {getYearOptions().map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Month</span>
                  <select value={dashMonth} onChange={(e) => setDashMonth(parseInt(e.target.value))} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                    {MONTHS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">From</span>
                  <input type="date" value={dashFromDate} onChange={(e) => setDashFromDate(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">To</span>
                  <input type="date" value={dashToDate} onChange={(e) => setDashToDate(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                </div>
                <Button size="sm" onClick={handleDashFilter} isLoading={dashLoading}>Filter</Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <button onClick={() => handleCardClick("UNREALISED")} className="bg-white rounded-2xl border border-slate-200/60 p-4 hover:border-amber-300 hover:shadow-md transition-all text-left">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-slate-400">Unrealised</p>
                        <p className="text-xl font-bold text-amber-600 mt-1">{formatCurrency(dashboard.unrealised)}</p>
                      </div>
                      <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                        <Wallet size={18} className="text-amber-500" />
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">Click to view details</p>
                  </button>

                  <button onClick={() => handleCardClick("REALISED")} className="bg-white rounded-2xl border border-slate-200/60 p-4 hover:border-emerald-300 hover:shadow-md transition-all text-left">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-slate-400">Realised</p>
                        <p className="text-xl font-bold text-emerald-600 mt-1">{formatCurrency(dashboard.realised)}</p>
                      </div>
                      <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                        <CheckCircle size={18} className="text-emerald-500" />
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">Click to view details</p>
                  </button>

                  <button onClick={() => handleCardClick()} className="bg-white rounded-2xl border border-slate-200/60 p-4 hover:border-indigo-300 hover:shadow-md transition-all text-left">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-slate-400">Total Advance</p>
                        <p className="text-xl font-bold text-indigo-600 mt-1">{formatCurrency(dashboard.total)}</p>
                      </div>
                      <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                        <TrendingUp size={18} className="text-indigo-500" />
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">Click to view details</p>
                  </button>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/60 p-5">
                  <h3 className="text-sm font-semibold text-slate-600 mb-4">Payment Mode Breakdown</h3>
                  {dashboard.paymentModes.length === 0 ? (
                    <p className="text-center text-slate-400 py-6">No payment data for the selected period</p>
                  ) : (
                    <div className="space-y-3">
                      {dashboard.paymentModes.map((m) => {
                        const pct = dashboard.total > 0 ? Math.round((m.total / dashboard.total) * 100) : 0;
                        return (
                          <button key={m.code} onClick={() => handleCardClick(undefined, m.code)} className="w-full text-left group">
                            <div className="flex items-center justify-between text-sm">
                              <span className="flex items-center gap-2 text-slate-700 font-medium">
                                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: MODE_COLORS[m.code] || "#94a3b8" }} />
                                {m.name}
                              </span>
                              <span className="flex items-center gap-3">
                                <span className="text-xs text-slate-400">{pct}%</span>
                                <span className="font-semibold text-slate-800">{formatCurrency(m.total)}</span>
                                <ChevronRight size={14} className="text-slate-300 group-hover:text-indigo-500 transition-colors" />
                              </span>
                            </div>
                            <div className="mt-1.5 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: MODE_COLORS[m.code] || "#94a3b8" }} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/60 p-5 flex flex-col">
                <h3 className="text-sm font-semibold text-slate-600 mb-2">Payment Mode Distribution</h3>
                {dashboard.paymentModes.length === 0 ? (
                  <p className="text-center text-slate-400 py-10">No payment data</p>
                ) : (
                  <div className="h-56 flex-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={dashboard.paymentModes}
                          dataKey="total"
                          nameKey="code"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          onClick={(data) => {
                            const code = (data as { payload?: { code?: string } }).payload?.code;
                            if (code) handleCardClick(undefined, code);
                          }}
                          className="cursor-pointer"
                        >
                          {dashboard.paymentModes.map((m) => (
                            <Cell key={m.code} fill={MODE_COLORS[m.code] || "#94a3b8"} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === "transactions" && (
          <>
            <div className="bg-white rounded-2xl border border-slate-200/60 p-4 mb-6">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="text" placeholder="Bill No, IP No..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" />
                </div>
                <select value={txnPaymentFilter} onChange={(e) => setTxnPaymentFilter(e.target.value)} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                  <option value="">All Modes</option>
                  <option value="CASH">Cash</option>
                  <option value="BANK">Bank</option>
                  <option value="CARD">Card</option>
                  <option value="UPI">UPI</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
                <select value={txnPymtStatusFilter} onChange={(e) => setTxnPymtStatusFilter(e.target.value)} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                  <option value="">All Status</option>
                  <option value="UNREALISED">Unrealised</option>
                  <option value="REALISED">Realised</option>
                </select>
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                <Button size="sm" onClick={handleSearch}><Search size={14} className="mr-1" /> Search</Button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200/60">
                      <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Vou.No</th>
                      <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden sm:table-cell">Date</th>
                      <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden md:table-cell">IP No</th>
                      <th className="text-right px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Amount</th>
                      <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Payment</th>
                      <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden lg:table-cell">Realised Bill</th>
                      <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!loading && !hasSearched && txns.length === 0 && (
                      <tr><td colSpan={7} className="text-center text-slate-400 py-12">Use the search or date filter to view transactions</td></tr>
                    )}
                    {loading && (
                      <tr><td colSpan={7} className="text-center py-12"><div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mx-auto" /></td></tr>
                    )}
                    {!loading && hasSearched && txns.length === 0 && (
                      <tr><td colSpan={7} className="text-center text-slate-400 py-12">No transactions found</td></tr>
                    )}
                    {!loading && txns.map((txn) => {
                      const isUnrealised = txn.pymt_status === "UNREALISED";
                      return (
                        <tr key={txn.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                          <td className={`px-5 py-3.5 font-medium ${isUnrealised ? "text-amber-600" : "text-slate-700"}`}>{txn.billNo}</td>
                          <td className="px-5 py-3.5 hidden sm:table-cell text-slate-500">{formatDate(txn.billDate)}</td>
                          <td className="px-5 py-3.5 hidden md:table-cell text-slate-500">{txn.ipAdm?.ipNo || "-"}</td>
                          <td className="px-5 py-3.5 text-right font-medium text-slate-700">{formatCurrency(txn.billAmt)}</td>
                          <td className="px-5 py-3.5">
                            <div className="flex flex-wrap gap-1.5">
                              {txn.rcvdPymts.length > 0 ? txn.rcvdPymts.map((pmt) => (
                                <span key={pmt.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded text-xs font-medium text-slate-600">
                                  {pmt.paymentMode?.code || "?"} {formatCurrency(pmt.amount)}
                                </span>
                              )) : <span className="text-xs text-slate-400">-</span>}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 hidden lg:table-cell">
                            {txn.realisedByTxn ? (
                              <div>
                                <span className="text-xs font-medium text-emerald-700">{txn.realisedByTxn.billNo}</span>
                                <span className="block text-xs text-slate-400">{formatDate(txn.realisedByTxn.billDate)}</span>
                              </div>
                            ) : <span className="text-xs text-slate-400">-</span>}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${txn.pymt_status === "UNREALISED" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>
                              {txn.pymt_status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {hasSearched && (
                <Pagination page={page} totalPages={pagination.pages} total={pagination.total} limit={10} onPageChange={handlePageChange} />
              )}
            </div>
          </>
        )}

        {activeTab === "importlog" && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-800">Import History</h2>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => openImportModal("ipadm")}>
                  <Upload size={14} className="mr-1" /> Import IP Admission
                </Button>
                <Button size="sm" onClick={() => openImportModal("adv")}>
                  <Upload size={14} className="mr-1" /> Import New
                </Button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200/60">
                      <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">File Name</th>
                      <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden sm:table-cell">Type</th>
                      <th className="text-center px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Total</th>
                      <th className="text-center px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Inserted</th>
                      <th className="text-center px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Updated</th>
                      <th className="text-center px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Skipped</th>
                      <th className="text-center px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Failed</th>
                      <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden lg:table-cell">Started</th>
                      <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logLoading && (
                      <tr><td colSpan={9} className="text-center py-12"><div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mx-auto" /></td></tr>
                    )}
                    {!logLoading && importLogs.length === 0 && (
                      <tr><td colSpan={9} className="text-center text-slate-400 py-12">No imports yet</td></tr>
                    )}
                    {!logLoading && importLogs.map((log) => (
                      <tr key={log.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3.5 font-medium text-slate-700">{log.fileName}</td>
                        <td className="px-5 py-3.5 hidden sm:table-cell"><span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{getFileTypeLabel(log.fileType)}</span></td>
                        <td className="px-5 py-3.5 text-center font-medium text-slate-700">{log.totalRecords}</td>
                        <td className="px-5 py-3.5 text-center font-medium text-emerald-600">{log.inserted}</td>
                        <td className="px-5 py-3.5 text-center font-medium text-blue-600">{log.updated}</td>
                        <td className="px-5 py-3.5 text-center font-medium text-slate-500">{log.skipped}</td>
                        <td className="px-5 py-3.5 text-center">
                          <span className={`font-medium ${log.failed > 0 ? "text-red-600" : "text-slate-500"}`}>{log.failed}</span>
                        </td>
                        <td className="px-5 py-3.5 hidden lg:table-cell text-slate-400 text-xs">{formatDateTime(log.importStarted)}</td>
                        <td className="px-5 py-3.5">
                          {log.failed > 0 && log._count.errors > 0 && (
                            <button onClick={() => handleViewErrors(log)} className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors">
                              <AlertTriangle size={12} /> View {log._count.errors} Error{log._count.errors > 1 ? "s" : ""}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {logPagination.pages > 1 && (
                <Pagination page={logPage} totalPages={logPagination.pages} total={logPagination.total} limit={10} onPageChange={handleLogPageChange} />
              )}
            </div>
          </>
        )}
      </div>

      <Modal isOpen={importModalOpen} onClose={() => { if (!importing) setImportModalOpen(false); }} title={importType === "ipadm" ? "Import IP Admission" : "Import Advance Collection Report"}>
        <div className="space-y-4">
          {importType === "ipadm" ? (
            <>
              <p className="text-sm text-slate-500">
                Upload an IP Admission Excel file with columns: <strong>IP Date, Entry No, UHID No, Patient Name, Status</strong>
              </p>
              <p className="text-xs text-slate-400">IPAdm records are created/updated based on Entry No (ipNo). Patient is linked by UHID. Status Open becomes ADMITTED, Discharged becomes DISCHARGED.</p>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-500">
                Upload an Advance Collection Excel file with columns: <strong>S.No, Vou.No, Date, Voucher Type, Bill Name, Bill No, Amount, payment_refno, cash_amount, card_amount, cheque_amount, neft_amount, UPI Amt</strong>
              </p>
              <p className="text-xs text-slate-400">Header rows, empty rows, and summary/total rows are auto-skipped. Duplicate Vou.No entries will be updated.</p>
            </>
          )}

          <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-indigo-400 transition-colors">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setSelectedFile(f); setImportResult(null); } }} />
            {selectedFile ? (
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm text-slate-600">{selectedFile.name}</span>
                <button onClick={() => { setSelectedFile(null); setImportResult(null); }} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-red-500 transition-colors"><X size={14} /></button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} className="text-sm text-indigo-500 hover:text-indigo-600 font-medium">Click to select file</button>
            )}
          </div>

          {importResult && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
              <p className="text-sm text-emerald-700 font-medium">Import Summary</p>
              <p className="text-xs text-emerald-600">
                Total rows: {importResult.total} | Inserted: {importResult.inserted} | Updated: {importResult.updated} | Skipped: {importResult.skipped} | Failed: {importResult.failed}
              </p>
              {importResult.errors && importResult.errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {importResult.errors.slice(0, 10).map((e, i) => (
                    <p key={i} className="text-xs text-amber-700">Row {e.row}: {e.reason}</p>
                  ))}
                  {importResult.errors.length > 10 && (
                    <p className="text-xs text-amber-500">...and {importResult.errors.length - 10} more</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => { if (!importing) setImportModalOpen(false); }}>
              {importResult ? "Close" : "Cancel"}
            </Button>
            {!importResult && (
              <Button onClick={handleImport} disabled={!selectedFile} isLoading={importing}>Import</Button>
            )}
          </div>
        </div>
      </Modal>

      <Modal isOpen={errorModalOpen} onClose={() => setErrorModalOpen(false)} title={`Error Details - ${selectedLogInfo?.fileName || ""}`}>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {errorLoading ? (
            <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" /></div>
          ) : selectedLogErrors.length === 0 ? (
            <p className="text-sm text-slate-400">No error details available.</p>
          ) : (
            selectedLogErrors.map((e) => (
              <div key={e.id} className="p-3 bg-red-50 border border-red-100 rounded-xl">
                <p className="text-xs font-medium text-red-600 mb-1">Row #{e.rowNumber}</p>
                <p className="text-xs text-red-500 mb-1">{e.reason}</p>
                {e.rowData && (
                  <pre className="text-xs text-slate-500 bg-white/50 rounded p-2 overflow-x-auto">{e.rowData}</pre>
                )}
              </div>
            ))
          )}
        </div>
        <div className="flex justify-end pt-4">
          <Button variant="secondary" onClick={() => setErrorModalOpen(false)}>Close</Button>
        </div>
      </Modal>
    </DashboardLayout>
  );
}

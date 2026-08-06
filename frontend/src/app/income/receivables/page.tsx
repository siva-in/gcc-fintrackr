"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useState, useEffect, useRef, useCallback } from "react";
import api from "@/lib/api";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import Pagination from "@/components/ui/Pagination";
import { Search, Download, X, Eye, EyeOff, AlertTriangle, TrendingUp, Clock, Activity, Banknote } from "lucide-react";
import toast from "react-hot-toast";

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
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
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: fmt(first), to: fmt(last) };
};

interface ReceivableReportItem {
  id: number;
  arType: string;
  dueAmt: string;
  balanceAmt: string;
  status: string;
  billDate: string;
  dueDate: string | null;
  patient: { id: number; name: string; uhid: string; mobileNo: string | null };
  bizPartner: { id: number; bpName: string } | null;
  incomeTxn: {
    id: number;
    billNo: string;
    billDate: string;
    billAmt: string;
    incomeSource: { code: string; name: string };
  } | null;
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

export default function ReceivablesPage() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [receivables, setReceivables] = useState<ReceivableReportItem[]>([]);
  const [summary, setSummary] = useState({ totalDueAmt: 0, totalBalanceAmt: 0, count: 0 });
  const [pendingBills, setPendingBills] = useState(0);
  const [aging, setAging] = useState({ current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0 });
  const [bySource, setBySource] = useState<
    { code: string; name: string; dueAmt: number; balanceAmt: number; receivedAmt: number }[]
  >([]);
  const [byMode, setByMode] = useState<{ code: string; name: string; amount: number }[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1, limit: 10 });
  const [loading, setLoading] = useState(false);

  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [fromDate, setFromDate] = useState(() => getMonthRange(currentYear, currentMonth).from);
  const [toDate, setToDate] = useState(() => getMonthRange(currentYear, currentMonth).to);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [arTypeFilter, setArTypeFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sources, setSources] = useState<{ id: number; code: string; name: string }[]>([]);

  const [tableView, setTableView] = useState<"transactions" | "logs">("transactions");
  const [importLogs, setImportLogs] = useState<ImportLogEntry[]>([]);
  const [logPagination, setLogPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [logPage, setLogPage] = useState(1);
  const [logLoading, setLogLoading] = useState(false);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    inserted: number;
    updated: number;
    skipped: number;
    failed: number;
    total: number;
    errors?: { row: number; rowData: string; reason: string }[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [selectedLogErrors, setSelectedLogErrors] = useState<ImportErrorEntry[]>([]);
  const [selectedLogInfo, setSelectedLogInfo] = useState<ImportLogEntry | null>(null);
  const [errorLoading, setErrorLoading] = useState(false);

  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<ReceivableReportItem | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payModeId, setPayModeId] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payTxnNo, setPayTxnNo] = useState("");
  const [payBank, setPayBank] = useState("");
  const [payRemarks, setPayRemarks] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [payModes, setPayModes] = useState<{ id: number; code: string; name: string }[]>([]);

  const fetchReceivables = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "10");
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      if (search) params.set("search", search);
      if (arTypeFilter) params.set("arType", arTypeFilter);
      if (sourceFilter) params.set("source", sourceFilter);
      if (statusFilter) params.set("status", statusFilter);

      const { data } = await api.get(`/reports/receivables?${params.toString()}`);
      setReceivables(data.receivables || []);
      setSummary(data.summary || { totalDueAmt: 0, totalBalanceAmt: 0, count: 0 });
      setAging(data.aging || { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0 });
      setBySource(data.bySource || []);
      setByMode(data.byMode || []);
      setPendingBills(Number(data.pendingBills) || 0);
      setPagination(data.pagination || { total: 0, page: 1, pages: 1, limit: 10 });
    } catch {
      toast.error("Failed to load receivable report");
    } finally {
      setLoading(false);
    }
  }, [page, fromDate, toDate, search, arTypeFilter, sourceFilter, statusFilter]);

  const fetchImportLogs = async (p = logPage) => {
    setLogLoading(true);
    try {
      const { data } = await api.get(`/income/advandcrcol/import-logs?page=${p}&limit=10`);
      setImportLogs(data.logs || []);
      setLogPagination(data.pagination || { total: 0, page: 1, pages: 1 });
    } catch {
      toast.error("Failed to load import logs");
    } finally {
      setLogLoading(false);
    }
  };

  useEffect(() => {
    api
      .get("/reports/income-sources")
      .then(({ data }) => setSources(data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchReceivables();
  }, [fetchReceivables]);

  const handleMonthChange = (m: number) => {
    setMonth(m);
    const range = getMonthRange(year, m);
    setFromDate(range.from);
    setToDate(range.to);
    setPage(1);
  };

  const handleYearChange = (y: number) => {
    setYear(y);
    const range = getMonthRange(y, month);
    setFromDate(range.from);
    setToDate(range.to);
    setPage(1);
  };

  const handleTableViewChange = (v: "transactions" | "logs") => {
    setTableView(v);
    if (v === "logs") fetchImportLogs();
  };

  const handleLogPageChange = (p: number) => {
    setLogPage(p);
    fetchImportLogs(p);
  };

  const openImportModal = () => {
    setSelectedFile(null);
    setImportResult(null);
    setImportModalOpen(true);
  };

  const handleImport = async () => {
    if (!selectedFile) {
      toast.error("Please select a file");
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const { data } = await api.post("/income/advandcrcol/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
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
      const { data } = await api.get(`/income/advandcrcol/import-logs/${log.id}/errors`);
      setSelectedLogErrors(data.errors || []);
    } catch {
      toast.error("Failed to load error details");
    } finally {
      setErrorLoading(false);
    }
  };

  const openPaymentModal = (r: ReceivableReportItem) => {
    setPayTarget(r);
    setPayAmount("");
    setPayModeId("");
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayTxnNo("");
    setPayBank("");
    setPayRemarks("");
    setPayModalOpen(true);
    if (payModes.length === 0) {
      api
        .get("/reports/payment-modes")
        .then(({ data }) => setPayModes(data || []))
        .catch(() => {});
    }
  };

  const handleSavePayment = async () => {
    if (!payTarget) return;
    const amt = Number(payAmount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!payModeId) {
      toast.error("Select a payment mode");
      return;
    }
    setSavingPayment(true);
    try {
      await api.post(`/reports/receivables/${payTarget.id}/payment`, {
        amount: amt,
        paymentModeId: Number(payModeId),
        paymentDate: payDate,
        transactionNo: payTxnNo || null,
        bankName: payBank || null,
        remarks: payRemarks || null,
      });
      toast.success("Payment recorded");
      setPayModalOpen(false);
      fetchReceivables();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to record payment";
      toast.error(msg);
    } finally {
      setSavingPayment(false);
    }
  };

  const formatCurrency = (val: number | string) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Number(val));
  };

  const formatDate = (d: string | null) => {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("en-GB");
  };

  const formatDateTime = (d: string | null) => {
    if (!d) return "-";
    return new Date(d).toLocaleString("en-GB");
  };

  const getFileTypeLabel = (ft: string) => {
    if (ft === "ADV") return "Advance Import";
    if (ft === "IP_ADM") return "IP Admission";
    return ft;
  };

  const getSourceColor = (code: string) => {
    const map: Record<string, string> = {
      PHARMACY: "#F97316",
      IP: "#3B82F6",
      OP: "#10B981",
      LAB: "#8B5CF6",
    };
    return map[code] || "#64748b";
  };

  const getModeColor = (code: string) => {
    const map: Record<string, string> = {
      CASH: "#22c55e",
      UPI: "#8b5cf6",
      BANK: "#3b82f6",
      CARD: "#06b6d4",
      CHEQUE: "#f59e0b",
      INSURANCE: "#ef4444",
      COMPANY: "#14b8a6",
      CREDIT: "#64748b",
    };
    return map[code] || "#64748b";
  };

  const formatCompact = (val: number | string) => {
    const n = Number(val) || 0;
    if (n >= 100000) {
      const l = n / 100000;
      return `${l % 1 === 0 ? Math.round(l) : l.toFixed(1)}L`;
    }
    if (n >= 1000) return `${Math.round(n / 1000)}K`;
    return String(n);
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      PENDING: "warning",
      PAID: "success",
      PARTIALLY_PAID: "info",
      FULLYPAID: "success",
      CANCELLED: "danger",
    };
    const v = map[status] || "info";
    return <Badge variant={v as "warning" | "success" | "info" | "danger"}>{status}</Badge>;
  };

  const dueAmt = Number(summary.totalDueAmt) || 0;
  const balAmt = Number(summary.totalBalanceAmt) || 0;
  const recAmt = dueAmt - balAmt;
  const colRate = dueAmt > 0 ? Math.round((recAmt / dueAmt) * 100) : 0;

  const agingBars = [
    { label: "1-30", value: Number(aging.d1_30) || 0, color: "#f59e0b" },
    { label: "31-60", value: Number(aging.d31_60) || 0, color: "#f97316" },
    { label: "61-90", value: Number(aging.d61_90) || 0, color: "#ef4444" },
    { label: "90+", value: Number(aging.d90) || 0, color: "#dc2626" },
  ];

  const renderSourceBars = () => {
    return (
      <div className="space-y-2.5">
        {bySource.map((s) => {
          const d = Number(s.dueAmt) || 0;
          const r = Number(s.receivedAmt) || 0;
          const p = d > 0 ? Math.round((r / d) * 100) : 0;
          return (
            <div key={s.code}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-slate-600">{s.name}</span>
                <span className="font-semibold text-slate-700">
                  {formatCompact(r)} <span className="text-slate-400">/ {formatCompact(d)}</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${p}%`, backgroundColor: getSourceColor(s.code) }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderAgingBars = () => {
    const max = Math.max(...agingBars.map((a) => a.value), 1);
    return (
      <div className="space-y-2">
        {agingBars.map((a) => (
          <div key={a.label}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="inline-flex items-center gap-2 font-semibold text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                {a.label}
              </span>
              <span className="font-semibold text-slate-700">{formatCurrency(a.value)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${(a.value / max) * 100}%`, backgroundColor: a.color }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div>
        <div className="mb-2">
          <h1 className="text-2xl font-bold text-slate-800">Receivables</h1>
          <p className="text-slate-400 text-sm mt-0.5">Consolidated receivables across all income sources</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/60 p-4 mb-0.5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-auto">
              <select
                value={year}
                onChange={(e) => handleYearChange(parseInt(e.target.value))}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              >
                {getYearOptions().map((y) => (
                  <option key={y.value} value={y.value}>
                    {y.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-auto">
              <select
                value={month}
                onChange={(e) => handleMonthChange(parseInt(e.target.value))}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              >
                {MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setPage(1)}
                placeholder="Patient / bill no..."
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>
            <div className="w-full sm:w-auto">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>
            <div className="w-full sm:w-auto">
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>
            <select
              value={arTypeFilter}
              onChange={(e) => setArTypeFilter(e.target.value)}
              className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            >
              <option value="">All Types</option>
              <option value="PATIENT">Patient Credit</option>
              <option value="INSURANCE">Insurance</option>
              <option value="CORPORATE">Company</option>
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            >
              <option value="">All Sources</option>
              {sources.map((s) => (
                <option key={s.id} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            >
              <option value="">All Status</option>
              <option value="PENDING">Unpaid</option>
              <option value="PARTIALLY_PAID">Partially Paid</option>
              <option value="PAID">Paid</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <Button onClick={() => setPage(1)}>
              <Search size={16} className="mr-1" /> Search
            </Button>
            <div className="flex gap-2 sm:ml-auto">
              <button
                onClick={openImportModal}
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              >
                <Download size={16} className="mr-1" /> Import Credit Col
              </button>
              <button
                onClick={() => handleTableViewChange(tableView === "transactions" ? "logs" : "transactions")}
                title={tableView === "transactions" ? "View Import Logs" : "View Receivables"}
                className={`inline-flex items-center justify-center px-4 py-2.5 rounded-xl font-semibold transition-all border ${
                  tableView === "logs"
                    ? "bg-gradient-to-r from-indigo-500 to-indigo-600 text-white border-transparent shadow-md shadow-indigo-500/30"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                {tableView === "transactions" ? <Eye size={24} /> : <EyeOff size={24} />}
              </button>
            </div>
          </div>
        </div>

        {tableView === "transactions" && (
          <>
            <div className="mb-0.5 bg-white rounded-2xl border border-slate-200/60 p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br rounded-2xl border border-amber-100 p-4 shadow-sm">
                  <span className="flex items-center gap-2 text-slate-700 font-semibold mb-3">
                    <Activity size={16} className="text-indigo-500" /> Due by Source
                  </span>
                  {renderSourceBars()}
                </div>
                <div className="bg-gradient-to-br rounded-2xl border border-blue-200 p-4 shadow-sm">
                  <span className="flex items-center gap-2 text-slate-700 font-semibold mb-3">
                    <TrendingUp size={16} className="text-emerald-500" /> Collection Rate
                  </span>
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-6 text-sm">
                        <span className="inline-flex items-center gap-2 text-slate-600">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-violet-500" />
                          Total Due
                        </span>
                        <span className="font-semibold text-slate-700">{formatCurrency(dueAmt)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-6 text-sm">
                        <span className="inline-flex items-center gap-2 text-slate-600">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-emerald-500" />
                          Received
                        </span>
                        <span className="font-semibold text-emerald-600">{formatCurrency(recAmt)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-6 text-sm">
                        <span className="inline-flex items-center gap-2 text-slate-600">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-amber-500" />
                          Balance
                        </span>
                        <span className="font-semibold text-amber-600">{formatCurrency(balAmt)}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-center gap-1.5 shrink-0">
                      <div className="relative w-16 h-16">
                        <div
                          className="absolute inset-0 rounded-full"
                          style={{
                            background: `conic-gradient(#10b981 0deg ${colRate * 3.6}deg, #e2e8f0 ${colRate * 3.6}deg 360deg)`,
                          }}
                        />
                        <div className="absolute inset-1.5 rounded-full bg-white flex items-center justify-center">
                          <span className="text-base font-extrabold text-emerald-600">{colRate}%</span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 text-center leading-snug">
                        {formatCompact(recAmt)} of {formatCompact(dueAmt)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 border-t border-slate-200 pt-2">
                    <p className="text-xs font-semibold text-red-500">No of Pending Receivables {pendingBills}</p>
                  </div>
                </div>
                <div className="bg-gradient-to-br  rounded-2xl border border-emerald-100 p-4 shadow-sm">
                  <span className="flex items-center gap-2 text-slate-700 font-semibold mb-3">
                    <Banknote size={16} className="text-emerald-500" /> Received by Mode
                  </span>
                  {byMode.length === 0 ? (
                    <p className="text-sm text-slate-400">No collections yet</p>
                  ) : (
                    <>
                      {(() => {
                        const total = byMode.reduce((s, m) => s + m.amount, 0) || 1;
                        let cursor = 0;
                        const stops = byMode
                          .map((m) => {
                            const start = cursor;
                            cursor += (m.amount / total) * 360;
                            return `${getModeColor(m.code)} ${start}deg ${cursor}deg`;
                          })
                          .join(", ");
                        const center = `flex flex-col items-center justify-center absolute inset-2 rounded-full bg-white`;
                        return (
                          <div className="flex items-center justify-center gap-4 mb-3">
                            <div className="relative w-24 h-24 shrink-0">
                              <div
                                className="absolute inset-0 rounded-full"
                                style={{ background: `conic-gradient(${stops})` }}
                              />
                              <div className={center}>
                                <span className="text-lg font-extrabold text-slate-800">{formatCompact(recAmt)}</span>
                                <span className="text-[10px] font-medium text-slate-400">collected</span>
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              {byMode.map((m) => (
                                <div key={m.code} className="flex items-center justify-between gap-4 text-xs">
                                  <span className="inline-flex items-center gap-1.5 text-slate-600">
                                    <span
                                      className="w-2.5 h-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: getModeColor(m.code) }}
                                    />
                                    {m.name}
                                  </span>
                                  <span className="font-semibold text-slate-700">{formatCurrency(m.amount)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                      <div className="flex items-center justify-between text-sm border-t border-slate-100 pt-2">
                        <span className="font-semibold text-slate-500">Total</span>
                        <span className="font-bold text-slate-800">{formatCurrency(recAmt)}</span>
                      </div>
                    </>
                  )}
                </div>
                <div className="bg-gradient-to-br rounded-2xl border border-red-200 p-4 shadow-sm">
                  <span className="flex items-center gap-2 text-slate-700 font-semibold mb-3">
                    <Clock size={16} className="text-sky-500" /> Aging Analysis
                  </span>
                  {renderAgingBars()}
                </div>
              </div>
            </div>

            <div className="mt-1 bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                </div>
              ) : receivables.length === 0 ? (
                <div className="text-center py-20 text-slate-400">No receivables found</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/50">
                        <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                          Bill No
                        </th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                          Type
                        </th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                          Patient
                        </th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                          Source
                        </th>
                        <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                          Due
                        </th>
                        <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                          Paid
                        </th>
                        <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                          Balance
                        </th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                          Due Date
                        </th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                          Status
                        </th>
                        <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {receivables.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-700">{r.incomeTxn?.billNo || "-"}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                              {r.arType}
                            </span>
                            {r.bizPartner && (
                              <span className="ml-1 text-xs text-slate-500">({r.bizPartner.bpName})</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-slate-700">{r.patient.name}</span>
                            <span className="text-xs text-slate-400 ml-1">({r.patient.uhid})</span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{r.incomeTxn?.incomeSource?.code || "-"}</td>
                          <td className="px-4 py-3 text-right font-medium text-slate-700">
                            {formatCurrency(r.dueAmt)}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-emerald-600">
                            {formatCurrency(Number(r.dueAmt) - Number(r.balanceAmt))}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-amber-600">
                            {formatCurrency(r.balanceAmt)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{formatDate(r.dueDate)}</td>
                          <td className="px-4 py-3">{getStatusBadge(r.status)}</td>
                          <td className="px-4 py-3">
                            {(r.arType === "INSURANCE" || r.arType === "CORPORATE") && Number(r.balanceAmt) > 0 && (
                              <button
                                onClick={() => openPaymentModal(r)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-100 transition-colors"
                              >
                                <Banknote size={12} /> Record Payment
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="px-4 py-3 border-t border-slate-200">
                <Pagination
                  page={pagination.page}
                  totalPages={pagination.pages}
                  total={pagination.total}
                  limit={pagination.limit}
                  onPageChange={setPage}
                />
              </div>
            </div>
          </>
        )}

        {tableView === "logs" && (
          <>
            <h2 className="text-lg font-bold text-slate-800 mb-4">Import History</h2>
            <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200/60">
                      <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                        File Name
                      </th>
                      <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden sm:table-cell">
                        Type
                      </th>
                      <th className="text-center px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                        Total
                      </th>
                      <th className="text-center px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider text-emerald-500">
                        Inserted
                      </th>
                      <th className="text-center px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden sm:table-cell text-amber-500">
                        Updated
                      </th>
                      <th className="text-center px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden sm:table-cell">
                        Skipped
                      </th>
                      <th className="text-center px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider text-red-500">
                        Failed
                      </th>
                      <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden lg:table-cell">
                        Started
                      </th>
                      <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {logLoading ? (
                      <tr>
                        <td colSpan={9} className="text-center py-12">
                          <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mx-auto" />
                        </td>
                      </tr>
                    ) : importLogs.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center text-slate-400 py-12">
                          No imports yet
                        </td>
                      </tr>
                    ) : (
                      importLogs.map((log) => (
                        <tr
                          key={log.id}
                          className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors"
                        >
                          <td className="px-5 py-3.5 font-medium text-slate-700">{log.fileName}</td>
                          <td className="px-5 py-3.5 hidden sm:table-cell">
                            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                              {getFileTypeLabel(log.fileType)}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-center font-medium text-slate-700">{log.totalRecords}</td>
                          <td className="px-5 py-3.5 text-center font-medium text-emerald-600">{log.inserted}</td>
                          <td className="px-5 py-3.5 text-center hidden sm:table-cell font-medium text-blue-600">
                            {log.updated}
                          </td>
                          <td className="px-5 py-3.5 text-center hidden sm:table-cell font-medium text-slate-500">
                            {log.skipped}
                          </td>
                          <td className="px-5 py-3.5 text-center font-medium text-red-600">{log.failed}</td>
                          <td className="px-5 py-3.5 hidden lg:table-cell text-slate-400 text-xs">
                            {formatDateTime(log.importStarted)}
                          </td>
                          <td className="px-5 py-3.5">
                            {log.failed > 0 && log._count.errors > 0 && (
                              <button
                                onClick={() => handleViewErrors(log)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors"
                              >
                                <AlertTriangle size={12} /> View {log._count.errors} Error
                                {log._count.errors > 1 ? "s" : ""}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {logPagination.pages > 1 && (
              <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/50">
                  <Pagination
                    page={logPage}
                    totalPages={logPagination.pages}
                    total={logPagination.total}
                    limit={10}
                    onPageChange={handleLogPageChange}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <Modal
        isOpen={payModalOpen}
        onClose={() => {
          if (!savingPayment) setPayModalOpen(false);
        }}
        title="Record Payment Received"
      >
        <div className="space-y-4">
          {payTarget && (
            <>
              <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-600 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Bill No</span>
                  <span className="font-medium">{payTarget.incomeTxn?.billNo || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Payer</span>
                  <span className="font-medium">
                    {payTarget.arType} {payTarget.bizPartner ? `(${payTarget.bizPartner.bpName})` : ""}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Balance</span>
                  <span className="font-medium text-amber-600">{formatCurrency(payTarget.balanceAmt)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Payment Mode *</label>
                <select
                  value={payModeId}
                  onChange={(e) => setPayModeId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  <option value="">Select mode</option>
                  {payModes.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Amount *</label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  max={payTarget.balanceAmt}
                  placeholder="Enter amount received"
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Payment Date</label>
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Transaction No</label>
                <input
                  type="text"
                  value={payTxnNo}
                  onChange={(e) => setPayTxnNo(e.target.value)}
                  placeholder="Bank / UPI reference"
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Bank Name</label>
                <input
                  type="text"
                  value={payBank}
                  onChange={(e) => setPayBank(e.target.value)}
                  placeholder="Payer bank"
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Remarks</label>
                <input
                  type="text"
                  value={payRemarks}
                  onChange={(e) => setPayRemarks(e.target.value)}
                  placeholder="Optional note"
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setPayModalOpen(false)} disabled={savingPayment}>
              Cancel
            </Button>
            <Button onClick={handleSavePayment} isLoading={savingPayment}>
              Record Payment
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={importModalOpen}
        onClose={() => {
          if (!importing) setImportModalOpen(false);
        }}
        title="Import Credit Collection"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Upload an Excel file with columns:{" "}
            <strong>
              S.No, Vou.No, Date, Voucher Type, Bill Name, Bill No, Amount, payment_refno, cash_amount, card_amount,
              cheque_amount, neft_amount, UPI Amt
            </strong>
          </p>
          <p className="text-xs text-slate-400">
            Credit Collection (LAB) and Receipt Pharmacy Bill (PHARMA) rows settle receivables; Vou.No is stored as the
            transaction reference.
          </p>

          <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-indigo-400 transition-colors">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setSelectedFile(f);
                  setImportResult(null);
                }
              }}
            />
            {selectedFile ? (
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm text-slate-600">{selectedFile.name}</span>
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setImportResult(null);
                  }}
                  className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="text-sm text-indigo-500 hover:text-indigo-600 font-medium"
              >
                Click to select file
              </button>
            )}
          </div>

          {importResult && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
              <p className="text-sm text-emerald-600 font-medium">Import Summary</p>
              <p className="text-xs text-emerald-600">
                Total rows: {importResult.total} | Inserted: {importResult.inserted} | Updated: {importResult.updated} |
                Skipped: {importResult.skipped} | Failed: {importResult.failed}
              </p>
              {importResult.errors && importResult.errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {importResult.errors.slice(0, 10).map((e, i) => (
                    <p key={i} className="text-xs text-amber-700">
                      Row {e.row}: {e.reason}
                    </p>
                  ))}
                  {importResult.errors.length > 10 && (
                    <p className="text-xs text-amber-500">...and {importResult.errors.length - 10} more</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                if (!importing) setImportModalOpen(false);
              }}
            >
              {importResult ? "Close" : "Cancel"}
            </Button>
            {!importResult && (
              <Button onClick={handleImport} disabled={!selectedFile} isLoading={importing}>
                Import
              </Button>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={errorModalOpen}
        onClose={() => setErrorModalOpen(false)}
        title={`Error Details - ${selectedLogInfo?.fileName || ""}`}
      >
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {errorLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : selectedLogErrors.length === 0 ? (
            <p className="text-sm text-slate-400">No error details available.</p>
          ) : (
            selectedLogErrors.map((e) => (
              <div key={e.id} className="p-3 bg-red-50 border border-red-100 rounded-xl">
                <p className="text-xs font-medium text-red-600 mb-1">Row #{e.rowNumber}</p>
                <p className="text-xs text-slate-500 mb-1">{e.rowData}</p>
                <p className="text-xs text-red-500">{e.reason}</p>
              </div>
            ))
          )}
        </div>
      </Modal>
    </DashboardLayout>
  );
}

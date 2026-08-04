"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { Download, X, Eye, EyeOff, Search, CheckCircle, AlertTriangle, UserStar, UserRoundX } from "lucide-react";
import Pagination from "@/components/ui/Pagination";

interface Dashboard {
  cash: number;
  bank: number;
  credit: number;
  total: number;
}

interface PharmaTxn {
  id: number;
  billNo: string;
  billDate: string | null;
  grossAmount: number | null;
  discountAmount: number | null;
  billAmt: number | null;
  tax: number | null;
  pymt_status: string;
  txn_status: string;
  errorReason: string | null;
  patient: { id: number; name: string; uhid: string | null; mobileNo: string | null } | null;
  ipAdm?: { id: number; ipNo: string } | null;
  rcvdPymts: {
    id: number;
    amount: number | null;
    paidBy: string | null;
    paymentMode: { code: string; name: string } | null;
  }[];
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

export default function IncomePharmaPage() {
  const router = useRouter();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const [dashYear, setDashYear] = useState(currentYear);
  const [dashMonth, setDashMonth] = useState(currentMonth);
  const [dashFromDate, setDashFromDate] = useState(() => getMonthRange(currentYear, currentMonth).from);
  const [dashToDate, setDashToDate] = useState(() => getMonthRange(currentYear, currentMonth).to);
  const [dashboard, setDashboard] = useState<Dashboard>({ cash: 0, bank: 0, credit: 0, total: 0 });

  const [txns, setTxns] = useState<PharmaTxn[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [txnPaymentFilter, setTxnPaymentFilter] = useState("");
  const [txnPymtStatusFilter, setTxnPymtStatusFilter] = useState("");
  const [txnStatusFilter, setTxnStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [hasSearched, setHasSearched] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkVerifying, setBulkVerifying] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

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

  const [importLogs, setImportLogs] = useState<ImportLogEntry[]>([]);
  const [logPagination, setLogPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [logPage, setLogPage] = useState(1);
  const [logLoading, setLogLoading] = useState(false);

  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [selectedLogErrors, setSelectedLogErrors] = useState<ImportErrorEntry[]>([]);
  const [selectedLogInfo, setSelectedLogInfo] = useState<ImportLogEntry | null>(null);
  const [errorLoading, setErrorLoading] = useState(false);
  const [tableView, setTableView] = useState<"transactions" | "logs">("transactions");

  const fetchDashboard = async (fd = dashFromDate, td = dashToDate) => {
    try {
      const params = new URLSearchParams();
      if (fd) params.set("fromDate", fd);
      if (td) params.set("toDate", td);
      const { data } = await api.get(`/income/pharma/dashboard?${params.toString()}`);
      setDashboard(data);
    } catch {
      toast.error("Failed to load dashboard");
    }
  };

  const fetchTxns = async (
    p = page,
    s = search,
    fd = fromDate,
    td = toDate,
    pm = txnPaymentFilter,
    ps = txnPymtStatusFilter,
    ts = txnStatusFilter,
  ) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "10" });
      if (s) params.set("search", s);
      if (fd) params.set("fromDate", fd);
      if (td) params.set("toDate", td);
      if (pm) params.set("paymentMode", pm);
      if (ps) params.set("pymtStatus", ps);
      if (ts) params.set("txnStatus", ts);
      const { data } = await api.get(`/income/pharma/txns?${params.toString()}`);
      setTxns(data.txns);
      setPagination(data.pagination);
      setHasSearched(true);
    } catch {
      toast.error("Failed to load transactions");
    } finally {
      setLoading(false);
    }
  };

  const fetchImportLogs = async (p = logPage) => {
    setLogLoading(true);
    try {
      const { data } = await api.get(`/income/pharma/import-logs?page=${p}&limit=10`);
      setImportLogs(data.logs || []);
      setLogPagination(data.pagination || { total: 0, page: 1, pages: 1 });
    } catch {
      toast.error("Failed to load import logs");
    } finally {
      setLogLoading(false);
    }
  };

  useEffect(() => {
    const range = getMonthRange(dashYear, dashMonth);
    setDashFromDate(range.from);
    setDashToDate(range.to);
  }, [dashYear, dashMonth]);

  useEffect(() => {
    fetchDashboard();
    if (!hasSearched) {
      setHasSearched(true);
      setFromDate(dashFromDate);
      setToDate(dashToDate);
      fetchTxns(1, "", dashFromDate, dashToDate, txnPaymentFilter, txnPymtStatusFilter, txnStatusFilter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTxnMonthChange = (month: number) => {
    setDashMonth(month);
    const range = getMonthRange(dashYear, month);
    setDashFromDate(range.from);
    setDashToDate(range.to);
    setFromDate(range.from);
    setToDate(range.to);
    setPage(1);
    setHasSearched(true);
    fetchDashboard(range.from, range.to);
    fetchTxns(1, search, range.from, range.to, txnPaymentFilter, txnPymtStatusFilter, txnStatusFilter);
  };

  const handleTxnYearChange = (year: number) => {
    setDashYear(year);
    const range = getMonthRange(year, dashMonth);
    setDashFromDate(range.from);
    setDashToDate(range.to);
    setFromDate(range.from);
    setToDate(range.to);
    setPage(1);
    setHasSearched(true);
    fetchDashboard(range.from, range.to);
    fetchTxns(1, search, range.from, range.to, txnPaymentFilter, txnPymtStatusFilter, txnStatusFilter);
  };

  const handleCardClick = (mode?: "CASH" | "BANK" | "CREDIT") => {
    setTxnPaymentFilter(mode || "");
    setTxnPymtStatusFilter("");
    setTxnStatusFilter("");
    setSearch("");
    setFromDate(dashFromDate);
    setToDate(dashToDate);
    setPage(1);
    setHasSearched(true);
    fetchTxns(1, "", dashFromDate, dashToDate, mode || "", "", "");
  };

  const handleSearch = () => {
    setPage(1);
    setDashFromDate(fromDate);
    setDashToDate(toDate);
    fetchDashboard(fromDate, toDate);
    fetchTxns(1, search, fromDate, toDate, txnPaymentFilter, txnPymtStatusFilter, txnStatusFilter);
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    fetchTxns(p, search, fromDate, toDate, txnPaymentFilter, txnPymtStatusFilter, txnStatusFilter);
  };

  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    const unverified = txns.filter((t) => t.txn_status === "UNVERIFIED");
    if (selectedIds.size === unverified.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(unverified.map((t) => t.id)));
    }
  };

  const handleBulkVerify = () => {
    if (selectedIds.size === 0) return;
    setShowConfirmModal(true);
  };

  const handleConfirmVerify = async () => {
    setShowConfirmModal(false);
    setBulkVerifying(true);
    try {
      await api.post("/income/pharma/txns/bulk-verify", { ids: Array.from(selectedIds) });
      toast.success(`${selectedIds.size} transaction(s) verified`);
      setSelectedIds(new Set());
      fetchTxns(page, search, fromDate, toDate, txnPaymentFilter, txnPymtStatusFilter, txnStatusFilter);
    } catch {
      toast.error("Bulk verify failed");
    } finally {
      setBulkVerifying(false);
    }
  };

  const handleRowClick = (txn: PharmaTxn) => {
    sessionStorage.setItem(
      "pharmaFilterState",
      JSON.stringify({
        page,
        search,
        fromDate,
        toDate,
        txnPaymentFilter,
        txnPymtStatusFilter,
        txnStatusFilter,
      }),
    );
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (fromDate) p.set("fromDate", fromDate);
    if (toDate) p.set("toDate", toDate);
    if (txnPaymentFilter) p.set("pm", txnPaymentFilter);
    if (txnPymtStatusFilter) p.set("ps", txnPymtStatusFilter);
    if (txnStatusFilter) p.set("ts", txnStatusFilter);
    p.set("page", String(page));
    p.set("tab", "transactions");
    router.push(`/income/pharma/txns/${txn.id}?${p.toString()}`);
  };

  useEffect(() => {
    const saved = sessionStorage.getItem("pharmaFilterState");
    if (saved) {
      try {
        const s = JSON.parse(saved);
        setPage(s.page || 1);
        setSearch(s.search || "");
        setFromDate(s.fromDate || dashFromDate);
        setToDate(s.toDate || dashToDate);
        setTxnPaymentFilter(s.txnPaymentFilter || "");
        setTxnPymtStatusFilter(s.txnPymtStatusFilter || "");
        setTxnStatusFilter(s.txnStatusFilter || "");
        setHasSearched(true);
        fetchTxns(
          s.page || 1,
          s.search || "",
          s.fromDate || dashFromDate,
          s.toDate || dashToDate,
          s.txnPaymentFilter || "",
          s.txnPymtStatusFilter || "",
          s.txnStatusFilter || "",
        );
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogPageChange = (p: number) => {
    setLogPage(p);
    fetchImportLogs(p);
  };

  const handleTableViewChange = (v: "transactions" | "logs") => {
    setTableView(v);
    if (v === "logs") fetchImportLogs();
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
      const { data } = await api.post("/income/pharma/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportResult(data);
      setSelectedFile(null);
      toast.success(data.message || "Import complete");
      fetchImportLogs(1);
      fetchDashboard();
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
      const { data } = await api.get(`/income/pharma/import-logs/${log.id}/errors`);
      setSelectedLogErrors(data.errors || []);
    } catch {
      toast.error("Failed to load error details");
    } finally {
      setErrorLoading(false);
    }
  };

  const formatCurrency = (val: number | null | undefined) => {
    if (val == null) return "-";
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(val);
  };

  const formatDate = (d: string | null) => {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("en-GB");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "VERIFIED":
        return "bg-emerald-50 text-emerald-600";
      case "UNVERIFIED":
        return "bg-orange-50 text-orange-600";
      case "REVIEW_REQ":
        return "bg-amber-50 text-amber-600";
      case "ERROR":
        return "bg-red-50 text-red-600";
      default:
        return "bg-slate-50 text-slate-500";
    }
  };

  const getPymtStatusColor = (status: string) => {
    switch (status) {
      case "FULLYPAID":
        return "bg-emerald-50 text-emerald-600";
      case "PARTIALPAID":
        return "bg-amber-50 text-amber-600";
      case "UNPAID":
        return "bg-red-50 text-red-600";
      default:
        return "bg-slate-50 text-slate-500";
    }
  };

  return (
    <DashboardLayout>
      <div>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Pharma - Pharmacy Income</h1>
            <p className="text-sm text-slate-400 mt-1">Manage pharmacy sales, payments, and imports</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              onClick={() => handleCardClick("CASH")}
              className="bg-white rounded-2xl border border-slate-200/60 p-4 hover:border-emerald-300 hover:shadow-md transition-all text-left"
            >
              <p className="text-xs font-medium text-slate-400">Cash</p>
              <p className="text-lg font-bold text-emerald-600 mt-1">{formatCurrency(dashboard.cash)}</p>
            </button>
            <button
              onClick={() => handleCardClick("BANK")}
              className="bg-white rounded-2xl border border-slate-200/60 p-4 hover:border-blue-300 hover:shadow-md transition-all text-left"
            >
              <p className="text-xs font-medium text-slate-400">Bank / UPI / Card</p>
              <p className="text-lg font-bold text-blue-600 mt-1">{formatCurrency(dashboard.bank)}</p>
            </button>
            <button
              onClick={() => handleCardClick("CREDIT")}
              className="bg-white rounded-2xl border border-slate-200/60 p-4 hover:border-amber-300 hover:shadow-md transition-all text-left"
            >
              <p className="text-xs font-medium text-slate-400">Credit</p>
              <p className="text-lg font-bold text-amber-600 mt-1">{formatCurrency(dashboard.credit)}</p>
            </button>
            <button
              onClick={() => handleCardClick()}
              className="bg-white rounded-2xl border border-slate-200/60 p-4 hover:border-indigo-300 hover:shadow-md transition-all text-left"
            >
              <p className="text-xs font-medium text-slate-400">Total</p>
              <p className="text-lg font-bold text-indigo-600 mt-1">{formatCurrency(dashboard.total)}</p>
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-slate-200/60 p-4 flex-1">
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="w-full sm:w-auto">
                <select
                  value={dashYear}
                  onChange={(e) => handleTxnYearChange(parseInt(e.target.value))}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
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
                  value={dashMonth}
                  onChange={(e) => handleTxnMonthChange(parseInt(e.target.value))}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 w-full sm:max-w-xs">
                <div className="relative">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Bill No, Patient, UHID, IP No..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>
              <div className="w-full sm:w-auto">
                <select
                  value={txnPaymentFilter}
                  onChange={(e) => setTxnPaymentFilter(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                >
                  <option value="">All Payment</option>
                  <option value="CASH">Cash</option>
                  <option value="BANK">Bank</option>
                  <option value="CARD">Card</option>
                  <option value="UPI">UPI</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>
              <div className="w-full sm:w-auto">
                <select
                  value={txnPymtStatusFilter}
                  onChange={(e) => setTxnPymtStatusFilter(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                >
                  <option value="">All Pymt Status</option>
                  <option value="FULLYPAID">Fully Paid</option>
                  <option value="PARTIALPAID">Partial</option>
                  <option value="UNPAID">Unpaid</option>
                </select>
              </div>
              <div className="w-full sm:w-auto">
                <select
                  value={txnStatusFilter}
                  onChange={(e) => setTxnStatusFilter(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                >
                  <option value="">All Txn Status</option>
                  <option value="VERIFIED">Verified</option>
                  <option value="UNVERIFIED">Unverified</option>
                  <option value="REVIEW_REQ">Review Req</option>
                  <option value="ERROR">Error</option>
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
              <Button onClick={handleSearch} isLoading={loading}>
                <Search size={16} className="mr-1" /> Search
              </Button>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200/60 p-4 flex flex-wrap gap-2 items-center content-center justify-center lg:w-[450px]">
            <button
              onClick={() => {
                setImportResult(null);
                setSelectedFile(null);
                setImportModalOpen(true);
              }}
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100"
            >
                <Download size={16} className="mr-1" /> Import Pharmacy Bills
            </button>
            <button
              onClick={() => handleTableViewChange(tableView === "transactions" ? "logs" : "transactions")}
              title={tableView === "transactions" ? "View Import Logs" : "View Transactions"}
              className={`inline-flex items-center justify-center px-4 py-2.5 rounded-xl font-semibold transition-all border ${
                tableView === "logs"
                  ? "bg-gradient-to-r from-indigo-500 to-indigo-600 text-white border-transparent shadow-md shadow-indigo-500/30"
                  : "bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100"
              }`}
            >
              {tableView === "transactions" ? <Eye size={24} /> : <EyeOff size={24} />}
            </button>
          </div>
        </div>

        {tableView === "transactions" && (
          <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 px-4 py-3 bg-indigo-50/50 border-b border-indigo-100">
                <span className="text-sm font-medium text-indigo-700">{selectedIds.size} selected</span>
                <Button onClick={handleBulkVerify} isLoading={bulkVerifying} size="sm">
                  <CheckCircle size={16} className="mr-1" /> Mark Verified
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setSelectedIds(new Set())}>
                  Clear
                </Button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200/60">
                    <th className="w-10 px-2 py-3.5">
                      {txns.some((t) => t.txn_status === "UNVERIFIED") && (
                        <input
                          type="checkbox"
                          checked={
                            txns.filter((t) => t.txn_status === "UNVERIFIED").length > 0 &&
                            selectedIds.size === txns.filter((t) => t.txn_status === "UNVERIFIED").length
                          }
                          onChange={handleSelectAll}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 accent-indigo-600"
                        />
                      )}
                    </th>
                    <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                      Bill No
                    </th>
                    <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden sm:table-cell">
                      Date
                    </th>
                    <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                      Patient
                    </th>
                    <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden md:table-cell">
                      IP No
                    </th>
                    <th className="text-right px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                      Net Amt
                    </th>
                    <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                      Payment
                    </th>
                    <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                      Pymt Status
                    </th>
                    <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                      Txn Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {!loading && !hasSearched && (
                    <tr>
                      <td colSpan={9} className="text-center text-slate-400 py-12">
                        Use the search or date filter to view transactions
                      </td>
                    </tr>
                  )}
                  {loading && (
                    <tr>
                      <td colSpan={9} className="text-center py-12">
                        <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mx-auto" />
                      </td>
                    </tr>
                  )}
                  {!loading && hasSearched && txns.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center text-slate-400 py-12">
                        No transactions found
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    txns.map((txn) => {
                      const isReviewReq = txn.txn_status === "REVIEW_REQ";
                      return (
                        <tr
                          key={txn.id}
                          onClick={() => handleRowClick(txn)}
                          className={`border-b border-slate-100 last:border-0 cursor-pointer group hover:bg-slate-100/80 transition-colors ${txn.txn_status === "ERROR" ? "bg-red-50/50" : ""}`}
                        >
                          <td className="w-10 px-2 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                            {txn.txn_status === "UNVERIFIED" && (
                              <input
                                type="checkbox"
                                checked={selectedIds.has(txn.id)}
                                onChange={() => handleToggleSelect(txn.id)}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 accent-indigo-600"
                              />
                            )}
                          </td>
                          <td
                            className={`px-5 py-3.5 font-medium group-hover:text-purple-700 ${isReviewReq ? "text-amber-600" : "text-slate-700"}`}
                          >
                            {txn.billNo}
                          </td>
                          <td className="px-5 py-3.5 hidden sm:table-cell text-slate-500">
                            {formatDate(txn.billDate)}
                          </td>
                          <td className="px-5 py-3.5 text-slate-700">
                            {txn.patient ? (
                              <span className="inline-flex items-center gap-1.5">
                                <UserStar size={23} className="text-indigo-500 shrink-0" />
                                {txn.patient.name}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5">
                                <UserRoundX size={20} className="text-red-500 shrink-0" />
                                <span className="text-black">{txn.rcvdPymts.find((p) => p.paidBy)?.paidBy || "-"}</span>
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 hidden md:table-cell text-slate-500">{txn.ipAdm?.ipNo || "-"}</td>
                          <td className="px-5 py-3.5 text-right font-medium text-slate-700">
                            {formatCurrency(txn.billAmt)}
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex flex-wrap gap-1.5">
                              {txn.rcvdPymts.length > 0 ? (
                                txn.rcvdPymts.map((pmt) => (
                                  <span
                                    key={pmt.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded text-xs font-medium text-slate-600"
                                  >
                                    {pmt.paymentMode?.code || "?"} {formatCurrency(pmt.amount)}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-slate-400">-</span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${getPymtStatusColor(txn.pymt_status)}`}
                            >
                              {txn.pymt_status}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(txn.txn_status)}`}
                            >
                              {txn.txn_status === "REVIEW_REQ" ? "REVIEW REQ" : txn.txn_status}
                            </span>
                            {txn.txn_status === "ERROR" && txn.errorReason && (
                              <span
                                className="block text-[10px] text-red-500 max-w-[180px] truncate mt-1"
                                title={txn.errorReason}
                              >
                                {txn.errorReason}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            {hasSearched && (
              <Pagination
                page={page}
                totalPages={pagination.pages}
                total={pagination.total}
                limit={10}
                onPageChange={handlePageChange}
              />
            )}
          </div>
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
                      <th className="text-center px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                        <span className="text-emerald-500">Inserted</span>
                      </th>
                      <th className="text-center px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden sm:table-cell">
                        <span className="text-amber-500">Updated</span>
                      </th>
                      <th className="text-center px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                        <span className="text-slate-400">Skipped</span>
                      </th>
                      <th className="text-center px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                        <span className="text-red-500">Failed</span>
                      </th>
                      <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden md:table-cell">
                        Imported At
                      </th>
                      <th className="text-center px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {logLoading ? (
                      <tr>
                        <td colSpan={9} className="text-center py-12 text-slate-400">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                            Loading...
                          </div>
                        </td>
                      </tr>
                    ) : importLogs.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="text-center py-12 text-slate-400">
                          No import logs found
                        </td>
                      </tr>
                    ) : (
                      importLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/80">
                          <td className="px-5 py-3.5 font-medium text-slate-700 max-w-[200px] truncate">
                            {log.fileName}
                          </td>
                          <td className="px-5 py-3.5 hidden sm:table-cell">
                            <span className="inline-block px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-medium">
                              Pharma Billing
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-center text-slate-700">{log.totalRecords}</td>
                          <td className="px-5 py-3.5 text-center">
                            <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                              {log.inserted}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-center hidden sm:table-cell">
                            <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                              {log.updated}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span
                              className={`inline-flex items-center gap-1 font-medium ${log.skipped > 0 ? "text-slate-500" : "text-slate-300"}`}
                            >
                              {log.skipped}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span
                              className={`inline-flex items-center gap-1 font-medium ${log.failed > 0 ? "text-red-600" : "text-slate-400"}`}
                            >
                              {log.failed}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-slate-500 hidden md:table-cell">
                            {new Date(log.importStarted).toLocaleString("en-GB")}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            {log.failed > 0 ? (
                              <button
                                onClick={() => handleViewErrors(log)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-medium hover:bg-red-100 transition-colors"
                              >
                                <Eye size={14} /> View Errors
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">No errors</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {logPagination.pages > 1 && (
                <Pagination
                  page={logPage}
                  totalPages={logPagination.pages}
                  total={logPagination.total}
                  limit={10}
                  onPageChange={handleLogPageChange}
                />
              )}
            </div>
          </>
        )}
      </div>

      <Modal
        isOpen={importModalOpen}
        onClose={() => {
          if (!importing) setImportModalOpen(false);
        }}
        title="Import Pharma Billing"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Upload a Pharma Sales Excel file with columns:{" "}
            <strong>
              S.No, Entry Name, Entry Date, Entry No, Customer, Total Amt, Discount, Tax, Net Amount, Patient_name,
              Payment Mode, Mobile No, Credit Status
            </strong>
          </p>
          <p className="text-xs text-slate-400">
            Patients are matched when Customer starts with GCCH (UHID before the dash). Payment Mode may be a CSV (e.g.
            Cash,Bank). Credit sales create receivables; multi-mode or Bank payments are flagged for review.
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
              <p className="text-sm text-emerald-700 font-medium">Import Summary</p>
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

      <Modal isOpen={showConfirmModal} onClose={() => setShowConfirmModal(false)} title="Confirm Verification">
        <div className="flex flex-col items-center text-center py-2">
          <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle size={28} className="text-amber-500" />
          </div>
          <p className="text-sm text-slate-600 mb-6">
            Are you sure you want to mark <strong>{selectedIds.size}</strong> transaction(s) as{" "}
            <strong>VERIFIED</strong>?
          </p>
          <div className="flex gap-3 w-full">
            <Button variant="secondary" className="flex-1" onClick={() => setShowConfirmModal(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleConfirmVerify} isLoading={bulkVerifying}>
              Confirm
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}

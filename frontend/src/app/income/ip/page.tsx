"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { Suspense, useState, useRef, useEffect, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { Download, Search, X, Banknote, CreditCard, Wallet, TrendingUp, List, LayoutDashboard, Clock, CheckCircle2, XCircle, Eye, EyeOff, Stethoscope } from "lucide-react";
import Pagination from "@/components/ui/Pagination";

interface Dashboard {
  cash: number;
  bank: number;
  credit: number;
  total: number;
  doctorFeeLiability: number;
}

interface IncomeTxn {
  id: number;
  billNo: string;
  billDate: string | null;
  billAmt: number | null;
  grossAmount: number | null;
  discountAmount: number | null;
  advAdjt: number | null;
  pymt_status: string;
  txn_status: string;
  errorReason: string | null;
  patient: { id: number; name: string; uhid: string | null; mobileNo: string | null } | null;
  rcvdPymts: { id: number; amount: number | null; paymentMode: { code: string; name: string } | null; paidBy: string | null }[];
  payables: { id: number; billedAmt: number; balanceAmt: number; status: string; remarks: string | null; doctor: { id: number; name: string } | null }[];
  incomeSource: { code: string; name: string } | null;
  incomeDtls?: IncomeDtl[];
}

interface IncomeDtl {
  id: number;
  incomeTxnId: number;
  uhid: string | null;
  description: string | null;
  amount: number | null;
  billDate: string | null;
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
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: fmt(first), to: fmt(last) };
};

function IncomeIPPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const [activeTab, setActiveTab] = useState<"dashboard" | "transactions">(() => {
    const tab = searchParams.get("tab");
    if (tab === "transactions" || tab === "importlog") return "transactions";
    return "dashboard";
  });
  const [tableView, setTableView] = useState<"transactions" | "logs">(() =>
    searchParams.get("tab") === "importlog" ? "logs" : "transactions"
  );
  const [dashboard, setDashboard] = useState<Dashboard>({ cash: 0, bank: 0, credit: 0, total: 0, doctorFeeLiability: 0 });
  const [dashYear, setDashYear] = useState(currentYear);
  const [dashMonth, setDashMonth] = useState(currentMonth);
  const [dashFromDate, setDashFromDate] = useState(() => getMonthRange(currentYear, currentMonth).from);
  const [dashToDate, setDashToDate] = useState(() => getMonthRange(currentYear, currentMonth).to);
  const [dashLoading, setDashLoading] = useState(false);

  const [txns, setTxns] = useState<IncomeTxn[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [txnYear, setTxnYear] = useState(() => {
    const fd = searchParams.get("fromDate");
    return fd ? parseInt(fd.substring(0, 4)) : currentYear;
  });
  const [txnMonth, setTxnMonth] = useState(() => {
    const fd = searchParams.get("fromDate");
    return fd ? parseInt(fd.substring(5, 7)) : currentMonth;
  });
  const [fromDate, setFromDate] = useState(() => searchParams.get("fromDate") || "");
  const [toDate, setToDate] = useState(() => searchParams.get("toDate") || "");
  const [txnStatusFilter, setTxnStatusFilter] = useState(() => searchParams.get("txnStatus") || "");
  const [txnPaymentFilter, setTxnPaymentFilter] = useState(() => searchParams.get("paymentMode") || "");
  const [pymtStatusFilter, setPymtStatusFilter] = useState(() => searchParams.get("pymtStatus") || "");
  const [page, setPage] = useState(() => parseInt(searchParams.get("page") || "1"));
  const [hasSearched, setHasSearched] = useState(() => searchParams.get("tab") === "transactions");

  const [importLogs, setImportLogs] = useState<ImportLogEntry[]>([]);
  const [logPagination, setLogPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [logPage, setLogPage] = useState(1);
  const [logLoading, setLogLoading] = useState(false);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importType, setImportType] = useState<"ip" | "ipd">("ip");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ inserted: number; updated: number; skipped: number; failed: number; total: number; errors?: { row: number; rowData: string; reason: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [selectedLogErrors, setSelectedLogErrors] = useState<ImportErrorEntry[]>([]);
  const [selectedLogInfo, setSelectedLogInfo] = useState<ImportLogEntry | null>(null);
  const [errorLoading, setErrorLoading] = useState(false);

  const [paymentModes, setPaymentModes] = useState<{ id: number; code: string; name: string }[]>([]);

  interface DoctorSummary {
    doctor: { id: number; name: string; descName: string };
    pendingCount: number;
    pendingAmount: number;
    patients: string[];
  }
  const [doctorSummary, setDoctorSummary] = useState<DoctorSummary[]>([]);
  const [doctorGrandTotal, setDoctorGrandTotal] = useState(0);
  const [doctorSummaryLoading, setDoctorSummaryLoading] = useState(false);

  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [settleDoctor, setSettleDoctor] = useState<{ id: number; name: string } | null>(null);
  const [settlePayables, setSettlePayables] = useState<{ id: number; billNo: string; billedAmt: number; balanceAmt: number; status: string; paidTotal: number; remarks: string | null; incomeTxn: { billNo: string; patient: { name: string } | null } | null; pymts: { id: number; amount: number | null; paymentMode: { code: string; name: string } | null; paymentDate: string | null; paidBy: string | null }[] }[]>([]);
  const [settleGrandTotal, setSettleGrandTotal] = useState(0);
  const [settleLoading, setSettleLoading] = useState(false);
  const [settleSelected, setSettleSelected] = useState<Set<number>>(new Set());
  const [settleAmounts, setSettleAmounts] = useState<Record<number, string>>({});
  const [settleMode, setSettleMode] = useState("");
  const [settleDate, setSettleDate] = useState(new Date().toISOString().split("T")[0]);
  const [settleTxnNo, setSettleTxnNo] = useState("");
  const [settleBank, setSettleBank] = useState("");
  const [settlePaidBy, setSettlePaidBy] = useState("");
  const [settleRemarks, setSettleRemarks] = useState("");
  const [settleSaving, setSettleSaving] = useState(false);

  useEffect(() => {
    const range = getMonthRange(dashYear, dashMonth);
    setDashFromDate(range.from);
    setDashToDate(range.to);
  }, [dashYear, dashMonth]);

  useEffect(() => {
    const range = getMonthRange(txnYear, txnMonth);
    setFromDate(range.from);
    setToDate(range.to);
  }, [txnYear, txnMonth]);

  const fetchDashboard = useCallback(async (fd = dashFromDate, td = dashToDate) => {
    setDashLoading(true);
    try {
      const params = new URLSearchParams();
      if (fd) params.set("fromDate", fd);
      if (td) params.set("toDate", td);
      const { data } = await api.get(`/income/ip/dashboard?${params.toString()}`);
      setDashboard(data);
    } catch {
      toast.error("Failed to load dashboard");
    } finally {
      setDashLoading(false);
    }
  }, [dashFromDate, dashToDate]);

  const fetchPaymentModes = async () => {
    try {
      const { data } = await api.get("/income/ip/payment-modes");
      setPaymentModes(data);
    } catch { /* ignore */ }
  };

  const fetchDoctorSummary = useCallback(async (fd = dashFromDate, td = dashToDate) => {
    setDoctorSummaryLoading(true);
    try {
      const params = new URLSearchParams();
      if (fd) params.set("fromDate", fd);
      if (td) params.set("toDate", td);
      const { data } = await api.get(`/income/ip/doctor-summary?${params.toString()}`);
      setDoctorSummary(data.summary);
      setDoctorGrandTotal(data.grandTotal);
    } catch {
      toast.error("Failed to load doctor summary");
    } finally {
      setDoctorSummaryLoading(false);
    }
  }, [dashFromDate, dashToDate]);


  useEffect(() => {
    if (searchParams.get("tab") === "transactions") {
      const p = parseInt(searchParams.get("page") || "1");
      const s = searchParams.get("search") || "";
      const fd = searchParams.get("fromDate") || "";
      const td = searchParams.get("toDate") || "";
      const ts = searchParams.get("txnStatus") || "";
      const ps = searchParams.get("pymtStatus") || "";
      const pm = searchParams.get("paymentMode") || "";
      setTxnPaymentFilter(pm);
      fetchTxns(p, s, fd, td, ts, ps, pm);
    }
  }, [searchParams]);

  async function fetchTxns(p = page, s = search, fd = fromDate, td = toDate, ts = txnStatusFilter, ps = pymtStatusFilter, pm = txnPaymentFilter) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "10" });
      if (s) params.set("search", s);
      if (fd) params.set("fromDate", fd);
      if (td) params.set("toDate", td);
      if (ts) params.set("txnStatus", ts);
      if (ps) params.set("pymtStatus", ps);
      if (pm) params.set("paymentMode", pm);
      const { data } = await api.get(`/income/ip/txns?${params.toString()}`);
      setTxns(data.txns);
      setPagination(data.pagination);
      setHasSearched(true);
    } catch {
      toast.error("Failed to load transactions");
    } finally {
      setLoading(false);
    }
  }

  const fetchImportLogs = async (p = logPage) => {
    setLogLoading(true);
    try {
      const { data } = await api.get(`/income/ip/import-logs?page=${p}&limit=10`);
      setImportLogs(data.logs);
      setLogPagination(data.pagination);
    } catch {
      toast.error("Failed to load import logs");
    } finally {
      setLogLoading(false);
    }
  };

  useEffect(() => {
    if (tableView === "logs") fetchImportLogs();
  }, [tableView, logPage]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    if (activeTab === "dashboard") next.delete("tab");
    else next.set("tab", activeTab === "transactions" && tableView === "logs" ? "importlog" : activeTab);
    const nextQs = next.toString();
    const currentQs = searchParams.toString();
    if (nextQs !== currentQs) {
      router.replace(nextQs ? `${pathname}?${nextQs}` : pathname);
    }
  }, [activeTab, tableView, pathname, router, searchParams]);

  const handleDashFilter = () => {
    fetchDashboard(dashFromDate, dashToDate);
    fetchDoctorSummary(dashFromDate, dashToDate);
  };

  const handleSearch = () => {
    setPage(1);
    fetchTxns(1, search, fromDate, toDate, txnStatusFilter, pymtStatusFilter, txnPaymentFilter);
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    fetchTxns(p, search, fromDate, toDate, txnStatusFilter, pymtStatusFilter, txnPaymentFilter);
  };

  const handleLogPageChange = (p: number) => {
    setLogPage(p);
    fetchImportLogs(p);
  };

  const handleTableViewChange = (v: "transactions" | "logs") => {
    setTableView(v);
    if (v === "logs") fetchImportLogs();
  };

  const handleCardClick = (pymtStatus?: string) => {
    setPymtStatusFilter(pymtStatus || "");
    setSearch("");
    setTxnYear(dashYear);
    setTxnMonth(dashMonth);
    setFromDate(dashFromDate);
    setToDate(dashToDate);
    setTxnPaymentFilter("");
    setActiveTab("transactions");
    setPage(1);
    fetchTxns(1, "", dashFromDate, dashToDate, txnStatusFilter, pymtStatus || "", "");
  };

  const openImportModal = (type: "ip" | "ipd") => {
    setImportType(type);
    setImportResult(null);
    setSelectedFile(null);
    setImportModalOpen(true);
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setImportResult(null);
  };

  const handleImport = async () => {
    if (!selectedFile) { toast.error("Please select a file"); return; }
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const endpoint = importType === "ipd" ? "/income/ip/import-detail" : "/income/ip/import";
      const { data } = await api.post(endpoint, formData, { headers: { "Content-Type": "multipart/form-data" } });
      setImportResult(data);
      fetchDashboard();
      if (hasSearched) fetchTxns();
      fetchImportLogs();
    } catch (err: unknown) {
      const response = (err as { response?: { data?: { message?: string } } })?.response?.data;
      toast.error(response?.message || "Import failed");
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
      const { data } = await api.get(`/income/ip/import-logs/${log.id}/errors`);
      setSelectedLogErrors(data.errors);
    } catch {
      toast.error("Failed to load error details");
    } finally {
      setErrorLoading(false);
    }
  };

  const openSettleModal = async (doctor: { id: number; name: string }) => {
    setSettleDoctor(doctor);
    setSettlePayables([]);
    setSettleGrandTotal(0);
    setSettleSelected(new Set());
    setSettleAmounts({});
    setSettleMode("");
    setSettleDate(new Date().toISOString().split("T")[0]);
    setSettleTxnNo("");
    setSettleBank("");
    setSettlePaidBy("");
    setSettleRemarks("");
    setSettleModalOpen(true);
    setSettleLoading(true);
    try {
      const [payablesRes, modesRes] = await Promise.all([
        api.get(`/income/ip/doctor-payables?doctorId=${doctor.id}`),
        api.get("/income/ip/payment-modes"),
      ]);
      setSettlePayables(payablesRes.data.payables);
      setSettleGrandTotal(payablesRes.data.grandTotal);
      setPaymentModes(modesRes.data);
      const amounts: Record<number, string> = {};
      payablesRes.data.payables.forEach((p: { id: number; balanceAmt: number }) => { amounts[p.id] = String(p.balanceAmt); });
      setSettleAmounts(amounts);
    } catch {
      toast.error("Failed to load payables");
    } finally {
      setSettleLoading(false);
    }
  };

  const toggleSettleSelect = (id: number) => {
    setSettleSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSettleAll = () => {
    if (settleSelected.size === settlePayables.length) {
      setSettleSelected(new Set());
    } else {
      setSettleSelected(new Set(settlePayables.map((p) => p.id)));
    }
  };

  const settleTotalSelected = settlePayables
    .filter((p) => settleSelected.has(p.id))
    .reduce((sum, p) => sum + (parseFloat(settleAmounts[p.id]) || 0), 0);

  const handleSettlePay = async () => {
    if (settleSelected.size === 0) return toast.error("Select at least one payable");
    if (!settleMode) return toast.error("Select a payment mode");

    const selected = settlePayables.filter((p) => settleSelected.has(p.id));
    for (const p of selected) {
      const amt = parseFloat(settleAmounts[p.id]);
      if (!amt || amt <= 0) return toast.error(`Enter a valid amount for bill ${p.incomeTxn?.billNo || p.id}`);
      if (amt > Number(p.balanceAmt)) return toast.error(`Amount for bill ${p.incomeTxn?.billNo || p.id} exceeds balance`);
    }

    setSettleSaving(true);
    let successCount = 0;
    try {
      for (const p of selected) {
        await api.post("/income/ip/payable-pymts", {
          payableId: p.id,
          amount: settleAmounts[p.id],
          paymentModeId: settleMode,
          paymentDate: settleDate,
          transactionNo: settleTxnNo || undefined,
          bankName: settleBank || undefined,
          paidBy: settlePaidBy || undefined,
          remarks: settleRemarks || undefined,
        });
        successCount++;
      }
      toast.success(`${successCount} payment(s) recorded`);
      setSettleModalOpen(false);
      fetchDoctorSummary(dashFromDate, dashToDate);
      fetchDashboard(dashFromDate, dashToDate);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to record payment";
      toast.error(msg);
    } finally {
      setSettleSaving(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(val);
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
    if (ft === "IP") return "IP Billing";
    if (ft === "IP_DETAIL") return "IPD Detail";
    return ft;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "VERIFIED": return "bg-emerald-50 text-emerald-600";
      case "UNVERIFIED": return "bg-orange-50 text-orange-600";
    case "REVIEW_REQ": return "bg-red-50 text-red-600";
      case "ERROR": return "bg-red-50 text-red-600";
      default: return "bg-slate-50 text-slate-500";
    }
  };

  const getPymtStatusColor = (status: string) => {
    switch (status) {
      case "FULLYPAID": return "bg-emerald-50 text-emerald-600";
      case "PARTIALPAID": return "bg-amber-50 text-amber-600";
      default: return "bg-red-50 text-red-600";
    }
  };

  return (
    <DashboardLayout>
      <>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">IP - In Patient Income</h1>
            <p className="text-slate-400 text-sm mt-1">Manage IP billing transactions</p>
          </div>
        </div>

        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6 max-w-lg">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === "dashboard" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            <LayoutDashboard size={16} /> Dashboard
          </button>
          <button
            onClick={() => setActiveTab("transactions")}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === "transactions" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            <List size={16} /> Transactions
          </button>
        </div>

        {activeTab === "dashboard" && (
          <>
            <div className="bg-white rounded-2xl border border-slate-200/60 p-4 mb-6">
              <div className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="w-full sm:w-auto">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Year</label>
                  <select
                    value={dashYear}
                    onChange={(e) => setDashYear(parseInt(e.target.value))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  >
                    {getYearOptions().map((y) => (
                      <option key={y.value} value={y.value}>{y.label}</option>
                    ))}
                  </select>
                </div>
                <div className="w-full sm:w-auto">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Month</label>
                  <select
                    value={dashMonth}
                    onChange={(e) => setDashMonth(parseInt(e.target.value))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  >
                    {MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <Button onClick={handleDashFilter} isLoading={dashLoading}>
                  <Search size={16} className="mr-1" /> Filter
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <button
                onClick={() => handleCardClick("FULLYPAID")}
                className="bg-white rounded-2xl border border-slate-200/60 p-5 hover:border-emerald-300 hover:shadow-md transition-all text-left cursor-pointer"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                    <Banknote size={20} className="text-emerald-500" />
                  </div>
                  <span className="text-sm font-medium text-slate-500">Cash</span>
                </div>
                <p className="text-xl font-bold text-slate-800">{formatCurrency(dashboard.cash)}</p>
                <p className="text-xs text-slate-400 mt-1">Click to view details</p>
              </button>
              <button
                onClick={() => handleCardClick("PARTIALPAID")}
                className="bg-white rounded-2xl border border-slate-200/60 p-5 hover:border-blue-300 hover:shadow-md transition-all text-left cursor-pointer"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                    <CreditCard size={20} className="text-blue-500" />
                  </div>
                  <span className="text-sm font-medium text-slate-500">Bank / Card / UPI</span>
                </div>
                <p className="text-xl font-bold text-slate-800">{formatCurrency(dashboard.bank)}</p>
                <p className="text-xs text-slate-400 mt-1">Click to view details</p>
              </button>
              <button
                onClick={() => handleCardClick("UNPAID")}
                className="bg-white rounded-2xl border border-slate-200/60 p-5 hover:border-amber-300 hover:shadow-md transition-all text-left cursor-pointer"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                    <Wallet size={20} className="text-amber-500" />
                  </div>
                  <span className="text-sm font-medium text-slate-500">Credit</span>
                </div>
                <p className="text-xl font-bold text-slate-800">{formatCurrency(dashboard.credit)}</p>
                <p className="text-xs text-slate-400 mt-1">Click to view details</p>
              </button>
              <button
                onClick={() => handleCardClick("")}
                className="bg-white rounded-2xl border border-slate-200/60 p-5 hover:border-indigo-300 hover:shadow-md transition-all text-left cursor-pointer"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                    <TrendingUp size={20} className="text-indigo-500" />
                  </div>
                  <span className="text-sm font-medium text-slate-500">Total</span>
                </div>
                <p className="text-xl font-bold text-slate-800">{formatCurrency(dashboard.total)}</p>
                <p className="text-xs text-slate-400 mt-1">Click to view details</p>
              </button>
              <button
                onClick={() => handleCardClick("")}
                className="bg-white rounded-2xl border border-slate-200/60 p-5 hover:border-red-300 hover:shadow-md transition-all text-left cursor-pointer"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
                    <Stethoscope size={20} className="text-red-500" />
                  </div>
                  <span className="text-sm font-medium text-slate-500">Doctor Fee Liability</span>
                </div>
                <p className="text-xl font-bold text-red-600">{formatCurrency(dashboard.doctorFeeLiability)}</p>
                <p className="text-xs text-slate-400 mt-1">Click to view details</p>
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden mt-6">
              <div className="px-5 py-4 border-b border-slate-200/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Stethoscope size={18} className="text-slate-500" />
                  <h2 className="font-semibold text-slate-700">Doctor Fee Summary</h2>
                </div>
                <span className="text-sm font-medium text-slate-500">Grand Total: <span className="text-red-600">{formatCurrency(doctorGrandTotal)}</span></span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200/60">
                      <th className="text-left px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">#</th>
                      <th className="text-left px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Doctor Name</th>
                      <th className="text-left px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden sm:table-cell">Patients</th>
                      <th className="text-center px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Pending Bills</th>
                      <th className="text-right px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Pending Amount</th>
                      <th className="text-right px-5 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {doctorSummaryLoading ? (
                      <tr><td colSpan={6} className="text-center py-8 text-slate-400">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                          Loading...
                        </div>
                      </td></tr>
                    ) : doctorSummary.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-8 text-slate-400">No pending payables</td></tr>
                    ) : (
                      doctorSummary.map((s, idx) => (
                        <tr key={s.doctor.id} className="hover:bg-slate-50/80">
                          <td className="px-5 py-3 text-slate-400">{idx + 1}</td>
                          <td className="px-5 py-3 font-medium text-slate-700">{s.doctor.name}</td>
                          <td className="px-5 py-3 text-slate-500 hidden sm:table-cell text-xs">
                            {s.patients.length <= 3
                              ? s.patients.join(", ")
                              : `${s.patients.slice(0, 3).join(", ")} ...`
                            }
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className="inline-block px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-600">{s.pendingCount}</span>
                          </td>
                          <td className="px-5 py-3 text-right font-medium text-red-600">{formatCurrency(s.pendingAmount)}</td>
                          <td className="px-5 py-3 text-right">
                            <button
                              onClick={() => openSettleModal(s.doctor)}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
                            >
                              Settle
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {activeTab === "transactions" && (
          <>
            <div className="flex flex-col lg:flex-row gap-4 mb-6">
              <div className="bg-white rounded-2xl border border-slate-200/60 p-4 flex-1">
                <div className="flex flex-col sm:flex-row gap-3 items-end">
                  <div className="w-full sm:w-auto">
                    <select
                      value={txnYear}
                      onChange={(e) => setTxnYear(parseInt(e.target.value))}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    >
                      {getYearOptions().map((y) => (
                        <option key={y.value} value={y.value}>{y.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-full sm:w-auto">
                    <select
                      value={txnMonth}
                      onChange={(e) => setTxnMonth(parseInt(e.target.value))}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    >
                      {MONTHS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 w-full sm:max-w-xs">
                    <div className="relative">
                      <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Bill No, Patient, UHID..."
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
                      value={txnStatusFilter}
                      onChange={(e) => setTxnStatusFilter(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    >
                      <option value="">All Txn Status</option>
                      <option value="VERIFIED">Verified</option>
                      <option value="UNVERIFIED">Unverified</option>
                      <option value="REVIEW_REQ">Review Required</option>
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
              <div className="bg-white rounded-2xl border border-slate-200/60 p-4 flex flex-wrap gap-2 items-center content-center">
                <button
                  onClick={() => openImportModal("ip")}
                  className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100"
                >
                  <Download size={16} className="mr-1" /> Import IP Bills
                </button>
                <button
                  onClick={() => openImportModal("ipd")}
                  className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100"
                >
                  <Download size={16} className="mr-1" /> Import IP Dtl. Bills
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200/60">
                      <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Bill No</th>
                      <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden sm:table-cell">Date</th>
                      <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Patient</th>
                      <th className="text-right px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Total Amt</th>
                      <th className="text-right px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Discount</th>
                      <th className="text-right px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Adv Adj</th>
                      <th className="text-right px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Final Amt</th>
                      <th className="text-right px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Balance</th>
                      <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Payment</th>
                      <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Pymt Status</th>
                      <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Txn Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {!hasSearched ? (
                        <tr><td colSpan={11} className="text-center py-12 text-slate-400">
                          Use the search or date filter to view transactions
                        </td></tr>
                      ) : loading ? (
                        <tr><td colSpan={11} className="text-center py-12 text-slate-400">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                            Loading...
                          </div>
                        </td></tr>
                      ) : txns.length === 0 ? (
                        <tr><td colSpan={11} className="text-center py-12 text-slate-400">No transactions found</td></tr>
                    ) : (
                        txns.map((txn) => {
                          const isReviewReq = txn.txn_status === "REVIEW_REQ";
                          return (
                          <tr
                            key={txn.id}
                            onClick={() => {
                              const params = new URLSearchParams();
                              params.set("search", search);
                              params.set("fromDate", fromDate);
                              params.set("toDate", toDate);
                              params.set("txnStatus", txnStatusFilter);
                              params.set("pymtStatus", pymtStatusFilter);
                              params.set("paymentMode", txnPaymentFilter);
                              params.set("page", String(page));
                              router.push(`/income/ip/review/${txn.id}?${params.toString()}`);
                            }}
                            className={`cursor-pointer group hover:bg-slate-50/80 ${txn.txn_status === "ERROR" ? "bg-red-50/50" : txn.txn_status === "UNVERIFIED" ? "bg-orange-50/30" : ""}`}
                          >
                            <td className={`px-5 py-3.5 font-medium group-hover:text-purple-700 ${isReviewReq ? "text-red-600" : "text-slate-700"}`}>{txn.billNo}</td>
                            <td className={`px-5 py-3.5 hidden sm:table-cell group-hover:text-purple-700 ${isReviewReq ? "text-red-600" : "text-slate-500"}`}>{formatDate(txn.billDate)}</td>
                            <td className={`px-5 py-3.5 group-hover:text-purple-700 ${isReviewReq ? "text-red-600" : "text-slate-700"}`}>{txn.patient?.name || "-"}</td>
                            <td className="px-5 py-3.5 text-right font-medium group-hover:text-purple-700 text-slate-700">{txn.grossAmount ? formatCurrency(Number(txn.grossAmount)) : "-"}</td>
                            <td className="px-5 py-3.5 text-right font-medium group-hover:text-purple-700 text-slate-700">{txn.discountAmount ? formatCurrency(Number(txn.discountAmount)) : "-"}</td>
                            <td className="px-5 py-3.5 text-right font-medium group-hover:text-purple-700 text-slate-700">{txn.advAdjt ? formatCurrency(Number(txn.advAdjt)) : "-"}</td>
                            <td className={`px-5 py-3.5 text-right font-medium group-hover:text-purple-700 ${isReviewReq ? "text-red-600" : "text-slate-700"}`}>{txn.billAmt ? formatCurrency(Number(txn.billAmt)) : "-"}</td>
                            <td className="px-5 py-3.5 text-right font-semibold group-hover:text-purple-700 text-slate-700">{formatCurrency((Number(txn.billAmt) || 0) - (txn.rcvdPymts || []).reduce((s, p) => s + (Number(p.amount) || 0), 0))}</td>
                            <td className="px-5 py-3.5">
                              <div className="flex flex-wrap gap-1">
                                {txn.rcvdPymts.map((p, i) => (
                                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded text-xs">
                                    <span className="font-medium">{p.paymentMode?.code || "-"}</span>
                                    {p.amount ? <span className="text-slate-500">{formatCurrency(Number(p.amount))}</span> : null}
                                  </span>
                                ))}
                                {txn.rcvdPymts.length === 0 && <span className="text-xs text-slate-400">-</span>}
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${getPymtStatusColor(txn.pymt_status)}`}>
                                {txn.pymt_status}
                              </span>
                            </td>
                            <td className={`px-5 py-3.5 ${isReviewReq ? "text-red-600" : ""}`}>
                              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(txn.txn_status)}`}>
                                {txn.txn_status === "REVIEW_REQ" ? "REVIEW REQ" : txn.txn_status}
                              </span>
                              {txn.txn_status === "ERROR" && txn.errorReason && (
                                <span className="block text-[10px] text-red-500 max-w-[180px] truncate mt-1" title={txn.errorReason}>{txn.errorReason}</span>
                              )}
                            </td>
                          </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>

              {hasSearched && (
                <Pagination page={page} totalPages={pagination.pages} total={pagination.total} limit={10} onPageChange={handlePageChange} />
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
                          <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">File Name</th>
                          <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden sm:table-cell">Type</th>
                          <th className="text-center px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Total</th>
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
                          <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider hidden md:table-cell">Imported At</th>
                          <th className="text-center px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {logLoading ? (
                          <tr><td colSpan={8} className="text-center py-12 text-slate-400">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                              Loading...
                            </div>
                          </td></tr>
                        ) : importLogs.length === 0 ? (
                          <tr><td colSpan={8} className="text-center py-12 text-slate-400">No import logs found</td></tr>
                        ) : (
                          importLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-slate-50/80">
                              <td className="px-5 py-3.5 font-medium text-slate-700 max-w-[200px] truncate">{log.fileName}</td>
                              <td className="px-5 py-3.5 hidden sm:table-cell">
                                <span className="inline-block px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-medium">{getFileTypeLabel(log.fileType)}</span>
                              </td>
                              <td className="px-5 py-3.5 text-center text-slate-700">{log.totalRecords}</td>
                              <td className="px-5 py-3.5 text-center">
                                <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                                  <CheckCircle2 size={14} /> {log.inserted}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-center hidden sm:table-cell">
                                <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                                  <Clock size={14} /> {log.updated}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-center">
                                <span className={`inline-flex items-center gap-1 font-medium ${log.skipped > 0 ? "text-slate-500" : "text-slate-300"}`}>
                                  {log.skipped}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-center">
                                <span className={`inline-flex items-center gap-1 font-medium ${log.failed > 0 ? "text-red-600" : "text-slate-400"}`}>
                                  <XCircle size={14} /> {log.failed}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 text-slate-500 hidden md:table-cell">{formatDateTime(log.importStarted)}</td>
                              <td className="px-5 py-3.5 text-center">
                                {log.failed > 0 || log.skipped > 0 ? (
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
                    <Pagination page={logPage} totalPages={logPagination.pages} total={logPagination.total} limit={10} onPageChange={handleLogPageChange} />
                  )}
                </div>
              </>
            )}
          </>
        )}

        <Modal isOpen={importModalOpen} onClose={() => { if (!importing) setImportModalOpen(false); }} title={importType === "ipd" ? "Import IPD Detail Report" : "Import IP Billing Report"}>
          <div className="space-y-4">
            {importType === "ip" ? (
              <>
                <p className="text-sm text-slate-500">
                  Upload an IP Billing Excel file with columns: <strong>S.No, Date, Bill No, IP No, Patient Name, Terms, Total Amount, Discount, Bill Amount, Less Advance, Net Amount, cash_amount, bank_amount, credit_amount, company_amount, insurance_amount</strong>
                </p>
                <p className="text-xs text-slate-400">Header rows, empty rows, and summary/total rows are auto-skipped. Duplicate Bill No entries will be updated. All records will be marked as UNVERIFIED.</p>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-500">
                  Upload an IPD Detail Report Excel file with columns: <strong>S.No, Bill Date, Bill No, UHID, Patient Name, Description, Amount, age, Sex, Consult Dr</strong>
                </p>
                <p className="text-xs text-slate-400">Patient will be linked by UHID. Records with bill numbers not found in IP billing will be skipped with grouped errors.</p>
              </>
            )}

            <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-indigo-400 transition-colors">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
              {selectedFile ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-sm text-slate-700 font-medium">{selectedFile.name}</span>
                  <button onClick={() => { setSelectedFile(null); setImportResult(null); }} className="p-1 hover:bg-slate-100 rounded-lg">
                    <X size={14} className="text-slate-400" />
                  </button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()} className="text-sm text-indigo-500 hover:text-indigo-600 font-medium">
                  Click to select file
                </button>
              )}
            </div>

            {importResult && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                <p className="font-semibold text-slate-700">Import Complete</p>
                <p className="text-slate-600 mt-1">Total rows: {importResult.total} | Inserted: {importResult.inserted} | Updated: {importResult.updated} | Skipped: {importResult.skipped} | Failed: {importResult.failed}</p>
                {importResult.errors && importResult.errors.length > 0 && (
                  <div className="mt-2 max-h-32 overflow-y-auto">
                    {importResult.errors.slice(0, 10).map((e, i) => (
                      <p key={i} className="text-xs text-amber-700">Row {e.row}: {e.reason}</p>
                    ))}
                    {importResult.errors.length > 10 && <p className="text-xs text-amber-600">...and {importResult.errors.length - 10} more</p>}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={() => { if (!importing) setImportModalOpen(false); }}>
                {importResult ? "Close" : "Cancel"}
              </Button>
              {!importResult && (
                <Button onClick={handleImport} isLoading={importing} disabled={!selectedFile}>
                  Import
                </Button>
              )}
            </div>
          </div>
        </Modal>

        <Modal isOpen={errorModalOpen} onClose={() => setErrorModalOpen(false)} title={`Error Details - ${selectedLogInfo?.fileName || ""}`}>
          <div className="space-y-4">
            {selectedLogInfo && (
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl text-sm">
                <div><span className="text-slate-500">File:</span> <span className="font-medium text-slate-700">{selectedLogInfo.fileName}</span></div>
                <div><span className="text-slate-500">Type:</span> <span className="font-medium text-slate-700">{getFileTypeLabel(selectedLogInfo.fileType)}</span></div>
                <div><span className="text-slate-500">Total:</span> <span className="font-medium text-slate-700">{selectedLogInfo.totalRecords}</span></div>
                <div><span className="text-slate-500">Inserted:</span> <span className="font-medium text-emerald-600">{selectedLogInfo.inserted}</span></div>
                <div><span className="text-slate-500">Skipped:</span> <span className="font-medium text-slate-600">{selectedLogInfo.skipped}</span></div>
                <div><span className="text-slate-500">Failed:</span> <span className="font-medium text-red-600">{selectedLogInfo.failed}</span></div>
                <div><span className="text-slate-500">Imported:</span> <span className="font-medium text-slate-700">{formatDateTime(selectedLogInfo.importStarted)}</span></div>
              </div>
            )}

            {errorLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
              </div>
            ) : selectedLogErrors.length === 0 ? (
              <p className="text-center text-slate-400 py-8">No errors recorded</p>
            ) : (
              <div className="max-h-96 overflow-y-auto space-y-2">
                {selectedLogErrors.map((err) => (
                  <div key={err.id} className="p-3 bg-red-50 border border-red-100 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded">Row {err.rowNumber}</span>
                    </div>
                    <p className="text-xs text-red-700 font-medium mb-1">{err.reason}</p>
                    <p className="text-xs text-slate-500 truncate" title={err.rowData}>Data: {err.rowData}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setErrorModalOpen(false)}>Close</Button>
            </div>
          </div>
        </Modal>

        <Modal isOpen={settleModalOpen} onClose={() => setSettleModalOpen(false)} title={`Settle - ${settleDoctor?.name || ""}`} maxWidth="max-w-4xl">
          {settleLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl text-sm">
                <span className="text-slate-500">Total Pending: <span className="font-bold text-red-600">{formatCurrency(settleGrandTotal)}</span></span>
                <span className="text-slate-500">Selected: <span className="font-bold text-indigo-600">{formatCurrency(settleTotalSelected)}</span></span>
              </div>

              {settlePayables.length === 0 ? (
                <p className="text-center text-slate-400 py-4">No pending payables for this doctor</p>
              ) : (
                <>
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 sticky top-0">
                          <th className="px-3 py-2 w-8">
                            <input
                              type="checkbox"
                              checked={settleSelected.size === settlePayables.length && settlePayables.length > 0}
                              onChange={toggleSettleAll}
                              className="accent-indigo-500"
                            />
                          </th>
                          <th className="text-left px-3 py-2 font-medium text-slate-500">Bill No</th>
                          <th className="text-left px-3 py-2 font-medium text-slate-500">Patient</th>
                          <th className="text-right px-3 py-2 font-medium text-slate-500">Billed</th>
                          <th className="text-right px-3 py-2 font-medium text-slate-500">Balance</th>
                          <th className="text-right px-3 py-2 font-medium text-slate-500">Pay Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {settlePayables.map((p) => {
                          const checked = settleSelected.has(p.id);
                          const maxBal = Number(p.balanceAmt);
                          const payVal = parseFloat(settleAmounts[p.id]) || 0;
                          const overLimit = payVal > maxBal;
                          return (
                            <tr key={p.id} className={`transition-colors ${checked ? "bg-indigo-50/60" : "hover:bg-slate-50"}`}>
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleSettleSelect(p.id)}
                                  className="accent-indigo-500"
                                />
                              </td>
                              <td className="px-3 py-2 font-medium text-slate-700">{p.incomeTxn?.billNo || "-"}</td>
                              <td className="px-3 py-2 text-slate-500">{p.incomeTxn?.patient?.name || "-"}</td>
                              <td className="px-3 py-2 text-right font-medium text-slate-700">{formatCurrency(Number(p.billedAmt))}</td>
                              <td className="px-3 py-2 text-right font-medium text-red-600">{formatCurrency(maxBal)}</td>
                              <td className="px-3 py-2 text-right">
                                <input
                                  type="number"
                                  min={0}
                                  max={maxBal}
                                  step="0.01"
                                  value={settleAmounts[p.id] || ""}
                                  disabled={!checked}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setSettleAmounts((prev) => ({ ...prev, [p.id]: val }));
                                  }}
                                  className={`w-28 px-2 py-1 text-right text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-400 ${overLimit ? "border-red-400" : "border-slate-200"}`}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="border-t border-slate-200 pt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Payment Mode <span className="text-red-500">*</span></label>
                        <select
                          value={settleMode}
                          onChange={(e) => setSettleMode(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        >
                          <option value="">Select mode</option>
                          {paymentModes.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Payment Date</label>
                        <input
                          type="date"
                          value={settleDate}
                          onChange={(e) => setSettleDate(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Transaction No</label>
                        <input
                          type="text"
                          value={settleTxnNo}
                          onChange={(e) => setSettleTxnNo(e.target.value)}
                          placeholder="Ref/UPI/Chq No"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Bank Name</label>
                        <input
                          type="text"
                          value={settleBank}
                          onChange={(e) => setSettleBank(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Paid By</label>
                        <input
                          type="text"
                          value={settlePaidBy}
                          onChange={(e) => setSettlePaidBy(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Remarks</label>
                      <input
                        type="text"
                        value={settleRemarks}
                        onChange={(e) => setSettleRemarks(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setSettleModalOpen(false)}>Cancel</Button>
                    <Button onClick={handleSettlePay} isLoading={settleSaving} disabled={settleSelected.size === 0 || !settleMode}>
                      <CheckCircle2 size={16} className="mr-1" /> Record {settleSelected.size > 0 ? `${settleSelected.size} ` : ""}Payment(s)
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </Modal>
      </>
    </DashboardLayout>
  );
}

export default function IncomeIPPage() {
  return (
    <Suspense fallback={<DashboardLayout><div className="py-20 text-center text-slate-400">Loading...</div></DashboardLayout>}>
      <IncomeIPPageContent />
    </Suspense>
  );
}

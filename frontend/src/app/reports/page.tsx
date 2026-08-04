"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Pagination from "@/components/ui/Pagination";
import { Search } from "lucide-react";
import toast from "react-hot-toast";

interface PayableReportItem {
  id: number;
  partyType: string;
  drId: number | null;
  bpId: number | null;
  billDate: string;
  dueDate: string | null;
  billedAmt: string;
  payableAmt: string;
  balanceAmt: string;
  status: string;
  remarks: string | null;
  doctor: { id: number; name: string } | null;
  bizPartner: { id: number; bpName: string } | null;
  incomeTxn: {
    id: number;
    billNo: string;
    billDate: string;
    billAmt: string;
    incomeSource: { code: string; name: string };
    patient: { id: number; name: string; uhid: string };
  };
}

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

interface IPAdmReportRow {
  id: number;
  ipNo: string;
  status: string;
  admittedDate: string;
  dischargeDate: string | null;
  patient: { id: number; name: string; uhid: string } | null;
  ipBillAmt: number;
  pharmaBillAmt: number;
  labBillAmt: number;
  totalAmt: number;
  totalPayable: number;
  totalReceivables: number;
}

type Tab = "payables" | "receivables" | "ip-admissions";

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("payables");

  const [payables, setPayables] = useState<PayableReportItem[]>([]);
  const [receivables, setReceivables] = useState<ReceivableReportItem[]>([]);
  const [ipAdmRows, setIpAdmRows] = useState<IPAdmReportRow[]>([]);
  const [payableSummary, setPayableSummary] = useState({ totalPayableAmt: 0, totalBalanceAmt: 0, count: 0 });
  const [receivableSummary, setReceivableSummary] = useState({ totalDueAmt: 0, totalBalanceAmt: 0, count: 0 });
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1, limit: 20 });
  const [loading, setLoading] = useState(false);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [partyTypeFilter, setPartyTypeFilter] = useState("");
  const [arTypeFilter, setArTypeFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [sources, setSources] = useState<{ id: number; code: string; name: string }[]>([]);

  const fetchPayables = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      if (search) params.set("search", search);
      if (partyTypeFilter) params.set("partyType", partyTypeFilter);

      const { data } = await api.get(`/reports/payables?${params.toString()}`);
      setPayables(data.payables || []);
      setPayableSummary(data.summary || { totalPayableAmt: 0, totalBalanceAmt: 0, count: 0 });
      setPagination(data.pagination || { total: 0, page: 1, pages: 1, limit: 20 });
    } catch {
      toast.error("Failed to load payable report");
    } finally {
      setLoading(false);
    }
  }, [page, fromDate, toDate, search, partyTypeFilter]);

  const fetchReceivables = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      if (search) params.set("search", search);
      if (arTypeFilter) params.set("arType", arTypeFilter);
      if (sourceFilter) params.set("source", sourceFilter);

      const { data } = await api.get(`/reports/receivables?${params.toString()}`);
      setReceivables(data.receivables || []);
      setReceivableSummary(data.summary || { totalDueAmt: 0, totalBalanceAmt: 0, count: 0 });
      setPagination(data.pagination || { total: 0, page: 1, pages: 1, limit: 20 });
    } catch {
      toast.error("Failed to load receivable report");
    } finally {
      setLoading(false);
    }
  }, [page, fromDate, toDate, search, arTypeFilter, sourceFilter]);

  const fetchIPAdmissions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      if (search) params.set("search", search);

      const { data } = await api.get(`/reports/ip-admissions?${params.toString()}`);
      setIpAdmRows(data.rows || []);
      setPagination(data.pagination || { total: 0, page: 1, pages: 1, limit: 20 });
    } catch {
      toast.error("Failed to load IP admission report");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    api
      .get("/reports/income-sources")
      .then(({ data }) => setSources(data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
  }, [tab, fromDate, toDate, search, partyTypeFilter, arTypeFilter, sourceFilter]);

  useEffect(() => {
    if (tab === "payables") fetchPayables();
    else if (tab === "receivables") fetchReceivables();
    else fetchIPAdmissions();
  }, [tab, page, fromDate, toDate, search, partyTypeFilter, arTypeFilter, sourceFilter, fetchPayables, fetchReceivables, fetchIPAdmissions]);

  const formatCurrency = (val: number | string) => {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(val));
  };

  const formatDate = (d: string | null) => {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("en-GB");
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

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
        <p className="text-slate-400 text-sm mt-1">Consolidated payables and receivables across all income sources</p>
      </div>

      <div className="flex items-center gap-1 mb-6 border-b border-slate-200">
        <button
          onClick={() => setTab("payables")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${tab === "payables" ? "text-indigo-600 border-indigo-600" : "text-slate-500 border-transparent hover:text-slate-700"}`}
        >
          Payables
        </button>
        <button
          onClick={() => setTab("receivables")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${tab === "receivables" ? "text-indigo-600 border-indigo-600" : "text-slate-500 border-transparent hover:text-slate-700"}`}
        >
          Receivables
        </button>
        <button
          onClick={() => setTab("ip-admissions")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${tab === "ip-admissions" ? "text-indigo-600 border-indigo-600" : "text-slate-500 border-transparent hover:text-slate-700"}`}
        >
          IP Admissions
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${tab === "payables" ? "bill no" : tab === "ip-admissions" ? "IP no / patient / IP bill no" : "patient / bill no"}...`}
            className="w-56 pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
        {tab !== "ip-admissions" && (
          <>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
          </>
        )}
        {tab === "payables" && (
          <select value={partyTypeFilter} onChange={(e) => setPartyTypeFilter(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
            <option value="">All Types</option>
            <option value="DOCTOR">Doctor</option>
            <option value="VENDOR">Vendor</option>
          </select>
        )}
        {tab === "receivables" && (
          <>
            <select value={arTypeFilter} onChange={(e) => setArTypeFilter(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
              <option value="">All Types</option>
              <option value="PATIENT">Patient Credit</option>
              <option value="INSURANCE">Insurance</option>
              <option value="CORPORATE">Company</option>
            </select>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
              <option value="">All Sources</option>
              {sources.map((s) => (
                <option key={s.id} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </>
        )}
        <Button variant="secondary" onClick={() => setPage(1)}>Filter</Button>
      </div>

      {tab === "payables" && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-slate-200/60 p-4">
              <label className="block text-xs font-medium text-slate-500 mb-1">Total Payable</label>
              <p className="text-xl font-bold text-slate-800">{formatCurrency(payableSummary.totalPayableAmt)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/60 p-4">
              <label className="block text-xs font-medium text-slate-500 mb-1">Total Balance</label>
              <p className="text-xl font-bold text-amber-600">{formatCurrency(payableSummary.totalBalanceAmt)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/60 p-4">
              <label className="block text-xs font-medium text-slate-500 mb-1">Pending Count</label>
              <p className="text-xl font-bold text-slate-800">{payableSummary.count}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
              </div>
            ) : payables.length === 0 ? (
              <div className="text-center py-20 text-slate-400">No payables found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/50">
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Bill No</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Party</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Source</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Patient</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Description</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Payable</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Balance</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payables.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-700">{p.incomeTxn?.billNo || "-"}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded mr-1">{p.partyType}</span>
                          <span className="text-slate-700">{p.doctor?.name || p.bizPartner?.bpName || "-"}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{p.incomeTxn?.incomeSource?.code || "-"}</td>
                        <td className="px-4 py-3 text-slate-600">{p.incomeTxn?.patient?.name || "-"}</td>
                        <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">{p.remarks || "-"}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-700">{formatCurrency(p.payableAmt)}</td>
                        <td className="px-4 py-3 text-right font-medium text-amber-600">{formatCurrency(p.balanceAmt)}</td>
                        <td className="px-4 py-3">{getStatusBadge(p.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-4 py-3 border-t border-slate-200">
              <Pagination page={pagination.page} totalPages={pagination.pages} total={pagination.total} limit={pagination.limit} onPageChange={setPage} />
            </div>
          </div>
        </>
      )}

      {tab === "receivables" && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-2xl border border-slate-200/60 p-4">
              <label className="block text-xs font-medium text-slate-500 mb-1">Total Due</label>
              <p className="text-xl font-bold text-slate-800">{formatCurrency(receivableSummary.totalDueAmt)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/60 p-4">
              <label className="block text-xs font-medium text-slate-500 mb-1">Total Balance</label>
              <p className="text-xl font-bold text-amber-600">{formatCurrency(receivableSummary.totalBalanceAmt)}</p>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200/60 p-4">
              <label className="block text-xs font-medium text-slate-500 mb-1">Pending Count</label>
              <p className="text-xl font-bold text-slate-800">{receivableSummary.count}</p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
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
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Bill No</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Type</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Patient</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Source</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Due</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Balance</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Due Date</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {receivables.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-700">{r.incomeTxn?.billNo || "-"}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{r.arType}</span>
                          {r.bizPartner && <span className="ml-1 text-xs text-slate-500">({r.bizPartner.bpName})</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-slate-700">{r.patient.name}</span>
                          <span className="text-xs text-slate-400 ml-1">({r.patient.uhid})</span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{r.incomeTxn?.incomeSource?.code || "-"}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-700">{formatCurrency(r.dueAmt)}</td>
                        <td className="px-4 py-3 text-right font-medium text-amber-600">{formatCurrency(r.balanceAmt)}</td>
                        <td className="px-4 py-3 text-slate-600">{formatDate(r.dueDate)}</td>
                        <td className="px-4 py-3">{getStatusBadge(r.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-4 py-3 border-t border-slate-200">
              <Pagination page={pagination.page} totalPages={pagination.pages} total={pagination.total} limit={pagination.limit} onPageChange={setPage} />
            </div>
          </div>
        </>
      )}

      {tab === "ip-admissions" && (
        <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
            </div>
          ) : ipAdmRows.length === 0 ? (
            <div className="text-center py-20 text-slate-400">No IP admissions found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50">
                    <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">IP No</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Patient Name</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Admitted</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Discharge</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">IP Billing Amt</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Pharma Bill Amt</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Lab Bill Amt</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Total Amt</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Total Payable</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Total Receivables</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ipAdmRows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-700">{r.ipNo}</td>
                      <td className="px-4 py-3">
                        <span className="text-slate-700">{r.patient?.name || "-"}</span>
                        {r.patient?.uhid && <span className="text-xs text-slate-400 ml-1">({r.patient.uhid})</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(r.admittedDate)}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(r.dischargeDate)}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-700">{formatCurrency(r.ipBillAmt)}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-700">{formatCurrency(r.pharmaBillAmt)}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-700">{formatCurrency(r.labBillAmt)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatCurrency(r.totalAmt)}</td>
                      <td className="px-4 py-3 text-right font-medium text-amber-600">{formatCurrency(r.totalPayable)}</td>
                      <td className="px-4 py-3 text-right font-medium text-amber-600">{formatCurrency(r.totalReceivables)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-4 py-3 border-t border-slate-200">
            <Pagination page={pagination.page} totalPages={pagination.pages} total={pagination.total} limit={pagination.limit} onPageChange={setPage} />
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

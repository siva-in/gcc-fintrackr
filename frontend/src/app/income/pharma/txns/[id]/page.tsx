"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import api from "@/lib/api";
import Button from "@/components/ui/Button";
import toast from "react-hot-toast";
import { ArrowLeft, CheckCircle, Plus, Trash2 } from "lucide-react";

interface PaymentMode {
  id: number;
  code: string;
  name: string;
}

interface PaymentEntry {
  id: number | null;
  paymentModeId: number;
  amount: string;
  paymentDate: string;
  insurancePartnerId: string;
  insurancePartnerName: string;
  remarks: string;
}

const toDateInputValue = (d: string | null | undefined) => {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
};

export default function EditPharmaTransactionPage() {
  return (
    <Suspense fallback={null}>
      <EditPharmaTransactionPageContent />
    </Suspense>
  );
}

function EditPharmaTransactionPageContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const buildBackUrl = () => {
    const params = new URLSearchParams();
    const search = searchParams.get("search") || "";
    const fromDate = searchParams.get("fromDate") || "";
    const toDate = searchParams.get("toDate") || "";
    const pm = searchParams.get("pm") || "";
    const ps = searchParams.get("ps") || "";
    const ts = searchParams.get("ts") || "";
    const page = searchParams.get("page") || "1";
    const tab = searchParams.get("tab") || "transactions";
    if (search) params.set("search", search);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    if (pm) params.set("pm", pm);
    if (ps) params.set("ps", ps);
    if (ts) params.set("ts", ts);
    params.set("page", page);
    params.set("tab", tab);
    const qs = params.toString();
    return `/income/pharma${qs ? `?${qs}` : ""}`;
  };

  const goBack = () => {
    sessionStorage.setItem("pharmaFilterState", JSON.stringify({
      activeTab: searchParams.get("tab") || "transactions",
      page: searchParams.get("page") || "1",
      search: searchParams.get("search") || "",
      fromDate: searchParams.get("fromDate") || "",
      toDate: searchParams.get("toDate") || "",
      txnPaymentFilter: searchParams.get("pm") || "",
      txnPymtStatusFilter: searchParams.get("ps") || "",
      txnStatusFilter: searchParams.get("ts") || "",
    }));
    router.push(buildBackUrl());
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type ApiData = any;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [txn, setTxn] = useState<ApiData>(null);
  const [paymentModes, setPaymentModes] = useState<PaymentMode[]>([]);
  const [insurancePartners, setInsurancePartners] = useState<{ id: number; bpName: string }[]>([]);
  const insuranceSuggestionsId = "pharma-edit-insurance-suggestions";

  const [payments, setPayments] = useState<PaymentEntry[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [txnRes, modesRes, insuranceRes] = await Promise.all([
          api.get(`/income/pharma/txns/${id}`),
          api.get("/income/pharma/payment-modes"),
          api.get("/income/ip/insurance-partners"),
        ]);
        const data: ApiData = txnRes.data;
        setTxn(data);

        const modes: PaymentMode[] = modesRes.data || [];
        setPaymentModes(modes);
        setInsurancePartners(insuranceRes.data || []);

        const creditMode = modes.find((m) => m.code === "CREDIT");
        const insuranceMode = modes.find((m) => m.code === "INSURANCE");
        const companyMode = modes.find((m) => m.code === "COMPANY");

        const rcvdPymtEntries: PaymentEntry[] = (data.rcvdPymts || []).map((p: ApiData) => ({
          id: p.id,
          paymentModeId: p.paymentModeId || 0,
          amount: p.amount != null ? String(p.amount) : "",
          paymentDate: toDateInputValue(p.paymentDate),
          insurancePartnerId: "",
          insurancePartnerName: "",
          remarks: p.remarks || "",
        }));

        const receivableEntries: PaymentEntry[] = (data.receivables || []).map((r: ApiData) => ({
          id: r.id,
          paymentModeId: r.arType === "INSURANCE" ? (insuranceMode?.id || 0) : r.arType === "CORPORATE" ? (companyMode?.id || 0) : (creditMode?.id || 0),
          amount: r.dueAmt != null ? String(r.dueAmt) : "",
          paymentDate: toDateInputValue(r.dueDate),
          insurancePartnerId: r.arType === "INSURANCE" ? (r.bizPartner?.id ? String(r.bizPartner.id) : "") : "",
          insurancePartnerName: r.arType === "INSURANCE" ? (r.bizPartner?.bpName || "") : "",
          remarks: r.arType === "INSURANCE" ? "Insurance receivable" : r.arType === "CORPORATE" ? "Company receivable" : "Credit receivable",
        }));

        setPayments([...rcvdPymtEntries, ...receivableEntries]);
      } catch {
        toast.error("Failed to load transaction");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const getModeCode = (modeId: number) => {
    const mode = paymentModes.find((m) => m.id === modeId);
    return mode?.code || "";
  };

  const handleAddPayment = () => {
    setPayments((prev) => [...prev, { id: null, paymentModeId: 0, amount: "", paymentDate: toDateInputValue(txn?.billDate), insurancePartnerId: "", insurancePartnerName: "", remarks: "" }]);
  };

  const handleRemovePayment = (idx: number) => {
    setPayments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handlePaymentChange = (idx: number, field: keyof PaymentEntry, value: string | number) => {
    setPayments((prev) => prev.map((p, i) => {
      if (i !== idx) return p;
      const next = { ...p, [field]: value };
      if (field === "paymentModeId" && getModeCode(Number(value)) !== "INSURANCE") {
        next.insurancePartnerId = "";
        next.insurancePartnerName = "";
      }
      return next;
    }));
  };

  const updateInsurancePartnerByName = (idx: number, inputName: string) => {
    const selected = insurancePartners.find((p) => p.bpName.toLowerCase() === inputName.trim().toLowerCase());
    setPayments((prev) => prev.map((p, i) =>
      i === idx ? { ...p, insurancePartnerName: inputName, insurancePartnerId: selected ? String(selected.id) : "" } : p
    ));
  };

  const handleSave = async () => {
    for (const pmt of payments) {
      if (!pmt.paymentModeId || !pmt.amount) continue;
      const modeCode = getModeCode(pmt.paymentModeId);
      if (modeCode === "INSURANCE" && !pmt.insurancePartnerId) {
        return toast.error("Please select an insurance company");
      }
      if (modeCode === "INSURANCE" && pmt.insurancePartnerName.trim().toLowerCase() === "unknown") {
        return toast.error("Select an actual insurance company instead of UNKNOWN");
      }
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        payments: payments
          .filter((pmt) => pmt.paymentModeId && pmt.amount)
          .map((pmt) => ({
            paymentModeId: pmt.paymentModeId,
            amount: pmt.amount,
            paymentDate: pmt.paymentDate || undefined,
            insurancePartnerId: pmt.insurancePartnerId || undefined,
          })),
      };

      await api.put(`/income/pharma/txns/${id}`, payload);
      toast.success("Transaction updated");
      goBack();
    } catch {
      toast.error("Failed to update transaction");
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (val: number | null | undefined) => {
    if (val == null) return "-";
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(val);
  };

  const formatDate = (d: string | null) => {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("en-GB");
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!txn) {
    return (
      <DashboardLayout>
        <p className="text-center text-slate-400 py-20">Transaction not found</p>
      </DashboardLayout>
    );
  }

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      VERIFIED: "bg-emerald-50 text-emerald-600",
      UNVERIFIED: "bg-amber-50 text-amber-600",
      REVIEW_REQ: "bg-red-50 text-red-600",
      ERROR: "bg-red-50 text-red-600",
      FULLYPAID: "bg-emerald-50 text-emerald-600",
      PARTIALPAID: "bg-amber-50 text-amber-600",
      UNPAID: "bg-red-50 text-red-600",
    };
    return styles[status] || "bg-slate-50 text-slate-600";
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <button onClick={goBack} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors">
          <ArrowLeft size={16} /> Back to Transactions
        </button>

        <div className="bg-white rounded-2xl border border-slate-200/60 p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-800">Edit Transaction (Pharma)</h1>
              <p className="text-sm text-slate-400">{txn.billNo} — {txn.patient?.name || "Unknown"}</p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 block">Net Amount</span>
              <span className="text-2xl font-bold text-indigo-600">{formatCurrency(txn.billAmt)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-4 pt-4 border-t border-slate-100">
            <div>
              <span className="text-xs text-slate-400 block">Bill Date</span>
              <span className="text-sm font-medium text-slate-700">{formatDate(txn.billDate)}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block">Patient</span>
              <span className="text-sm font-medium text-slate-700">{txn.patient?.name || "-"}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block">UHID</span>
              <span className="text-sm font-medium text-slate-700">{txn.patient?.uhid || "-"}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block">IP No</span>
              <span className="text-sm font-medium text-slate-700">{txn.ipAdm?.ipNo || "-"}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block">Payment Status</span>
              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium mt-0.5 ${statusBadge(txn.pymt_status)}`}>{txn.pymt_status}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block">Txn Status</span>
              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium mt-0.5 ${statusBadge(txn.txn_status)}`}>{txn.txn_status === "REVIEW_REQ" ? "REVIEW REQ" : txn.txn_status}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/60 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-700">Payments</h2>
            <button
              onClick={handleAddPayment}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              <Plus size={16} /> Add Payment
            </button>
          </div>
          <div className="space-y-3">
            {payments.map((pmt, idx) => {
              const modeCode = getModeCode(pmt.paymentModeId);
              return (
                <div key={idx} className="flex gap-3 items-end p-3 bg-slate-50 rounded-xl">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Payment Mode</label>
                    <select
                      value={pmt.paymentModeId}
                      onChange={(e) => handlePaymentChange(idx, "paymentModeId", Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    >
                      <option value={0}>Select mode</option>
                      {paymentModes.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Amount</label>
                    <input
                      type="number"
                      value={pmt.amount}
                      onChange={(e) => handlePaymentChange(idx, "amount", e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      {["INSURANCE", "CREDIT", "COMPANY"].includes(modeCode) ? "Payment Due Date" : "Paid Date"}
                    </label>
                    <input
                      type="date"
                      value={pmt.paymentDate}
                      onChange={(e) => handlePaymentChange(idx, "paymentDate", e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                  {modeCode === "INSURANCE" && (
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-500 mb-1">Insurance Company</label>
                      <input
                        type="text"
                        list={insuranceSuggestionsId}
                        value={pmt.insurancePartnerName}
                        onChange={(e) => updateInsurancePartnerByName(idx, e.target.value)}
                        placeholder="Type insurance company..."
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                      {!pmt.insurancePartnerId && pmt.insurancePartnerName.trim() && (
                        <p className="text-[10px] text-amber-600 mt-1">Select an insurance company from suggestions</p>
                      )}
                    </div>
                  )}
                  <div className="flex-none">
                    {payments.length > 1 && (
                      <button
                        onClick={() => handleRemovePayment(idx)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <datalist id={insuranceSuggestionsId}>
            {insurancePartners.map((p) => <option key={p.id} value={p.bpName} />)}
          </datalist>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={goBack}>Cancel</Button>
          <Button onClick={handleSave} isLoading={saving}>
            <CheckCircle size={16} className="mr-1" /> Save Changes
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}

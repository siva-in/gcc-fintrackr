"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useMemo, Suspense } from "react";
import api from "@/lib/api";
import Button from "@/components/ui/Button";
import toast from "react-hot-toast";
import { ArrowLeft, CheckCircle, Plus, Trash2 } from "lucide-react";

interface Doctor {
  id: number;
  name: string;
}

interface PaymentMode {
  id: number;
  code: string;
  name: string;
}

interface PayableEntry {
  id: number | null;
  doctorId: number;
  doctorName: string;
  billedAmt: string;
  payableAmt: string;
  dueDate: string;
}

interface PaymentEntry {
  id: number | null;
  paymentModeId: number;
  amount: string;
  paymentDate: string;
  dueDate: string;
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

export default function EditTransactionPage() {
  return (
    <Suspense fallback={null}>
      <EditTransactionPageContent />
    </Suspense>
  );
}

function EditTransactionPageContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const buildBackUrl = () => {
    const params = new URLSearchParams();
    const search = searchParams.get("search") || "";
    const fromDate = searchParams.get("fromDate") || "";
    const toDate = searchParams.get("toDate") || "";
    const pm = searchParams.get("pm") || "";
    const docId = searchParams.get("docId") || "";
    const txnStatus = searchParams.get("txnStatus") || "";
    const page = searchParams.get("page") || "1";
    const tab = searchParams.get("tab") || "transactions";
    if (search) params.set("search", search);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    if (pm) params.set("pm", pm);
    if (docId) params.set("docId", docId);
    if (txnStatus) params.set("txnStatus", txnStatus);
    params.set("page", page);
    params.set("tab", tab);
    const qs = params.toString();
    return `/income/op${qs ? `?${qs}` : ""}`;
  };

  const goBack = () => {
    sessionStorage.setItem("opFilterState", JSON.stringify({
      page: searchParams.get("page") || "1",
      search: searchParams.get("search") || "",
      fromDate: searchParams.get("fromDate") || "",
      toDate: searchParams.get("toDate") || "",
      txnPaymentFilter: searchParams.get("pm") || "",
      txnDoctorFilter: searchParams.get("docId") || "",
      txnStatusFilter: searchParams.get("txnStatus") || "",
      activeTab: searchParams.get("tab") || "transactions",
    }));
    router.push(buildBackUrl());
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type ApiData = any;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [txn, setTxn] = useState<ApiData>(null);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [paymentModes, setPaymentModes] = useState<PaymentMode[]>([]);

  const [grossAmount, setGrossAmount] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [errorReason, setErrorReason] = useState("");
  const [remarks, setRemarks] = useState("");

  const [payables, setPayables] = useState<PayableEntry[]>([]);
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [insurancePartners, setInsurancePartners] = useState<{ id: number; bpName: string }[]>([]);
  const insuranceSuggestionsId = "op-edit-insurance-suggestions";

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [txnRes, doctorsRes, modesRes, insuranceRes] = await Promise.all([
          api.get(`/income/txns/${id}`),
          api.get("/doctors?all=true"),
          api.get("/income/payment-modes"),
          api.get("/income/insurance-partners"),
        ]);
        const data: ApiData = txnRes.data;
        setTxn(data);
        setGrossAmount(data.grossAmount != null ? String(data.grossAmount) : "");
        setDiscountAmount(data.discountAmount != null ? String(data.discountAmount) : "");
        setErrorReason(data.errorReason || "");
        setRemarks(data.remarks || "");

        const initialPayables: PayableEntry[] = (data.payables || []).map((p: ApiData) => ({
          id: p.id,
          doctorId: p.doctor?.id || p.partyId,
          doctorName: p.doctor?.name || `Doctor #${p.partyId}`,
          billedAmt: String(p.billedAmt),
          payableAmt: String(p.payableAmt ?? p.billedAmt),
          dueDate: toDateInputValue(p.dueDate),
        }));
        setPayables(initialPayables);

        setDoctors(doctorsRes.data || []);
        setPaymentModes(modesRes.data || []);
        setInsurancePartners(insuranceRes.data || []);

        const creditMode = (modesRes.data || []).find((m: ApiData) => m.code === "CREDIT");
        const creditModeId = creditMode?.id;
        const insuranceMode = (modesRes.data || []).find((m: ApiData) => m.code === "INSURANCE");
        const insuranceModeId = insuranceMode?.id;

        const rcvdPymtEntries = (data.rcvdPymts || []).map((p: ApiData) => ({
          id: p.id,
          paymentModeId: p.paymentModeId || 0,
          amount: p.amount != null ? String(p.amount) : "",
          paymentDate: toDateInputValue(p.paymentDate),
          dueDate: "",
          insurancePartnerId: "",
          insurancePartnerName: "",
          remarks: p.remarks || "",
        }));

        const receivableEntries = (data.receivables || []).map((r: ApiData) => ({
          id: r.id,
          paymentModeId: r.arType === "INSURANCE" ? (insuranceModeId || 0) : (creditModeId || 0),
          amount: r.dueAmt != null ? String(r.dueAmt) : "",
          paymentDate: toDateInputValue(r.dueDate),
          dueDate: toDateInputValue(r.dueDate),
          insurancePartnerId: r.arType === "INSURANCE" ? (r.bizPartner?.id ? String(r.bizPartner.id) : "") : "",
          insurancePartnerName: r.arType === "INSURANCE" ? (r.bizPartner?.bpName || "") : "",
          remarks: r.arType === "INSURANCE" ? "Insurance receivable" : "Credit receivable",
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

  const net = useMemo(() => {
    const g = parseFloat(grossAmount) || 0;
    const d = parseFloat(discountAmount) || 0;
    return Math.max(0, g - d);
  }, [grossAmount, discountAmount]);

  const handleGrossChange = (val: string) => {
    setGrossAmount(val);
    const g = parseFloat(val) || 0;
    const d = parseFloat(discountAmount) || 0;
    if (d > g) setDiscountAmount(String(g));
  };

  const handleDiscountChange = (val: string) => {
    const d = parseFloat(val) || 0;
    const g = parseFloat(grossAmount) || 0;
    if (d > g) return toast.error("Discount cannot be greater than Gross Amount");
    setDiscountAmount(val);
  };

  const totalPayableAmt = useMemo(() => {
    return payables.reduce((sum, p) => sum + (parseFloat(p.payableAmt) || 0), 0);
  }, [payables]);

  const totalPaymentAmt = useMemo(() => {
    return payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  }, [payments]);

  const handleAddPayable = () => {
    const usedDoctors = payables.map((p) => p.doctorId).filter(Boolean);
    const available = doctors.filter((d) => !usedDoctors.includes(d.id));
    if (available.length === 0) {
      toast.error("No more doctors available");
      return;
    }
    setPayables((prev) => [...prev, { id: null, doctorId: available[0].id, doctorName: available[0].name, billedAmt: "", payableAmt: "", dueDate: toDateInputValue(txn?.billDate) }]);
  };

  const handleRemovePayable = (idx: number) => {
    setPayables((prev) => prev.filter((_, i) => i !== idx));
  };

  const handlePayableChange = (idx: number, field: keyof PayableEntry, value: string | number) => {
    setPayables((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  };

  const handleAddPayment = () => {
    setPayments((prev) => [...prev, { id: null, paymentModeId: 0, amount: "", paymentDate: toDateInputValue(txn?.billDate), dueDate: "", insurancePartnerId: "", insurancePartnerName: "", remarks: "" }]);
  };

  const handleRemovePayment = (idx: number) => {
    setPayments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handlePaymentChange = (idx: number, field: keyof PaymentEntry, value: string) => {
    setPayments((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  };

  const updateInsurancePartnerByName = (idx: number, inputName: string) => {
    const selected = insurancePartners.find((p) => p.bpName.toLowerCase() === inputName.trim().toLowerCase());
    setPayments((prev) => prev.map((p, i) =>
      i === idx
        ? { ...p, insurancePartnerName: inputName, insurancePartnerId: selected ? String(selected.id) : "" }
        : p
    ));
  };

  const handleSave = async () => {
    const g = parseFloat(grossAmount) || 0;
    const d = parseFloat(discountAmount) || 0;
    const n = g - d;

    if (payables.some((p) => {
      const pa = parseFloat(p.payableAmt) || 0;
      const ba = parseFloat(p.billedAmt) || 0;
      return pa > ba;
    })) {
      return toast.error("Payable amount cannot exceed billed amount");
    }

    if (totalPayableAmt > n) {
      return toast.error("Total payable amount cannot exceed Net Amount");
    }

    if (Math.abs(totalPaymentAmt - n) > 0.01) {
      return toast.error("Total payments must equal Net Amount");
    }

    const today = new Date().toISOString().split("T")[0];
    for (const pmt of payments) {
      if (!pmt.paymentModeId || !pmt.amount) continue;
      const selMode = paymentModes.find((m) => String(m.id) === String(pmt.paymentModeId));
      if ((selMode?.code === "CREDIT" || selMode?.code === "INSURANCE") && pmt.dueDate && pmt.dueDate < today) {
        return toast.error("Due date must be today or a future date");
      }
      if (selMode?.code === "INSURANCE" && !pmt.insurancePartnerId) {
        return toast.error("Please select an insurance company");
      }
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        grossAmount: String(g),
        discountAmount: String(d),
        netAmount: String(n),
        errorReason: errorReason || null,
        remarks: remarks || null,
        payables: payables.map((p) => ({
          id: p.id,
          doctorId: p.doctorId || undefined,
          billedAmt: p.billedAmt || "0",
          payableAmt: p.payableAmt || "0",
          dueDate: p.dueDate || undefined,
        })),
        payments: payments.map((pmt) => ({
          paymentModeId: pmt.paymentModeId || undefined,
          amount: pmt.amount || undefined,
          paymentDate: pmt.paymentDate || undefined,
          dueDate: pmt.dueDate || undefined,
          insurancePartnerId: pmt.insurancePartnerId || undefined,
        })).filter((pmt) => pmt.paymentModeId && pmt.amount),
      };

      await api.put(`/income/txns/${id}`, payload);
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
              <h1 className="text-xl font-bold text-slate-800">Edit Transaction (OP)</h1>
              <p className="text-sm text-slate-400">{txn.billNo} — {txn.patient?.name || "Unknown"}</p>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 block">Net Amount</span>
              <span className="text-2xl font-bold text-indigo-600">{formatCurrency(net)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-4 pt-4 border-t border-slate-100">
            <div>
              <span className="text-xs text-slate-400 block">Date</span>
              <span className="text-sm font-medium text-slate-700">{formatDate(txn.billDate)}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block">UHID</span>
              <span className="text-sm font-medium text-slate-700">{txn.patient?.uhid || "-"}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block">Txn Status</span>
              <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadge(txn.txn_status)}`}>{txn.txn_status}</span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block">Payment Status</span>
              <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadge(txn.pymt_status)}`}>{txn.pymt_status}</span>
            </div>
            <div>
              <span className="text-xs font-medium text-slate-500 block mb-1">Gross</span>
              <div className="flex items-center bg-white border border-indigo-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 shadow-sm">
                <span className="pl-2.5 text-sm text-slate-400">₹</span>
                <input
                  type="number"
                  value={grossAmount}
                  onChange={(e) => handleGrossChange(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm font-medium text-slate-800 outline-none"
                />
              </div>
            </div>
            <div>
              <span className="text-xs font-medium text-slate-500 block mb-1">Discount</span>
              <div className="flex items-center bg-white border border-indigo-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 shadow-sm">
                <span className="pl-2.5 text-sm text-slate-400">₹</span>
                <input
                  type="number"
                  value={discountAmount}
                  onChange={(e) => handleDiscountChange(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm font-medium text-slate-800 outline-none"
                />
              </div>
            </div>
            {txn.errorReason && (
              <div className="max-w-xs">
                <span className="text-xs text-slate-400 block">Error</span>
                <span className="text-sm text-red-600">{txn.errorReason}</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/60 p-6 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800">Doctor Payables</h2>
            <Button variant="secondary" size="sm" onClick={handleAddPayable}>
              <Plus size={14} className="mr-1" /> Add
            </Button>
          </div>

          {totalPayableAmt > 0 && (
            <p className="text-xs text-slate-500">
              Total payable: {formatCurrency(totalPayableAmt)} / {formatCurrency(net)}
              <span className={totalPayableAmt > net ? " text-red-500 ml-1" : " text-emerald-500 ml-1"}>
                {totalPayableAmt > net ? "(exceeds net)" : "(within net)"}
              </span>
            </p>
          )}

          {payables.length === 0 && (
            <p className="text-sm text-slate-400">No doctor payables configured.</p>
          )}

          {payables.map((p, idx) => {
            const billed = parseFloat(p.billedAmt) || 0;
            const payable = parseFloat(p.payableAmt) || 0;
            return (
              <div key={idx} className="p-4 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">Payable #{idx + 1}</span>
                  <button onClick={() => handleRemovePayable(idx)} className="p-1 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Doctor</label>
                    {p.id ? (
                      <p className="text-sm font-medium text-slate-700 px-3 py-2 bg-slate-100 rounded-xl">{p.doctorName}</p>
                    ) : (
                      <select value={p.doctorId} onChange={(e) => handlePayableChange(idx, "doctorId", parseInt(e.target.value) || 0)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                        {doctors.map((d) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Due Date</label>
                    <input type="date" value={p.dueDate} onChange={(e) => handlePayableChange(idx, "dueDate", e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Billed Amount</label>
                    {p.id ? (
                      <p className="text-sm font-medium text-slate-700 px-3 py-2 bg-slate-100 rounded-xl">{formatCurrency(billed)}</p>
                    ) : (
                      <input type="number" value={p.billedAmt} onChange={(e) => handlePayableChange(idx, "billedAmt", e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Payable Amount</label>
                    <input type="number" value={p.payableAmt} onChange={(e) => handlePayableChange(idx, "payableAmt", e.target.value)} className={`w-full px-3 py-2 bg-slate-50 border rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all ${payable > billed ? "border-red-300 bg-red-50" : "border-slate-200"}`} />
                    {payable > billed && <p className="text-xs text-red-500 mt-1">Cannot exceed billed amount ({formatCurrency(billed)})</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/60 p-6 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800">Payments</h2>
            <Button variant="secondary" size="sm" onClick={handleAddPayment}>
              <Plus size={14} className="mr-1" /> Add
            </Button>
          </div>

          <datalist id={insuranceSuggestionsId}>
            {insurancePartners.map((p) => (
              <option key={p.id} value={p.bpName} />
            ))}
          </datalist>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Remarks</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              placeholder="Add transaction remarks..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {totalPaymentAmt > 0 && (
            <p className="text-xs text-slate-500">
              Total: {formatCurrency(totalPaymentAmt)} / {formatCurrency(net)}
              <span className={Math.abs(totalPaymentAmt - net) > 0.01 ? " text-red-500 ml-1" : " text-emerald-500 ml-1"}>
                {Math.abs(totalPaymentAmt - net) > 0.01 ? "(mismatch)" : "(balanced)"}
              </span>
            </p>
          )}

          {payments.length === 0 && (
            <p className="text-sm text-slate-400">No payments recorded.</p>
          )}

          {payments.map((pmt, idx) => (
            <div key={idx} className="p-4 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">Payment #{idx + 1}{pmt.id ? " (existing)" : " (new)"}</span>
                <button onClick={() => handleRemovePayment(idx)} className="p-1 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Mode</label>
                  <select value={pmt.paymentModeId} onChange={(e) => handlePaymentChange(idx, "paymentModeId", e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500">
                    <option value={0}>Select mode...</option>
                    {paymentModes.map((m) => (
                      <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Amount</label>
                  <input type="number" value={pmt.amount} onChange={(e) => handlePaymentChange(idx, "amount", e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                </div>
                {(() => {
                  const selMode = paymentModes.find((m) => String(m.id) === String(pmt.paymentModeId));
                  const isCredit = selMode?.code === "CREDIT";
                  const isInsurance = selMode?.code === "INSURANCE";
                  const today = new Date().toISOString().split("T")[0];
                  const dateVal = isCredit || isInsurance ? pmt.dueDate : pmt.paymentDate;
                  return (
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        {isCredit || isInsurance ? "Payment Due Date" : "Payment Date"}
                        {(isCredit || isInsurance) && <span className="text-amber-500 ml-1">(today or future)</span>}
                      </label>
                      <input
                        type="date"
                        min={isCredit || isInsurance ? today : undefined}
                        value={dateVal}
                        onChange={(e) => {
                          if (isCredit || isInsurance) {
                            handlePaymentChange(idx, "dueDate", e.target.value);
                            handlePaymentChange(idx, "paymentDate", e.target.value);
                          } else {
                            handlePaymentChange(idx, "paymentDate", e.target.value);
                          }
                        }}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>
                  );
                })()}
              </div>
              {(() => {
                const selMode = paymentModes.find((m) => String(m.id) === String(pmt.paymentModeId));
                const isInsurance = selMode?.code === "INSURANCE";
                if (!isInsurance) return null;
                return (
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Insurance Company</label>
                    <input
                      type="text"
                      list={insuranceSuggestionsId}
                      value={pmt.insurancePartnerName}
                      onChange={(e) => updateInsurancePartnerByName(idx, e.target.value)}
                      placeholder="Type insurance company..."
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                    {!pmt.insurancePartnerId && pmt.insurancePartnerName.trim() && (
                      <p className="text-[10px] text-amber-600 mt-1">Select an insurance company from suggestions</p>
                    )}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-3 pb-10">
          <Button variant="secondary" onClick={goBack}>Cancel</Button>
          <Button onClick={handleSave} isLoading={saving}>
            <CheckCircle size={16} className="mr-1" /> Save Changes
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
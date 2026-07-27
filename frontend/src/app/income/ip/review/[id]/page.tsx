"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { Suspense, useState, useEffect, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import Button from "@/components/ui/Button";
import toast from "react-hot-toast";
import { ArrowLeft, Plus, Trash2, CheckCircle } from "lucide-react";

interface IncomeTxn {
  id: number;
  billNo: string;
  billDate: string | null;
  netAmount: number | null;
  grossAmount: number | null;
  discountAmount: number | null;
  advAdjt: number | null;
  ipNo: string | null;
  pymt_status: string;
  txn_status: string;
  patient: { id: number; name: string; uhid: string | null; mobileNo: string | null } | null;
  incomeSource: { code: string; name: string } | null;
  rcvdPymts: { id: number; amount: number | null; paymentMode: { code: string; name: string } | null; paymentDate: string | null; paidBy: string | null }[];
  payables: { id: number; billedAmt: number; payableAmt: number | null; balanceAmt: number; status: string; remarks: string | null; doctor: { id: number; name: string } | null }[];
  receivables?: { id: number; arType: string; dueAmt: number; dueDate: string | null; bizPartner: { id: number; bpName: string } | null }[];
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

interface PayableItem {
  payableId?: number;
  description: string;
  billedAmt: number;
  payableAmt: string;
  doctorId: string;
  doctorName: string;
  isOptional: boolean;
  isSelected: boolean;
}

const PAYABLE_DESCRIPTIONS = ["DOCTORS", "DOCTOR CONSULTATION", "SURGEON FEE", "ANESTHESIOLOGY TEAM CHARGES", "ASSISTANT SURGEON CHARGES - 1"];
const DEFAULT_PAYABLE_VISIBLE_DESCRIPTIONS = [
  "ANESTHESIOLOGY TEAM CHARGES",
  "ASSISTANT SURGEON CHARGES - 1",
  "CONSULTATION CHARGES",
  "DMO CHARGES",
  "DOCTOR CONSULTATION SPECIALITY",
  "PRE OPERATIVE ASSESMENT - ANAESTHETIST - IP",
  "SURGEON FEE",
];

const isPriorityPayableDescription = (description: string) => {
  const upper = (description || "").toUpperCase().trim();
  if (upper.startsWith("DR.")) return true;
  if (upper.startsWith("DR ")) return true;
  return DEFAULT_PAYABLE_VISIBLE_DESCRIPTIONS.some((d) => upper.includes(d));
};

function ReviewPageContent({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { id } = use(params);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [txn, setTxn] = useState<IncomeTxn | null>(null);
  const [showAllPayableItems, setShowAllPayableItems] = useState(false);

  const [pymts, setPymts] = useState<{ paymentModeId: string; amount: string; paymentDate: string; insurancePartnerId: string; insurancePartnerName: string }[]>([]);
  const [payableItems, setPayableItems] = useState<PayableItem[]>([]);
  const [doctorsList, setDoctorsList] = useState<{ id: number; name: string }[]>([]);
  const [paymentModes, setPaymentModes] = useState<{ id: number; code: string; name: string }[]>([]);
  const [insurancePartners, setInsurancePartners] = useState<{ id: number; bpName: string }[]>([]);
  const doctorSuggestionsId = "ip-review-doctor-suggestions";
  const insuranceSuggestionsId = "ip-review-insurance-suggestions";

  const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const stripDrPrefix = (value: string) => value.replace(/^dr[.\s:-]*/i, "").trim();

  const getDoctorFromDescription = (description: string, sourceDoctors = doctorsList) => {
    const match = description.trim().match(/^dr[.\s:-]*(.+)$/i);
    if (!match) return null;
    const stopWords = new Set([
      "doctor", "consultation", "speciality", "specialty", "charges", "charge", "fee", "fees", "team",
      "surgeon", "assistant", "anesthesiology", "anaesthesia", "nursing", "room", "floor", "bed", "icu",
    ]);
    const tail = match[1].split(/[(),/-]/)[0] || "";
    const tokens = tail.trim().split(/\s+/).filter(Boolean);
    const nameTokens = [];
    for (const tok of tokens) {
      if (stopWords.has(tok.toLowerCase())) break;
      nameTokens.push(tok);
      if (nameTokens.length >= 4) break;
    }
    const parsedName = nameTokens.join(" ").trim();
    if (!parsedName) return null;
    const normalizedRaw = normalizeName(stripDrPrefix(parsedName));
    const found = sourceDoctors.find((d) => {
      const normalizedDoctor = normalizeName(stripDrPrefix(d.name));
      return normalizedDoctor.includes(normalizedRaw) || normalizedRaw.includes(normalizedDoctor);
    });
    if (found) return { doctorId: String(found.id), doctorName: found.name };
    return { doctorId: "", doctorName: `DR. ${parsedName}` };
  };

  const buildBackUrl = () => {
    const params = new URLSearchParams();
    const search = searchParams.get("search") || "";
    const fromDate = searchParams.get("fromDate") || "";
    const toDate = searchParams.get("toDate") || "";
    const txnStatus = searchParams.get("txnStatus") || "";
    const pymtStatus = searchParams.get("pymtStatus") || "";
    const page = searchParams.get("page") || "1";
    if (search) params.set("search", search);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    if (txnStatus) params.set("txnStatus", txnStatus);
    if (pymtStatus) params.set("pymtStatus", pymtStatus);
    params.set("page", page);
    params.set("tab", "transactions");
    return `/income/ip?${params.toString()}`;
  };

  async function fetchTxnDetails(sourceDoctors = doctorsList) {
    setLoading(true);
    try {
      const { data } = await api.get(`/income/ip/txns/${id}`);
      setTxn(data);

      if (data.rcvdPymts && data.rcvdPymts.length > 0) {
        const insuranceReceivables = (data.receivables || []).filter((r: { arType: string }) => r.arType === "INSURANCE");
        const usedInsuranceIds = new Set<number>();
        const normalizeDate = (d: string | null) => (d ? new Date(d).toISOString().split("T")[0] : "");

        setPymts(data.rcvdPymts.map((p: { paymentModeId: number | null; amount: number | null; paymentDate: string | null; paymentMode?: { code?: string } | null }) => {
          let insurancePartnerId = "";
          let insurancePartnerName = "";
          if (p.paymentMode?.code === "INSURANCE") {
            const paymentDate = normalizeDate(p.paymentDate);
            const amount = Number(p.amount || 0);
            const matched = insuranceReceivables.find((r: { id: number; dueAmt: number; dueDate: string | null; bizPartner: { id: number; bpName: string } | null }) => (
              !usedInsuranceIds.has(r.id)
              && Math.abs(Number(r.dueAmt || 0) - amount) <= 0.01
              && normalizeDate(r.dueDate) === paymentDate
            )) || insuranceReceivables.find((r: { id: number }) => !usedInsuranceIds.has(r.id));
            if (matched) {
              usedInsuranceIds.add(matched.id);
              insurancePartnerId = matched.bizPartner?.id ? String(matched.bizPartner.id) : "";
              insurancePartnerName = matched.bizPartner?.bpName || "";
            }
          }
          return {
            paymentModeId: p.paymentModeId ? String(p.paymentModeId) : "",
            amount: p.amount != null ? String(p.amount) : "",
            paymentDate: p.paymentDate ? new Date(p.paymentDate).toISOString().split("T")[0] : "",
            insurancePartnerId,
            insurancePartnerName,
          };
        }));
      } else {
        setPymts([{ paymentModeId: "", amount: "", paymentDate: "", insurancePartnerId: "", insurancePartnerName: "" }]);
      }

      if (data.incomeDtls && data.incomeDtls.length > 0) {
        const items: PayableItem[] = data.incomeDtls.map((dtl: IncomeDtl) => {
          const desc = (dtl.description || "").toUpperCase();
          const isPayableType = PAYABLE_DESCRIPTIONS.some(pd => desc.includes(pd));
          const isOptional = desc.includes("ASSISTANT SURGEON");
          const parsedDoctor = getDoctorFromDescription(dtl.description || "", sourceDoctors);
          return {
            payableId: undefined,
            description: dtl.description || "",
            billedAmt: Number(dtl.amount) || 0,
            payableAmt: "",
            doctorId: parsedDoctor?.doctorId || "",
            doctorName: parsedDoctor?.doctorName || "",
            isOptional,
            isSelected: isPayableType && !isOptional,
          };
        });

        const savedPayables = (data.payables || []) as { id: number; billedAmt: number; payableAmt: number | null; doctor: { id: number; name: string } | null }[];
        const usedIndexes = new Set<number>();
        const isPreferredRow = (item: PayableItem) => {
          const upper = item.description.toUpperCase();
          return PAYABLE_DESCRIPTIONS.some((pd) => upper.includes(pd)) || /^DR[.\s:-]/i.test(item.description);
        };

        const findRowIndexForPayable = (payable: { billedAmt: number }) => {
          const billed = Number(payable.billedAmt || 0);
          let idx = items.findIndex((item, i) => !usedIndexes.has(i) && isPreferredRow(item) && Math.abs(item.billedAmt - billed) <= 0.01);
          if (idx >= 0) return idx;
          idx = items.findIndex((item, i) => !usedIndexes.has(i) && Math.abs(item.billedAmt - billed) <= 0.01);
          return idx;
        };

        for (const payable of savedPayables) {
          const idx = findRowIndexForPayable(payable);
          if (idx < 0) continue;
          usedIndexes.add(idx);
          items[idx].isSelected = true;
          items[idx].payableId = payable.id;
          items[idx].payableAmt = payable.payableAmt != null ? String(payable.payableAmt) : "";
          if (payable.doctor?.id) {
            items[idx].doctorId = String(payable.doctor.id);
            items[idx].doctorName = payable.doctor.name;
          }
        }

        items.sort((a, b) => {
          const aPriority = isPriorityPayableDescription(a.description) ? 0 : 1;
          const bPriority = isPriorityPayableDescription(b.description) ? 0 : 1;
          return aPriority - bPriority;
        });

        setPayableItems(items);
      }
    } catch {
      toast.error("Failed to load transaction details");
    } finally {
      setLoading(false);
    }
  }

  async function fetchDoctorsList() {
    try {
      const { data } = await api.get("/doctors?limit=9999");
      const doctors = data.doctors || [];
      setDoctorsList(doctors);
      return doctors;
    } catch { /* ignore */ }
    return [];
  }

  async function fetchPaymentModes() {
    try {
      const { data } = await api.get("/income/ip/payment-modes");
      setPaymentModes(data);
    } catch { /* ignore */ }
  }

  async function fetchInsurancePartners() {
    try {
      const { data } = await api.get("/income/ip/insurance-partners");
      setInsurancePartners(data || []);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    const init = async () => {
      const doctors = await fetchDoctorsList();
      await Promise.all([fetchPaymentModes(), fetchInsurancePartners()]);
      await fetchTxnDetails(doctors);
    };
    init();
  }, [id]);

  useEffect(() => {
    if (doctorsList.length === 0 || payableItems.length === 0) return;
    const needsPrefill = payableItems.some((item) => !item.doctorId && /^dr[.\s:-]/i.test(item.description || ""));
    if (!needsPrefill) return;
    let changed = false;
    const updated = payableItems.map((item) => {
      if (item.doctorId || !/^dr[.\s:-]/i.test(item.description || "")) return item;
      const parsedDoctor = getDoctorFromDescription(item.description || "", doctorsList);
      if (!parsedDoctor) return item;
      changed = true;
      return { ...item, doctorId: parsedDoctor.doctorId, doctorName: parsedDoctor.doctorName };
    });
    if (changed) setPayableItems(updated);
  }, [doctorsList, payableItems]);

  const addPaymentRow = () => {
    setPymts([...pymts, { paymentModeId: "", amount: "", paymentDate: "", insurancePartnerId: "", insurancePartnerName: "" }]);
  };

  const removePaymentRow = (index: number) => {
    setPymts(pymts.filter((_, i) => i !== index));
  };

  const updatePaymentRow = (index: number, field: string, value: string) => {
    const updated = [...pymts];
    (updated[index] as Record<string, string>)[field] = value;
    setPymts(updated);
  };

  const updatePayableDoctorByName = (index: number, inputName: string) => {
    const updated = [...payableItems];
    const selectedDoctor = doctorsList.find((d) => d.name.toLowerCase() === inputName.trim().toLowerCase());
    updated[index].doctorName = inputName;
    updated[index].doctorId = selectedDoctor ? String(selectedDoctor.id) : "";
    setPayableItems(updated);
  };

  const getModeCodeById = (paymentModeId: string) => {
    const mode = paymentModes.find((m) => String(m.id) === paymentModeId);
    return mode?.code || "";
  };

  const isDefaultVisiblePayableDescription = (description: string) => isPriorityPayableDescription(description);

  const updateInsurancePartnerByName = (index: number, inputName: string) => {
    const updated = [...pymts];
    const selected = insurancePartners.find((p) => p.bpName.toLowerCase() === inputName.trim().toLowerCase());
    updated[index].insurancePartnerName = inputName;
    updated[index].insurancePartnerId = selected ? String(selected.id) : "";
    setPymts(updated);
  };

  const handleSubmit = async () => {
    if (!txn) return;
    setSaving(true);
    try {
      const rcvdPymts = pymts
        .filter(p => p.amount && parseFloat(p.amount) > 0)
        .map(p => ({
          paymentModeId: p.paymentModeId || null,
          amount: p.amount,
          paymentDate: p.paymentDate || null,
          insurancePartnerId: p.insurancePartnerId || null,
        }));

      const payables = payableItems
        .filter(item => item.isSelected && item.payableAmt && parseFloat(item.payableAmt) > 0)
        .map(item => ({
          payableId: item.payableId || null,
          description: item.description,
          billedAmt: item.billedAmt,
          payableAmt: item.payableAmt,
          doctorId: item.doctorId || null,
          name: txn.patient?.name || null,
          isOptional: item.isOptional,
        }));

      await api.post(`/income/ip/txns/${txn.id}/review`, { rcvdPymts, payables });
      toast.success("Review saved successfully");
      router.push(buildBackUrl());
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to save review";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(val);
  };

  const formatDate = (d: string | null) => {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("en-GB");
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "VERIFIED": return "bg-emerald-50 text-emerald-600";
      case "UNVERIFIED": return "bg-orange-50 text-orange-600";
      case "ERROR": return "bg-red-50 text-red-600";
      default: return "bg-slate-50 text-slate-500";
    }
  };

  return (
    <DashboardLayout>
      <div className="mb-6">
        <button
          onClick={() => router.push(buildBackUrl())}
          className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft size={18} />
          <span className="text-sm font-medium">Back to IP Transactions</span>
        </button>
      </div>

      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Review Transaction</h1>
          <p className="text-slate-400 text-sm mt-1 xl:hidden">Review and update payment details, create payables</p>
        </div>
        {txn && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 xl:ml-4">
              <div className="p-2 bg-slate-50 rounded-lg min-w-[130px]">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Gross Amount</label>
                <p className="text-sm font-semibold text-slate-800">{txn.grossAmount ? formatCurrency(Number(txn.grossAmount)) : "-"}</p>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg min-w-[130px]">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Discount</label>
                <p className="text-sm font-semibold text-slate-800">{txn.discountAmount ? formatCurrency(Number(txn.discountAmount)) : "-"}</p>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg min-w-[130px]">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Advance Adjustment</label>
                <p className="text-sm font-semibold text-slate-800">{txn.advAdjt ? formatCurrency(Number(txn.advAdjt)) : "-"}</p>
              </div>
              <div className="p-2 bg-indigo-50 rounded-lg border border-indigo-100 min-w-[130px]">
                <label className="block text-[11px] font-medium text-indigo-600 mb-1">Net Amount</label>
                <p className="text-sm font-bold text-indigo-700">{txn.netAmount ? formatCurrency(Number(txn.netAmount)) : "-"}</p>
              </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      ) : !txn ? (
        <div className="text-center py-20 text-slate-400">Transaction not found</div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200/60 p-6">
            <h2 className="text-lg font-semibold text-slate-700 mb-4">Transaction Details</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Bill No</label>
                <p className="text-sm font-semibold text-slate-800">{txn.billNo}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Bill Date</label>
                <p className="text-sm font-medium text-slate-700">{formatDate(txn.billDate)}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Patient</label>
                <p className="text-sm font-medium text-slate-700">{txn.patient?.name || "-"}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">UHID</label>
                <p className="text-sm font-medium text-slate-700">{txn.patient?.uhid || "-"}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">IP No</label>
                <p className="text-sm font-medium text-slate-700">{txn.ipNo || "-"}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Txn Status</label>
                <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(txn.txn_status)}`}>
                  {txn.txn_status}
                </span>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Source</label>
                <p className="text-sm font-medium text-slate-700">{txn.incomeSource?.name || "-"}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/60 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-700">Payments (Received)</h2>
              <button onClick={addPaymentRow} className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                <Plus size={16} /> Add Payment
              </button>
            </div>
            <div className="space-y-3">
              {pymts.map((pmt, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-3 items-end p-3 bg-slate-50 rounded-xl">
                  <div className="col-span-3">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Payment Mode</label>
                    <select
                      value={pmt.paymentModeId}
                      onChange={(e) => {
                        updatePaymentRow(idx, "paymentModeId", e.target.value);
                        const modeCode = getModeCodeById(e.target.value);
                        if (modeCode !== "INSURANCE") {
                          updatePaymentRow(idx, "insurancePartnerId", "");
                          updatePaymentRow(idx, "insurancePartnerName", "");
                        }
                      }}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    >
                      <option value="">Select mode</option>
                      {paymentModes.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Amount</label>
                    <input
                      type="number"
                      value={pmt.amount}
                      onChange={(e) => updatePaymentRow(idx, "amount", e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                  <div className={`${getModeCodeById(pmt.paymentModeId) === "INSURANCE" ? "col-span-3" : "col-span-6"}`}>
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      {["INSURANCE", "CREDIT"].includes(getModeCodeById(pmt.paymentModeId)) ? "Payment Due Date" : "Payment Date"}
                    </label>
                    <input
                      type="date"
                      value={pmt.paymentDate}
                      onChange={(e) => updatePaymentRow(idx, "paymentDate", e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                  {getModeCodeById(pmt.paymentModeId) === "INSURANCE" && (
                    <div className="col-span-3">
                      <label className="block text-xs font-medium text-slate-500 mb-1">Insurance Company</label>
                      <input
                        type="text"
                        list={insuranceSuggestionsId}
                        value={pmt.insurancePartnerName}
                        onChange={(e) => updateInsurancePartnerByName(idx, e.target.value)}
                        placeholder="Type insurance company..."
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                      {!pmt.insurancePartnerId && pmt.insurancePartnerName.trim() && (
                        <p className="text-[10px] text-amber-600 mt-1">Select an insurance company from suggestions</p>
                      )}
                    </div>
                  )}
                  <div className="col-span-1">
                    {pymts.length > 1 && (
                      <button onClick={() => removePaymentRow(idx)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {payableItems.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/60 p-6">
              <div className="flex items-center justify-between gap-3 mb-2">
                <h2 className="text-lg font-semibold text-slate-700">Payable Items (from Detail Report)</h2>
                {payableItems.some((item) => !isDefaultVisiblePayableDescription(item.description)) && (
                  <button
                    type="button"
                    onClick={() => setShowAllPayableItems((v) => !v)}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    {showAllPayableItems ? "Show Less" : "Show More"}
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400 mb-4">Select items to create payables. Amount must be less than or equal to billed amount.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="px-4 py-3 w-10"></th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Description</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Billed Amount</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Doctor</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-500 text-xs uppercase tracking-wider">Payable Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payableItems.map((item, idx) => {
                      if (!showAllPayableItems && !isDefaultVisiblePayableDescription(item.description)) return null;
                      return (
                      <tr key={idx} className={`${item.isSelected ? "bg-indigo-50/30" : ""} ${item.isOptional ? "bg-amber-50/20" : ""}`}>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={item.isSelected}
                            onChange={(e) => {
                              const updated = [...payableItems];
                              updated[idx].isSelected = e.target.checked;
                              if (e.target.checked && !updated[idx].doctorId && /^dr[.\s:-]/i.test(updated[idx].description || "")) {
                                const parsedDoctor = getDoctorFromDescription(updated[idx].description || "", doctorsList);
                                if (parsedDoctor) {
                                  updated[idx].doctorId = parsedDoctor.doctorId;
                                  updated[idx].doctorName = parsedDoctor.doctorName;
                                }
                              }
                              setPayableItems(updated);
                            }}
                            className="accent-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-slate-700">{item.description}</span>
                          {item.isOptional && (
                            <span className="ml-2 text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Optional</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-700">{formatCurrency(item.billedAmt)}</td>
                        <td className="px-4 py-3">
                          {item.isSelected ? (
                            <div>
                              <input
                                type="text"
                                list={doctorSuggestionsId}
                                value={item.doctorName}
                                onChange={(e) => updatePayableDoctorByName(idx, e.target.value)}
                                placeholder="Type doctor name..."
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                              />
                              {!item.doctorId && item.doctorName.trim() && (
                                <p className="text-[10px] text-amber-600 mt-1">Select a doctor from suggestions</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {item.isSelected ? (
                            <div>
                              <input
                                type="number"
                                min={0}
                                max={item.billedAmt}
                                step="0.01"
                                value={item.payableAmt}
                                onChange={(e) => {
                                  const updated = [...payableItems];
                                  updated[idx].payableAmt = e.target.value;
                                  setPayableItems(updated);
                                }}
                                placeholder={`Max: ${item.billedAmt}`}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-right focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                              />
                              {item.payableAmt && parseFloat(item.payableAmt) > item.billedAmt && (
                                <p className="text-[10px] text-red-500 mt-1">Must be less than or equal to billed amount</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>
              <datalist id={doctorSuggestionsId}>
                {doctorsList.map((d) => (
                  <option key={d.id} value={d.name} />
                ))}
              </datalist>
              <datalist id={insuranceSuggestionsId}>
                {insurancePartners.map((p) => (
                  <option key={p.id} value={p.bpName} />
                ))}
              </datalist>
            </div>
          )}

          <div className="flex justify-end gap-3 pb-6">
            <Button variant="secondary" onClick={() => router.push(buildBackUrl())}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} isLoading={saving}>
              <CheckCircle size={16} className="mr-1" /> Save Review
            </Button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export default function ReviewPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<DashboardLayout><div className="py-20 text-center text-slate-400">Loading...</div></DashboardLayout>}>
      <ReviewPageContent {...props} />
    </Suspense>
  );
}

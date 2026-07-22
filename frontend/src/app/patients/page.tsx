"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useEffect, useState, useRef } from "react";
import api from "@/lib/api";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import toast from "react-hot-toast";
import { Plus, Edit2, Trash2, Search, Upload, X } from "lucide-react";

interface Patient {
  id: number;
  regDate: string | null;
  uhidNo: string | null;
  patientName: string;
  address1: string | null;
  age: number | null;
  bloodGroup: string | null;
  mobileNo: string | null;
}

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [form, setForm] = useState({ regDate: "", uhidNo: "", patientName: "", address1: "", age: "", bloodGroup: "", mobileNo: "" });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; total: number; errors?: { row: number; reason: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fetchPatients = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/patients?page=${page}&search=${search}&limit=10`);
      setPatients(data.patients);
      setPagination(data.pagination);
    } catch {
      toast.error("Failed to load patients");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPatients(); }, [page, search]);

  const openCreate = () => {
    setEditingPatient(null);
    setForm({ regDate: "", uhidNo: "", patientName: "", address1: "", age: "", bloodGroup: "", mobileNo: "" });
    setModalOpen(true);
  };

  const openEdit = (patient: Patient) => {
    setEditingPatient(patient);
    setForm({
      regDate: patient.regDate ? new Date(patient.regDate).toISOString().split("T")[0] : "",
      uhidNo: patient.uhidNo || "",
      patientName: patient.patientName,
      address1: patient.address1 || "",
      age: patient.age != null ? String(patient.age) : "",
      bloodGroup: patient.bloodGroup || "",
      mobileNo: patient.mobileNo || "",
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        regDate: form.regDate || undefined,
        uhidNo: form.uhidNo || undefined,
        age: form.age ? parseInt(form.age) : undefined,
        address1: form.address1 || undefined,
        bloodGroup: form.bloodGroup || undefined,
        mobileNo: form.mobileNo || undefined,
      };

      if (editingPatient) {
        await api.put(`/patients/${editingPatient.id}`, payload);
        toast.success("Patient updated");
      } else {
        await api.post("/patients", payload);
        toast.success("Patient created");
      }
      setModalOpen(false);
      fetchPatients();
    } catch (err: unknown) {
      const response = (err as { response?: { data?: { errors?: { msg: string }[]; message?: string } } })?.response?.data;
      if (response?.errors?.length) {
        toast.error(response.errors.map((e) => e.msg).join("\n"));
      } else if (response?.message) {
        toast.error(response.message);
      } else {
        toast.error("Operation failed");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (patient: Patient) => {
    if (!confirm(`Delete patient "${patient.patientName}"?`)) return;
    try {
      await api.delete(`/patients/${patient.id}`);
      toast.success("Patient deleted");
      fetchPatients();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Delete failed";
      toast.error(msg);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) { toast.error("Please select a file"); return; }
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const { data } = await api.post("/patients/import", formData, { headers: { "Content-Type": "multipart/form-data" } });
      setImportResult(data);
      fetchPatients();
    } catch (err: unknown) {
      const response = (err as { response?: { data?: { message?: string } } })?.response?.data;
      toast.error(response?.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return "-";
    return new Date(d).toLocaleDateString("en-GB");
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Patients</h1>
          <p className="text-slate-400 text-sm mt-1">Manage patient records</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => { setImportResult(null); setSelectedFile(null); setImportModalOpen(true); }}>
            <Upload size={16} className="mr-2" /> Import
          </Button>
          <Button onClick={openCreate}>
            <Plus size={16} className="mr-2" /> Add Patient
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 p-4 mb-6">
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search patients..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200/60">
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">UHID</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Name</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Age</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Blood Group</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Mobile</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Reg Date</th>
                <th className="text-right px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                    Loading...
                  </div>
                </td></tr>
              ) : patients.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">No patients found</td></tr>
              ) : (
                patients.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3.5 font-medium text-slate-700">{p.uhidNo || "-"}</td>
                    <td className="px-5 py-3.5 text-slate-700">{p.patientName}</td>
                    <td className="px-5 py-3.5 text-slate-500">{p.age ?? "-"}</td>
                    <td className="px-5 py-3.5 text-slate-500">{p.bloodGroup || "-"}</td>
                    <td className="px-5 py-3.5 text-slate-500">{p.mobileNo || "-"}</td>
                    <td className="px-5 py-3.5 text-slate-500">{formatDate(p.regDate)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <button onClick={() => openEdit(p)} className="p-2 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => handleDelete(p)} className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 ml-1 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination.pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200/60 bg-slate-50/50">
            <p className="text-sm text-slate-400">
              Showing {(pagination.page - 1) * 10 + 1} to {Math.min(pagination.page * 10, pagination.total)} of {pagination.total}
            </p>
            <div className="flex gap-1">
              {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-3.5 py-1.5 text-sm rounded-lg font-medium transition-all ${p === page ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/25" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingPatient ? "Edit Patient" : "Create Patient"}>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Reg Date"
              type="date"
              value={form.regDate}
              onChange={(e) => setForm({ ...form, regDate: e.target.value })}
            />
            <Input
              label="UHID No"
              value={form.uhidNo}
              onChange={(e) => setForm({ ...form, uhidNo: e.target.value })}
              placeholder="Auto-generated if blank"
            />
          </div>
          <Input
            label="Patient Name *"
            value={form.patientName}
            onChange={(e) => setForm({ ...form, patientName: e.target.value })}
            required
          />
          <Input
            label="Address"
            value={form.address1}
            onChange={(e) => setForm({ ...form, address1: e.target.value })}
          />
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Age"
              type="number"
              value={form.age}
              onChange={(e) => setForm({ ...form, age: e.target.value })}
              min={0}
              max={200}
            />
            <Input
              label="Blood Group"
              value={form.bloodGroup}
              onChange={(e) => setForm({ ...form, bloodGroup: e.target.value })}
              placeholder="O+, A-, etc."
            />
            <Input
              label="Mobile"
              value={form.mobileNo}
              onChange={(e) => setForm({ ...form, mobileNo: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={saving}>{editingPatient ? "Update" : "Create"}</Button>
          </div>
        </form>
      </Modal>

      {/* Import Modal */}
      <Modal isOpen={importModalOpen} onClose={() => setImportModalOpen(false)} title="Import Patients">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Upload an Excel file with columns: <strong>Reg.Date, UHID No, Patient Name, Address1, Age, Blood Group, Mobile NO</strong>
          </p>
          <p className="text-xs text-slate-400">Title rows and dummy values (--None--, N/A, etc.) are auto-skipped. If UHID is missing, FT_0001, FT_0002... will be auto-generated.</p>

          <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-indigo-400 transition-colors">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />
            {selectedFile ? (
              <div className="flex items-center justify-center gap-2">
                <span className="text-sm text-slate-700 font-medium">{selectedFile.name}</span>
                <button onClick={() => setSelectedFile(null)} className="p-1 hover:bg-slate-100 rounded-lg">
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
            <div className={`p-4 rounded-xl text-sm ${importResult.errors ? "bg-amber-50 border border-amber-200" : "bg-emerald-50 border border-emerald-200"}`}>
              <p className="font-semibold text-slate-700">Import Complete</p>
              <p className="text-slate-600 mt-1">Total rows: {importResult.total} | Created: {importResult.created} | Skipped: {importResult.skipped}</p>
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
            <Button type="button" variant="secondary" onClick={() => setImportModalOpen(false)}>
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
    </DashboardLayout>
  );
}

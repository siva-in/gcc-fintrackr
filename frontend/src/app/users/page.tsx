"use client";

import DashboardLayout from "@/components/layout/DashboardLayout";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import type { User } from "@/lib/types";
import { useAuthStore } from "@/stores/authStore";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import Badge from "@/components/ui/Badge";
import toast from "react-hot-toast";
import { Plus, Edit2, Trash2, Search } from "lucide-react";

type FormErrors = Record<string, string>;

export default function UsersPage() {
  const { userLevel } = useAuthStore();
  const [users, setUsers] = useState<(User & { _count?: { orgUsers: number; companyUsers: number } })[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState({ username: "", password: "", firstName: "", lastName: "", mobile: "", status: "ACTIVE", userLevel: "ORG" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/users?page=${page}&search=${search}&limit=10`);
      setUsers(data.users);
      setPagination(data.pagination);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, [page, search]);

  const openCreate = () => {
    setEditingUser(null);
    setForm({ username: "", password: "", firstName: "", lastName: "", mobile: "", status: "ACTIVE", userLevel: "ORG" });
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setForm({ username: user.username, password: "", firstName: user.firstName, lastName: user.lastName, mobile: user.mobile, status: user.status, userLevel: user.userLevel });
    setErrors({});
    setModalOpen(true);
  };

  const validateField = (field: string, value: string) => {
    let msg = "";
    if (!editingUser && field === "username" && (!value || value.length < 3)) msg = "Username must be at least 3 characters";
    if (!editingUser && field === "password" && (!value || value.length < 6)) msg = "Password must be at least 6 characters";
    if (field === "mobile" && (!value || value.length !== 10)) msg = "Mobile must be exactly 10 digits";
    setErrors((p) => ({ ...p, [field]: msg }));
  };

  const validate = (): boolean => {
    const e: FormErrors = {};
    if (!editingUser) {
      if (!form.username || form.username.length < 3) e.username = "Username must be at least 3 characters";
      if (!form.password || form.password.length < 6) e.password = "Password must be at least 6 characters";
    }
    if (!form.firstName) e.firstName = "First name is required";
    if (!form.lastName) e.lastName = "Last name is required";
    if (!form.mobile || form.mobile.length !== 10) e.mobile = "Mobile must be exactly 10 digits";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      if (editingUser) {
        const payload: Record<string, string> = {
          firstName: form.firstName,
          lastName: form.lastName,
          mobile: form.mobile,
          status: form.status,
          userLevel: form.userLevel,
        };
        if (form.password) payload.password = form.password;
        await api.put(`/users/${editingUser.id}`, payload);
        toast.success("User updated");
      } else {
        await api.post("/users", form);
        toast.success("User created");
      }
      setModalOpen(false);
      fetchUsers();
    } catch (err: unknown) {
      const response = (err as { response?: { data?: { errors?: { path?: string; msg: string }[]; message?: string } } })?.response?.data;
      if (response?.errors?.length) {
        const serverErrors: FormErrors = {};
        for (const err of response.errors) {
          if (err.path) serverErrors[err.path] = err.msg;
        }
        if (Object.keys(serverErrors).length > 0) {
          setErrors(serverErrors);
          return;
        }
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

  const handleDelete = async (user: User) => {
    if (!confirm(`Delete user ${user.username}?`)) return;
    try {
      await api.delete(`/users/${user.id}`);
      toast.success("User deleted");
      fetchUsers();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Delete failed";
      toast.error(msg);
    }
  };

  const isCompany = userLevel === "COMPANY";
  const canEdit = true; // both COMPANY and ORG users can access

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Users</h1>
          <p className="text-slate-400 text-sm mt-1">Manage system users</p>
        </div>
        {canEdit && (
          <Button onClick={openCreate}>
            <Plus size={16} className="mr-2" /> Add User
          </Button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 p-4 mb-6">
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search users..."
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
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Username</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Name</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Mobile</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Level</th>
                <th className="text-left px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Status</th>
                {canEdit && <th className="text-right px-5 py-3.5 font-semibold text-slate-500 text-xs uppercase tracking-wider">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                    Loading...
                  </div>
                </td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">No users found</td></tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3.5 font-medium text-slate-700">{user.username}</td>
                    <td className="px-5 py-3.5 text-slate-600">{user.firstName} {user.lastName}</td>
                    <td className="px-5 py-3.5 text-slate-500">{user.mobile}</td>
                    <td className="px-5 py-3.5">
                      <Badge variant={user.userLevel === "COMPANY" ? "info" : "pending"}>{user.userLevel}</Badge>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant={user.status === "ACTIVE" ? "success" : "danger"}>{user.status}</Badge>
                    </td>
                    {canEdit && (
                      <td className="px-5 py-3.5 text-right">
                        <button onClick={() => openEdit(user)} className="p-2 hover:bg-indigo-50 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors">
                          <Edit2 size={16} />
                        </button>
                        {user.username !== "admin" && (
                          <button onClick={() => handleDelete(user)} className="p-2 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 ml-1 transition-colors">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    )}
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

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingUser ? "Edit User" : "Create User"}>
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Username *"
            value={form.username}
            onChange={(e) => { setForm({ ...form, username: e.target.value }); setErrors((p) => ({ ...p, username: "" })); }}
            onBlur={() => validateField("username", form.username)}
            disabled={!!editingUser}
            required={!editingUser}
            error={errors.username}
          />
          {!editingUser && (
            <Input
              label="Password *"
              type="password"
              value={form.password}
              onChange={(e) => { setForm({ ...form, password: e.target.value }); setErrors((p) => ({ ...p, password: "" })); }}
              onBlur={() => validateField("password", form.password)}
              required
              error={errors.password}
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="First Name *"
              value={form.firstName}
              onChange={(e) => { setForm({ ...form, firstName: e.target.value }); setErrors((p) => ({ ...p, firstName: "" })); }}
              error={errors.firstName}
            />
            <Input
              label="Last Name *"
              value={form.lastName}
              onChange={(e) => { setForm({ ...form, lastName: e.target.value }); setErrors((p) => ({ ...p, lastName: "" })); }}
              error={errors.lastName}
            />
          </div>
          <Input
            label="Mobile *"
            value={form.mobile}
            onChange={(e) => { setForm({ ...form, mobile: e.target.value }); setErrors((p) => ({ ...p, mobile: "" })); }}
            onBlur={() => validateField("mobile", form.mobile)}
            pattern="\d{10}"
            maxLength={10}
            error={errors.mobile}
          />
          {isCompany ? (
            <Select
              label="User Level"
              value={form.userLevel}
              onChange={(e) => setForm({ ...form, userLevel: e.target.value })}
              options={[
                { value: "ORG", label: "Org Level" },
                { value: "COMPANY", label: "Company Level" },
              ]}
            />
          ) : (
            <Input label="User Level" value="Org Level" disabled />
          )}
          <Select
            label="Status"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            options={[{ value: "ACTIVE", label: "Active" }, { value: "INACTIVE", label: "Inactive" }]}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={saving}>{editingUser ? "Update" : "Create"}</Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}

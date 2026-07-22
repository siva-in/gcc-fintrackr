"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { LayoutDashboard, Users, Building2, FileText, CheckCircle, Shield, Settings, Stethoscope, UserRound, X, ChevronLeft } from "lucide-react";

const companyNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/users", label: "Users", icon: Users },
  { href: "/organizations", label: "Organizations", icon: Building2 },
  { href: "/roles", label: "Role Assignment", icon: Shield },
  { href: "/role-master", label: "Role Master", icon: Settings },
  { href: "/doctors", label: "Doctors", icon: Stethoscope },
  { href: "/patients", label: "Patients", icon: UserRound },
];

const orgNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/requests", label: "Requests", icon: FileText },
  { href: "/approvals", label: "Approvals", icon: CheckCircle },
];

interface SidebarProps {
  isOpen: boolean;
  collapsed: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
}

export default function Sidebar({ isOpen, collapsed, onClose, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const { userLevel, orgRole } = useAuthStore();

  const navItems = userLevel === "COMPANY" ? companyNavItems : orgNavItems;

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 h-full bg-[#0f172a] flex flex-col transition-all duration-300 ease-in-out
          lg:translate-x-0
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          ${collapsed ? "lg:w-[72px]" : "lg:w-64"}
          w-64
        `}
      >
        <div className={`flex items-center h-16 px-4 border-b border-white/10 shrink-0 ${collapsed ? "justify-center" : "justify-between"}`}>
          <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
            {!collapsed && <span className="text-lg font-bold text-white tracking-tight">FinTrackr</span>}
          </Link>
          <div className="flex items-center">
            <button onClick={onClose} className="lg:hidden p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg">
              <X size={18} />
            </button>
            <button onClick={onToggleCollapse} className="hidden lg:flex p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg">
              <ChevronLeft size={18} className={`transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>

        {!collapsed && (
          <div className="px-4 py-2 border-b border-white/5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400">
              {userLevel === "COMPANY" ? "Company Access" : "Org Access"}
            </span>
          </div>
        )}

        <nav className={`flex-1 overflow-y-auto py-3 ${collapsed ? "px-2" : "px-3"}`}>
          <div className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
              const Icon = item.icon;

              if (item.href === "/approvals" && orgRole !== "LEADER") return null;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center rounded-xl text-sm font-medium transition-all duration-150
                    ${collapsed ? "justify-center px-0 py-2.5 mx-1" : "gap-3 px-3 py-2.5"}
                    ${isActive ? "bg-indigo-500/15 text-indigo-300 shadow-sm" : "text-slate-400 hover:bg-white/5 hover:text-white"}
                  `}
                >
                  <Icon size={20} className={isActive ? "text-indigo-400" : ""} strokeWidth={isActive ? 2.2 : 1.8} />
                  {!collapsed && <span>{item.label}</span>}
                  {isActive && !collapsed && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-400" />}
                </Link>
              );
            })}
          </div>
        </nav>

        {!collapsed && (
          <div className="px-4 py-3 border-t border-white/5">
            <p className="text-[11px] text-slate-500 text-center">FinTrackr v1.0</p>
          </div>
        )}
      </aside>
    </>
  );
}

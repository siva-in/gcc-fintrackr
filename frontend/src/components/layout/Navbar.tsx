"use client";

import { useAuthStore } from "@/stores/authStore";
import { useRouter } from "next/navigation";
import { LogOut, Menu, ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";

interface NavbarProps {
  onMenuClick: () => void;
}

export default function Navbar({ onMenuClick }: NavbarProps) {
  const { user, userLevel, orgMemberships, orgId, orgRole, setOrg, logout } = useAuthStore();
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleOrgSwitch = (newOrgId: number) => {
    setOrg(newOrgId);
    setDropdownOpen(false);
    window.location.reload();
  };

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const currentOrg = orgMemberships.find((m) => m.organization.id === orgId);

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 h-14 sm:h-16 lg:h-18 flex items-center px-4 lg:px-6">
      <button onClick={onMenuClick} className="lg:hidden p-2 hover:bg-slate-100 rounded-xl mr-2 text-slate-500">
        <Menu size={20} />
      </button>

      <img src="/gcclogo.png" alt="Logo" className="h-14 sm:h-16 md:h-18 w-auto object-contain" />

      <div className="flex-1" />

      {/* Org switcher for ORG users */}
      {userLevel === "ORG" && orgMemberships.length > 1 && (
        <div className="relative mr-4" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-sm font-medium transition-all"
          >
            <div className="w-6 h-6 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-lg flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">{currentOrg?.organization.name?.[0] || "?"}</span>
            </div>
            <span className="truncate max-w-40 text-slate-700">{currentOrg?.organization.name || "Select Org"}</span>
            <ChevronDown
              size={16}
              className={`text-slate-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
            />
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-60 bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-200/50 py-1.5 animate-slide-in">
              {orgMemberships.map((m) => (
                <button
                  key={m.organization.id}
                  onClick={() => handleOrgSwitch(m.organization.id)}
                  className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 hover:bg-slate-50 transition-colors ${m.organization.id === orgId ? "bg-indigo-50" : ""}`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white ${m.organization.id === orgId ? "bg-gradient-to-br from-indigo-500 to-purple-600" : "bg-slate-300"}`}
                  >
                    {m.organization.name[0]}
                  </div>
                  <div className="min-w-0">
                    <span
                      className={`font-medium block truncate ${m.organization.id === orgId ? "text-indigo-700" : "text-slate-700"}`}
                    >
                      {m.organization.name}
                    </span>
                    <span className="text-xs text-slate-400">{m.role}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Single org badge for ORG users */}
      {userLevel === "ORG" && orgMemberships.length === 1 && currentOrg && (
        <div className="mr-4 flex items-center gap-2.5 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-200">
          <div className="w-6 h-6 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-lg flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">{currentOrg.organization.name[0]}</span>
          </div>
          <div className="text-sm">
            <span className="font-medium text-slate-700">{currentOrg.organization.name}</span>
            <span className="ml-1.5 text-xs text-slate-400 font-medium">({orgRole})</span>
          </div>
        </div>
      )}

      {/* User menu */}
      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-medium text-slate-700">
            {user?.firstName} {user?.lastName}
          </p>
          <p className="text-xs text-slate-400">{user?.username}</p>
        </div>
        <div className="w-9 h-9 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-xl flex items-center justify-center text-white font-semibold text-sm shrink-0">
          {user?.firstName?.[0]}
          {user?.lastName?.[0]}
        </div>
        <button
          onClick={handleLogout}
          className="p-2 text-slate-400 hover:bg-red-50 rounded-xl hover:text-red-500 transition-all"
          title="Logout"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}

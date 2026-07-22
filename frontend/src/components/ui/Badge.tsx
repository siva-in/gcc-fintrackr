"use client";

interface BadgeProps {
  variant: "success" | "warning" | "danger" | "info" | "pending";
  children: React.ReactNode;
}

const variants = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  warning: "bg-amber-50 text-amber-700 ring-amber-600/20",
  danger: "bg-red-50 text-red-700 ring-red-600/20",
  info: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  pending: "bg-orange-50 text-orange-700 ring-orange-600/20",
};

export default function Badge({ variant, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ring-inset ${variants[variant]}`}
    >
      {children}
    </span>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";

export default function Home() {
  const { token, isLoading, hydrateFromStorage } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  useEffect(() => {
    if (isLoading) return;
    if (token) {
      router.replace("/dashboard");
    } else {
      router.replace("/login");
    }
  }, [token, isLoading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
      <div className="w-10 h-10 border-3 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );
}

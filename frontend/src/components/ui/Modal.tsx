"use client";

import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = "max-w-lg",
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startW: rect.width, startH: rect.height };
    setSize({ width: rect.width, height: rect.height });
    document.body.style.cursor = "se-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const w = Math.min(Math.max(320, d.startW + (ev.clientX - d.startX)), window.innerWidth - 32);
      const h = Math.min(Math.max(240, d.startH + (ev.clientY - d.startY)), window.innerHeight - 32);
      setSize({ width: w, height: h });
    };
    const onUp = () => {
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className={`relative bg-white rounded-2xl shadow-2xl shadow-slate-300/50 ${maxWidth} w-full mx-4 max-h-[90vh] overflow-y-auto animate-slide-in`}
        style={size ? { width: size.width, height: size.height, maxWidth: "none" } : undefined}
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-200/60">
          <h3 className="text-lg font-bold text-slate-800">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-5">{children}</div>
        <div
          onPointerDown={startResize}
          title="Resize"
          className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize flex items-center justify-center text-slate-300 hover:text-indigo-500"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 3v6" />
            <path d="M21 21h-6" />
            <path d="M21 9L9 21" />
          </svg>
        </div>
      </div>
    </div>
  );
}

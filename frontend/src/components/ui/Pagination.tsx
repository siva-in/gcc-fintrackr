"use client";

import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";
import { useState, useEffect } from "react";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, totalPages, total, limit, onPageChange }: PaginationProps) {
  const [inputVal, setInputVal] = useState(String(page));

  useEffect(() => { setInputVal(String(page)); }, [page]);

  if (totalPages <= 1) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  const commitPage = () => {
    const val = parseInt(inputVal);
    if (!isNaN(val)) {
      const p = Math.max(1, Math.min(val, totalPages));
      setInputVal(String(p));
      if (p !== page) onPageChange(p);
    } else {
      setInputVal(String(page));
    }
  };

  const goTo = (val: number) => {
    const p = Math.max(1, Math.min(val, totalPages));
    setInputVal(String(p));
    if (p !== page) onPageChange(p);
  };

  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-200/60 bg-slate-50/50">
      <p className="text-sm text-slate-400">
        Showing {from} to {to} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => goTo(1)}
          disabled={page === 1}
          className="px-2.5 py-1.5 text-sm rounded-lg font-medium transition-all bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronsLeft size={16} />
        </button>
        <button
          onClick={() => goTo(page - 1)}
          disabled={page === 1}
          className="px-2.5 py-1.5 text-sm rounded-lg font-medium transition-all bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-1 mx-1">
          <span className="text-sm text-slate-500">Page</span>
          <input
            type="text"
            inputMode="numeric"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onBlur={commitPage}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitPage();
            }}
            className="w-14 px-2 py-1 text-sm text-center bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
          <span className="text-sm text-slate-500">of {totalPages}</span>
        </div>
        <button
          onClick={() => goTo(page + 1)}
          disabled={page === totalPages}
          className="px-2.5 py-1.5 text-sm rounded-lg font-medium transition-all bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight size={16} />
        </button>
        <button
          onClick={() => goTo(totalPages)}
          disabled={page === totalPages}
          className="px-2.5 py-1.5 text-sm rounded-lg font-medium transition-all bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronsRight size={16} />
        </button>
      </div>
    </div>
  );
}

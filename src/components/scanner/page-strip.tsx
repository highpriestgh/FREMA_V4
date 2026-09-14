"use client";

import { ScanPage } from "./use-scanner";
import { Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PageStripProps {
  pages: ScanPage[];
  onRemove: (id: string) => void;
  onReorder: (from: number, to: number) => void;
}

export function PageStrip({ pages, onRemove, onReorder }: PageStripProps) {
  if (pages.length === 0) return null;

  return (
    <div className="w-full border-t border-slate-700 bg-slate-900 pt-3 pb-2 px-3">
      <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider">
        Captured Pages ({pages.length})
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {pages.map((page, index) => (
          <div
            key={page.id}
            className="relative flex-shrink-0 group"
          >
            {/* Page thumbnail */}
            <div className="relative w-16 h-20 rounded border-2 border-slate-600 overflow-hidden bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={page.dataUrl}
                alt={`Page ${index + 1}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/50 transition-opacity">
                <Button
                  variant="destructive"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onRemove(page.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {/* Page number badge */}
            <span className="absolute -top-1.5 -left-1.5 bg-blue-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {index + 1}
            </span>
            {/* Reorder arrows */}
            {pages.length > 1 && (
              <div className="flex justify-between mt-1 gap-0.5">
                <button
                  className="text-slate-500 hover:text-white disabled:opacity-20"
                  disabled={index === 0}
                  onClick={() => onReorder(index, index - 1)}
                  title="Move left"
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <button
                  className="text-slate-500 hover:text-white disabled:opacity-20"
                  disabled={index === pages.length - 1}
                  onClick={() => onReorder(index, index + 1)}
                  title="Move right"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

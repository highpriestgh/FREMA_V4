"use client";

import { useEffect, useCallback } from "react";
import {
  Camera,
  CameraOff,
  CircleDot,
  FileOutput,
  Loader2,
  ScanLine,
  X,
  ZapOff,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useScanner } from "./use-scanner";
import { PageStrip } from "./page-strip";
import { buildPdfFromPages } from "@/lib/scanner-pdf";

interface ScannerModalProps {
  onComplete: (file: File) => void;
  onClose: () => void;
}

export function ScannerModal({ onComplete, onClose }: ScannerModalProps) {
  const {
    videoRef,
    canvasRef,
    cameraReady,
    cameraError,
    cvReady,
    isCapturing,
    pages,
    startCamera,
    stopCamera,
    capturePage,
    removePage,
    reorderPage,
    clearPages,
  } = useScanner();

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  // Keyboard shortcut: Space = capture, Escape = close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space" && cameraReady) {
        e.preventDefault();
        capturePage();
      }
      if (e.code === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cameraReady, capturePage, onClose]);

  const handleFinish = useCallback(async () => {
    if (pages.length === 0) return;
    const file = await buildPdfFromPages(pages);
    onComplete(file);
    onClose();
  }, [pages, onComplete, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-blue-400" />
          <span className="font-semibold text-sm">Document Scanner</span>
          {cvReady ? (
            <Badge variant="outline" className="text-emerald-400 border-emerald-700 text-[10px] py-0">
              <Zap className="h-2.5 w-2.5 mr-1" /> OpenCV Active
            </Badge>
          ) : (
            <Badge variant="outline" className="text-slate-500 border-slate-700 text-[10px] py-0">
              <ZapOff className="h-2.5 w-2.5 mr-1" /> Loading OpenCV…
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 hidden sm:block">Press <kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px]">Space</kbd> to capture</span>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-slate-400 hover:text-white">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Camera area */}
      <div className="flex-1 relative overflow-hidden bg-black flex items-center justify-center">
        {/* Scanner overlay guides */}
        {cameraReady && (
          <>
            {/* Corner guides */}
            <div className="absolute inset-[10%] pointer-events-none z-10">
              {/* Top-left */}
              <div className="absolute top-0 left-0 w-10 h-10 border-t-2 border-l-2 border-blue-400 rounded-tl" />
              {/* Top-right */}
              <div className="absolute top-0 right-0 w-10 h-10 border-t-2 border-r-2 border-blue-400 rounded-tr" />
              {/* Bottom-left */}
              <div className="absolute bottom-0 left-0 w-10 h-10 border-b-2 border-l-2 border-blue-400 rounded-bl" />
              {/* Bottom-right */}
              <div className="absolute bottom-0 right-0 w-10 h-10 border-b-2 border-r-2 border-blue-400 rounded-br" />
              {/* Scanning animation line */}
              <div className="absolute inset-x-0 top-0 h-0.5 bg-blue-400/60 animate-scan-line" />
            </div>
          </>
        )}

        {/* Video feed */}
        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full h-full object-contain"
          style={{ display: cameraReady ? "block" : "none" }}
        />

        {/* Flash effect on capture */}
        {isCapturing && (
          <div className="absolute inset-0 bg-white/70 animate-flash pointer-events-none z-20" />
        )}

        {/* Error state */}
        {cameraError && (
          <div className="flex flex-col items-center gap-3 text-center p-8">
            <CameraOff className="h-12 w-12 text-red-400" />
            <div>
              <p className="font-semibold text-red-400">Camera Error</p>
              <p className="text-sm text-slate-400 mt-1">{cameraError}</p>
            </div>
            <Button onClick={startCamera} variant="outline" size="sm" className="mt-2">
              <Camera className="h-4 w-4 mr-1" /> Retry
            </Button>
          </div>
        )}

        {/* Loading state */}
        {!cameraReady && !cameraError && (
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="h-10 w-10 animate-spin text-blue-400" />
            <p className="text-sm">Starting camera…</p>
          </div>
        )}

        {/* Hidden canvas used for frame capture + processing */}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Page strip (multi-page thumbnails) */}
      <PageStrip pages={pages} onRemove={removePage} onReorder={reorderPage} />

      {/* Bottom controls */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800 bg-slate-900 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={clearPages}
          disabled={pages.length === 0}
          className="text-slate-400 hover:text-red-400"
        >
          Clear all
        </Button>

        {/* Shutter button */}
        <button
          onClick={capturePage}
          disabled={!cameraReady || isCapturing}
          className="relative h-16 w-16 rounded-full bg-white hover:bg-slate-100 transition-all active:scale-95 disabled:opacity-40 shadow-xl flex items-center justify-center"
          title="Capture page"
        >
          <CircleDot className="h-8 w-8 text-slate-800" />
          {isCapturing && (
            <div className="absolute inset-0 rounded-full border-4 border-blue-400 animate-ping" />
          )}
        </button>

        <Button
          onClick={handleFinish}
          disabled={pages.length === 0}
          size="sm"
          className="bg-blue-600 hover:bg-blue-700"
        >
          <FileOutput className="h-4 w-4 mr-1.5" />
          Done ({pages.length})
        </Button>
      </div>
    </div>
  );
}

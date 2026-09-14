"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ScanPage = {
  id: string;
  dataUrl: string; // processed (grayscale/enhanced) image
  rawDataUrl: string; // original capture
};

export function useScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [cvReady, setCvReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  // Load OpenCV.js lazily from CDN
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).cv) {
      setCvReady(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.9.0/opencv.js";
    script.async = true;
    script.onload = () => {
      (window as any).cv["onRuntimeInitialized"] = () => setCvReady(true);
      // Some builds fire synchronously
      if ((window as any).cv && (window as any).cv.Mat) setCvReady(true);
    };
    script.onerror = () => console.warn("OpenCV failed to load – falling back to plain capture");
    document.head.appendChild(script);
    return () => {
      try { document.head.removeChild(script); } catch {}
    };
  }, []);

  // Start camera
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }
    } catch (err: any) {
      setCameraError(err?.message ?? "Could not access camera");
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  // Apply document-scan enhancement using OpenCV (grayscale + adaptive threshold)
  function applyDocumentFilter(ctx: CanvasRenderingContext2D, w: number, h: number): string {
    const cv = (window as any).cv;
    if (!cv || !cv.Mat) {
      // Fallback: just apply CSS-style grayscale via pixel manipulation
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const enhanced = Math.min(255, gray * 1.3 + 20); // brighten slightly
        data[i] = data[i + 1] = data[i + 2] = enhanced;
      }
      ctx.putImageData(imageData, 0, 0);
      return canvasRef.current!.toDataURL("image/jpeg", 0.95);
    }

    // OpenCV processing
    try {
      const src = cv.imread(canvasRef.current!);
      const gray = new cv.Mat();
      const enhanced = new cv.Mat();

      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      // Adaptive thresholding — makes text crisp like a real scanner
      cv.adaptiveThreshold(gray, enhanced, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 21, 10);
      cv.imshow(canvasRef.current!, enhanced);

      const result = canvasRef.current!.toDataURL("image/jpeg", 0.95);

      src.delete(); gray.delete(); enhanced.delete();
      return result;
    } catch {
      return canvasRef.current!.toDataURL("image/jpeg", 0.95);
    }
  }

  // Capture current video frame
  const capturePage = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !cameraReady) return;
    setIsCapturing(true);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0, w, h);

    const rawDataUrl = canvas.toDataURL("image/jpeg", 0.95);
    const processedDataUrl = applyDocumentFilter(ctx, w, h);

    setPages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        dataUrl: processedDataUrl,
        rawDataUrl,
      },
    ]);

    setTimeout(() => setIsCapturing(false), 300);
  }, [cameraReady, cvReady]);

  const removePage = useCallback((id: string) => {
    setPages((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const reorderPage = useCallback((fromIndex: number, toIndex: number) => {
    setPages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const clearPages = useCallback(() => setPages([]), []);

  return {
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
  };
}

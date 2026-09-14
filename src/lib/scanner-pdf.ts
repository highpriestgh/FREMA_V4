import { jsPDF } from "jspdf";
import type { ScanPage } from "@/components/scanner/use-scanner";

/**
 * Takes an array of scanned pages (as dataURLs) and combines them
 * into a single multi-page PDF File object.
 */
export async function buildPdfFromPages(pages: ScanPage[]): Promise<File> {
  if (pages.length === 0) throw new Error("No pages to build PDF from");

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const A4_W = 210;
  const A4_H = 297;

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage();

    const img = await loadImage(pages[i].dataUrl);
    const { width: imgW, height: imgH } = img;

    // Fit image to A4 maintaining aspect ratio
    const ratio = Math.min(A4_W / imgW, A4_H / imgH);
    const drawW = imgW * ratio;
    const drawH = imgH * ratio;
    const offsetX = (A4_W - drawW) / 2;
    const offsetY = (A4_H - drawH) / 2;

    pdf.addImage(pages[i].dataUrl, "JPEG", offsetX, offsetY, drawW, drawH);
  }

  const blob = pdf.output("blob");
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  return new File([blob], `scan-${timestamp}.pdf`, { type: "application/pdf" });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

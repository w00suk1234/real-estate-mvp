import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { API_BASE_URL } from "../api";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForImages(element) {
  const images = Array.from(element.querySelectorAll("img"));

  await Promise.all(
    images.map(
      (image) =>
        new Promise((resolve) => {
          if (image.complete) {
            resolve();
            return;
          }
          image.onload = () => resolve();
          image.onerror = () => resolve();
        }),
    ),
  );
}

function isRemoteUrl(src) {
  return /^https?:\/\//i.test(String(src || ""));
}

function toAbsoluteUrl(src) {
  if (!src) return "";
  if (isRemoteUrl(src)) return src;
  return `${window.location.origin}${src.startsWith("/") ? src : `/${src}`}`;
}

function buildProxyUrl(src) {
  const absolute = toAbsoluteUrl(src);
  const base = API_BASE_URL || "";
  return `${base}/proxy/image?url=${encodeURIComponent(absolute)}`;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function fetchImageAsDataUrl(src) {
  if (!src) return "";

  const requestUrl = isRemoteUrl(src) || src.startsWith("/") ? buildProxyUrl(src) : buildProxyUrl(`/${src}`);

  try {
    const response = await fetch(requestUrl, {
      credentials: "omit",
      cache: "force-cache",
    });

    if (!response.ok) {
      return "";
    }

    const blob = await response.blob();
    return blobToDataUrl(blob);
  } catch (error) {
    console.error(error);
    return "";
  }
}

export async function preparePdfAssets({ mainImageSrc, extraImageSources = [] }) {
  const [mainImageDataUrl, ...extraImageDataUrls] = await Promise.all([
    fetchImageAsDataUrl(mainImageSrc),
    ...extraImageSources.slice(0, 4).map((src) => fetchImageAsDataUrl(src)),
  ]);

  return {
    mainImageSrc: mainImageDataUrl || "",
    extraImageSources: extraImageDataUrls.filter(Boolean),
  };
}

export async function downloadElementAsPdf(element, filename) {
  if (!element) {
    throw new Error("PDF로 만들 대상을 찾지 못했습니다.");
  }

  await waitForImages(element);
  await wait(120);

  const canvas = await html2canvas(element, {
    scale: 2.4,
    backgroundColor: "#ffffff",
    useCORS: true,
    allowTaint: false,
    imageTimeout: 20000,
    logging: false,
    windowWidth: element.scrollWidth,
  });

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;
  const contentHeight = pageHeight - margin * 2;
  const pageHeightPx = Math.floor((canvas.width * contentHeight) / contentWidth);

  let renderedHeight = 0;
  let pageIndex = 0;

  while (renderedHeight < canvas.height) {
    const sliceHeight = Math.min(pageHeightPx, canvas.height - renderedHeight);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeight;

    const pageContext = pageCanvas.getContext("2d");
    pageContext.drawImage(
      canvas,
      0,
      renderedHeight,
      canvas.width,
      sliceHeight,
      0,
      0,
      canvas.width,
      sliceHeight,
    );

    const imageData = pageCanvas.toDataURL("image/jpeg", 0.95);
    const renderedHeightMm = (sliceHeight * contentWidth) / canvas.width;

    if (pageIndex > 0) {
      pdf.addPage();
    }

    pdf.addImage(
      imageData,
      "JPEG",
      margin,
      margin,
      contentWidth,
      renderedHeightMm,
      undefined,
      "FAST",
    );

    renderedHeight += sliceHeight;
    pageIndex += 1;
  }

  pdf.save(filename);
}

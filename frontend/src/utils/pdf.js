import html2canvas from "html2canvas";
import jsPDF from "jspdf";

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

export async function downloadElementAsPdf(element, filename) {
  if (!element) {
    throw new Error("PDF로 만들 대상을 찾지 못했습니다.");
  }

  await waitForImages(element);

  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
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

    pdf.addImage(imageData, "JPEG", margin, margin, contentWidth, renderedHeightMm, undefined, "FAST");

    renderedHeight += sliceHeight;
    pageIndex += 1;
  }

  pdf.save(filename);
}

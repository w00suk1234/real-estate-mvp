export const IMAGE_UPLOAD_LIMITS = {
  maxOriginalBytes: 5 * 1024 * 1024,
  maxExtraImages: 10,
  maxCompressedBytes: 1024 * 1024,
  maxSide: 1200,
  initialQuality: 0.82,
  retryQuality: 0.72,
  outputType: "image/webp",
  outputExtension: "webp",
  allowedTypes: ["image/jpeg", "image/png", "image/webp"],
};

export function formatBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)}${units[unitIndex]}`;
}

export function isHttpImageUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

export function validateImageFile(file, options = {}) {
  const limits = { ...IMAGE_UPLOAD_LIMITS, ...options };

  if (!file) {
    throw new Error("이미지 파일을 선택해 주세요.");
  }

  if (!limits.allowedTypes.includes(file.type)) {
    throw new Error("jpg, png, webp 형식의 이미지만 등록할 수 있습니다.");
  }

  if (file.size > limits.maxOriginalBytes) {
    throw new Error(`원본 이미지는 1장당 ${formatBytes(limits.maxOriginalBytes)} 이하만 등록할 수 있습니다.`);
  }

  return true;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("이미지를 읽지 못했습니다."));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("이미지를 압축하지 못했습니다."));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

function buildCompressedFileName(name = "property-image", extension = IMAGE_UPLOAD_LIMITS.outputExtension) {
  const base = name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

  return `${base || "property-image"}.${extension}`;
}

export async function resizeImageFile(file, options = {}) {
  const limits = { ...IMAGE_UPLOAD_LIMITS, ...options };
  validateImageFile(file, limits);

  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const longSide = Math.max(sourceWidth, sourceHeight);
  const ratio = longSide > limits.maxSide ? limits.maxSide / longSide : 1;
  const targetWidth = Math.max(1, Math.round(sourceWidth * ratio));
  const targetHeight = Math.max(1, Math.round(sourceHeight * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  let blob = await canvasToBlob(canvas, limits.outputType, limits.initialQuality);

  if (blob.size > limits.maxCompressedBytes) {
    blob = await canvasToBlob(canvas, limits.outputType, limits.retryQuality);
  }

  return new File([blob], buildCompressedFileName(file.name, limits.outputExtension), {
    type: limits.outputType,
    lastModified: Date.now(),
  });
}


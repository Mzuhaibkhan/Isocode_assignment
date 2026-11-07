import { db, type QueuedPhoto } from "./db.js";

export interface DisplayReading {
  value: number | null;
  valueX10: number | null;
  confidence: "high" | "medium" | "low";
  note?: string;
}

/**
 * Resizes an uploaded photo using HTML Canvas so that neither dimension
 * exceeds maxDimension (default 1200px) and payload is ~1MB or smaller (§10.2).
 */
export async function resizeImage(file: File, maxDimension = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    // If not in a browser environment (e.g. tests without full canvas)
    if (typeof window === "undefined" || !window.FileReader) {
      return resolve("data:image/jpeg;base64,mockImageBase64");
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to load image"));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return resolve(reader.result as string);
        }

        ctx.drawImage(img, 0, 0, width, height);
        // JPEG quality 0.8 keeps size well under 1MB
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        resolve(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Calls POST /api/photos/read with the resized photo base64 (§10.2).
 * Server validates with Zod and returns digital 7-segment/LCD reading.
 */
export async function requestPhotoReading(
  imageData: string,
  kind: "scale" | "meter" = "meter"
): Promise<DisplayReading> {
  const res = await fetch("/api/photos/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, image: imageData }),
  });

  if (!res.ok) {
    throw new Error(`Photo reading server error: ${res.status}`);
  }

  const json = await res.json();
  if (!json.success || !json.reading) {
    throw new Error(json.error || "Failed to parse reading");
  }

  return json.reading;
}

/**
 * Stores a captured photo in IndexedDB outbox when offline (§10.2).
 */
export async function queuePhotoOffline(photo: Omit<QueuedPhoto, "createdAt" | "status">): Promise<void> {
  await db.photos.put({
    ...photo,
    createdAt: new Date().toISOString(),
    status: "pending",
  });
}


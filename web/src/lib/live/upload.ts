import { LIVE_LIMITS, type SharedFile } from "@shared/live";

export const UPLOAD_ACCEPT = "image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.rtf,.zip";

const ALLOWED_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|heic|svg|pdf|docx?|pptx?|xlsx?|txt|csv|rtf|md|zip)$/i;

/** Client-side pre-check. Returns a readable problem, or null when the file looks fine (the server has the final say). */
export function checkUpload(file: File): string | null {
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > LIVE_LIMITS.fileMaxBytes) {
    return `"${file.name}" is ${formatBytes(file.size)} — the limit is ${formatBytes(LIVE_LIMITS.fileMaxBytes)}.`;
  }
  if (!file.type.startsWith("image/") && !ALLOWED_EXT.test(file.name)) {
    return `"${file.name}" isn't a supported type. Share images, PDF, Word, PowerPoint, Excel, text or ZIP files.`;
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

/** GET /room/:room/file/:id?t=<ticket> on the room Worker. */
export function fileUrl(httpBase: string, room: string, fileId: string, ticket: string): string {
  return `${httpBase.replace(/\/+$/, "")}/room/${encodeURIComponent(room)}/file/${encodeURIComponent(fileId)}?t=${encodeURIComponent(ticket)}`;
}

/** POST /room/:room/upload?name=<filename> with the host ticket as bearer. XHR for upload progress. */
export function uploadFile(
  httpBase: string,
  room: string,
  ticket: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<SharedFile | null> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${httpBase.replace(/\/+$/, "")}/room/${encodeURIComponent(room)}/upload?name=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader("Authorization", `Bearer ${ticket}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as SharedFile);
        } catch {
          resolve(null);
        }
        return;
      }
      let message = "";
      try {
        const body = JSON.parse(xhr.responseText) as { message?: unknown; error?: unknown };
        message = typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : "";
      } catch {
        /* not JSON */
      }
      reject(new Error(message || (xhr.status === 413 ? "The file is too large." : `Upload failed (${xhr.status}).`)));
    };
    xhr.onerror = () => reject(new Error("Network error while uploading. Check your connection and try again."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.send(file);
  });
}

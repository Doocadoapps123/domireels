// In the browser: a photo made ready for storage (a JPEG; a re-encoded one is at most 4096 px on its long side), its SHA-1, and the
// upload itself, straight to the signed url the server handed out.
const MAX_SIDE = 4096, KEEP_UNDER = 15 * 1024 * 1024;

export async function prepare(file) {
  const jpeg = file.type === "image/jpeg" || (!file.type && /\.jpe?g$/i.test(file.name));
  // A JPEG keeps its own bytes (and its own SHA-1); anything else, or a huge file, becomes a JPEG.
  const blob = !jpeg || file.size > KEEP_UNDER ? await reencode(file) : file;
  const hash = await crypto.subtle.digest("SHA-1", await blob.arrayBuffer());
  const sha1 = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { blob, sha1 };
}

async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch {}
  }
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This photo's format is not supported. Try a JPEG or PNG."));
    img.src = URL.createObjectURL(file);
  });
}

async function reencode(file) {
  const img = await decode(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  img.close?.();
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.92));
  if (!blob) throw new Error("Could not read this photo.");
  return blob;
}

async function post(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Upload failed.");
  return j;
}

// kind "library" or "dish". Returns what /api/app/uploads/done answered ({ photo } | { dish } | { exists }).
export async function uploadPhoto(file, { restaurantId, kind, dishId }) {
  const { blob, sha1 } = await prepare(file);
  const ticket = await post("/api/app/uploads", { restaurant_id: restaurantId, kind, sha1, dish_id: dishId });
  if (ticket.exists) return { exists: true };
  const put = await fetch(ticket.url, { method: "PUT", headers: { "Content-Type": "image/jpeg", "x-upsert": "true" }, body: blob });
  if (!put.ok) throw new Error("The photo did not upload. Check your connection and try again.");
  return post("/api/app/uploads/done", { restaurant_id: restaurantId, kind, sha1, dish_id: dishId, path: ticket.path });
}

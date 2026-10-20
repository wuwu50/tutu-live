import fs from "node:fs";
import { pathToFileURL } from "node:url";
export const validId = (id) => /^[A-Za-z0-9_-]{11}$/.test(id || "");
export function collectVideos(value, videos = new Map()) {
  if (!value || typeof value !== "object") return videos;
  const old = value.playlistVideoRenderer,
    modern = value.lockupViewModel;
  const id = old?.videoId || modern?.contentId;
  const title = old
    ? (old.title?.runs || []).map((x) => x.text || "").join("") ||
      old.title?.simpleText
    : modern?.metadata?.lockupMetadataViewModel?.title?.content;
  if (validId(id) && typeof title === "string" && title)
    videos.set(id, { title });
  for (const child of Object.values(value))
    if (child && typeof child === "object") collectVideos(child, videos);
  return videos;
}
export function extractDate(html) {
  const raw =
    html.match(/"publishDate"\s*:\s*"([^"]+)"/)?.[1] ||
    html.match(/itemprop="datePublished"\s+content="([^"]+)"/)?.[1] ||
    html.match(/"uploadDate"\s*:\s*"([^"]+)"/)?.[1];
  return raw &&
    /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(raw) &&
    !Number.isNaN(Date.parse(raw))
    ? raw
    : null;
}
export function mergeMetadata(previous, incoming) {
  const result = {};
  for (const source of [previous, incoming]) {
    if (!source || typeof source !== "object" || Array.isArray(source))
      continue;
    for (const [id, raw] of Object.entries(source)) {
      if (!validId(id)) continue;
      const value = typeof raw === "string" ? { title: raw } : raw;
      if (!value || typeof value !== "object") continue;
      const old = result[id] || {};
      const title =
        typeof value.title === "string" && value.title.trim()
          ? value.title
          : old.title;
      if (!title) continue;
      const date =
        typeof value.publishedAt === "string" &&
        /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value.publishedAt) &&
        !Number.isNaN(Date.parse(value.publishedAt))
          ? value.publishedAt
          : old.publishedAt || null;
      result[id] = { title, publishedAt: date };
    }
  }
  return result;
}
export async function readPublicationDate(id, request = fetch) {
  if (!validId(id)) throw Error("Invalid video ID");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await request(
        "https://www.youtube.com/watch?v=" + id + (attempt ? "&hl=en" : ""),
        { signal: AbortSignal.timeout(15000) },
      );
      if (!response.ok) continue;
      const date = extractDate(await response.text());
      if (date) return date;
    } catch {}
  }
  return null;
}
export async function updateTitles() {
  const target = "web/live/titles.json";
  let previous = {};
  try {
    previous = JSON.parse(fs.readFileSync(target, "utf8"));
  } catch {}
  try {
    const published = await fetch(
      "https://wuwu50.github.io/tutu-live/titles.json",
      { signal: AbortSignal.timeout(10000), cache: "no-store" },
    );
    if (published.ok)
      previous = mergeMetadata(previous, await published.json());
  } catch {
    console.warn("Published metadata unavailable; keeping repository cache");
  }
  previous = mergeMetadata({}, previous);
  fs.writeFileSync(target, JSON.stringify(previous, null, 2) + "\n");
  const response = await fetch(
    "https://www.youtube.com/playlist?list=PLNy9F-I7PWD0",
    { signal: AbortSignal.timeout(20000) },
  );
  if (!response.ok) throw Error("YouTube HTTP " + response.status);
  const text = await response.text(),
    match = text.match(/var ytInitialData = (.*?);<\/script>/);
  if (!match) throw Error("YouTube metadata unavailable");
  const videos = collectVideos(JSON.parse(match[1]));
  if (!videos.size)
    throw Error("No playlist metadata returned; keeping last good cache");
  const entries = [...videos];
  let next = 0;
  const result = {};
  async function worker() {
    while (next < entries.length) {
      const [id, info] = entries[next++],
        old = previous[id];
      const saved = typeof old === "string" ? { title: old } : old || {};
      try {
        const publishedAt = await readPublicationDate(id);
        result[id] = {
          ...info,
          publishedAt: publishedAt || saved.publishedAt || null,
        };
      } catch {
        result[id] = { ...info, publishedAt: saved.publishedAt || null };
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(4, entries.length) }, worker),
  );
  fs.writeFileSync(
    target,
    JSON.stringify(
      Object.fromEntries(entries.map(([id]) => [id, result[id]])),
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Updated " +
      entries.length +
      " video titles and " +
      Object.values(result).filter((x) => x.publishedAt).length +
      " publication dates",
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await updateTitles();
  } catch (error) {
    console.warn("Title cache refresh skipped: " + error.message);
  }
}

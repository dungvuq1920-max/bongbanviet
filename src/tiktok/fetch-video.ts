import { getEnv } from "../common/env.js";
import type { VideoData } from "../common/validators.js";
import { validateVideoData } from "../common/validators.js";

export async function fetchVideo(input: { sourceUrl?: string; sourceId?: string }): Promise<VideoData> {
  const apiUrl = input.sourceUrl || getEnv("SOURCE_VIDEO_API_URL");
  if (!apiUrl) throw new Error("Missing sourceUrl or SOURCE_VIDEO_API_URL");

  const url = new URL(apiUrl);
  if (input.sourceId) url.searchParams.set("source_id", input.sourceId);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Video source HTTP ${response.status}: ${await response.text()}`);
  const raw = await response.json() as Partial<VideoData>;

  const normalized: VideoData = {
    video_url: String(raw.video_url || ""),
    title: String(raw.title || ""),
    product_name: raw.product_name,
    description: raw.description,
    hashtags: raw.hashtags || [],
    source_id: String(raw.source_id || input.sourceId || "")
  };

  const validation = validateVideoData(normalized);
  if (!validation.ok) throw new Error(`Invalid video data: ${validation.errors.join(", ")}`);
  return normalized;
}


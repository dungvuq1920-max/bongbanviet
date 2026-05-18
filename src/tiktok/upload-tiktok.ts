import { requireEnv } from "../common/env.js";
import { retry } from "../common/retry.js";

export type TikTokUploadInput = {
  videoUrl: string;
  caption: string;
};

export async function uploadTikTok(input: TikTokUploadInput): Promise<{ publishId: string }> {
  const accessToken = requireEnv("TIKTOK_ACCESS_TOKEN");
  requireEnv("TIKTOK_CLIENT_KEY");
  requireEnv("TIKTOK_CLIENT_SECRET");

  // TODO: Implement the full TikTok Content Posting API flow:
  // 1. INIT upload with post_info/source_info.
  // 2. Upload binary bytes to upload_url.
  // 3. Poll publish status if required.
  // Official docs: TikTok Content Posting API.
  return retry(async () => {
    const response = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify({
        post_info: {
          title: input.caption,
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: input.videoUrl
        }
      })
    });
    const json = await response.json() as { data?: { publish_id?: string }; error?: { message?: string } };
    if (!response.ok) throw new Error(json.error?.message || `TikTok HTTP ${response.status}`);
    return { publishId: json.data?.publish_id || "" };
  });
}


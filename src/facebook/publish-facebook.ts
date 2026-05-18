import { getEnv, requireEnv } from "../common/env.js";
import { retry } from "../common/retry.js";

export type FacebookPublishInput = {
  message: string;
  imageUrl?: string;
  scheduledUnixTime?: number;
};

export async function publishFacebook(input: FacebookPublishInput): Promise<{ id: string }> {
  const pageId = requireEnv("FACEBOOK_PAGE_ID");
  const token = requireEnv("FACEBOOK_PAGE_ACCESS_TOKEN");
  const graphVersion = getEnv("FACEBOOK_GRAPH_VERSION", "v19.0");
  const endpoint = input.imageUrl
    ? `https://graph.facebook.com/${graphVersion}/${pageId}/photos`
    : `https://graph.facebook.com/${graphVersion}/${pageId}/feed`;

  const body: Record<string, string | number | boolean> = {
    message: input.message,
    access_token: token
  };

  if (input.imageUrl) body.url = input.imageUrl;
  if (input.scheduledUnixTime) {
    body.published = false;
    body.scheduled_publish_time = input.scheduledUnixTime;
  }

  return retry(async () => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const json = await response.json() as { id?: string; post_id?: string; error?: { message?: string } };
    if (!response.ok) throw new Error(json.error?.message || `Meta Graph HTTP ${response.status}`);
    return { id: json.post_id || json.id || "" };
  });
}


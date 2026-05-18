import { getEnv, requireEnv } from "../common/env.js";
import { retry } from "../common/retry.js";

export type FacebookPublishInput = {
  message: string;
  imageUrl?: string;
  scheduledUnixTime?: number;
};

export type FacebookPublishResult = {
  id: string;
  post_id?: string;
};

export async function publishFacebook(input: FacebookPublishInput): Promise<FacebookPublishResult> {
  const pageId = requireEnv("FACEBOOK_PAGE_ID");
  const token = requireEnv("FACEBOOK_PAGE_ACCESS_TOKEN");
  const graphVersion = getEnv("FACEBOOK_GRAPH_VERSION", "v19.0");

  const hasImage = Boolean(input.imageUrl);
  const endpoint = hasImage
    ? `https://graph.facebook.com/${graphVersion}/${pageId}/photos`
    : `https://graph.facebook.com/${graphVersion}/${pageId}/feed`;

  const body: Record<string, string | number | boolean> = {
    message: input.message,
    access_token: token
  };

  if (hasImage) body.url = input.imageUrl!;

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

    const json = await response.json() as {
      id?: string;
      post_id?: string;
      error?: { message?: string; code?: number; type?: string };
    };

    if (!response.ok || json.error) {
      const msg = json.error?.message || `Meta Graph HTTP ${response.status}`;
      throw new Error(msg);
    }

    return { id: json.post_id || json.id || "", post_id: json.post_id };
  }, {
    attempts: 3,
    shouldRetry: (error) => {
      const msg = String((error as Error).message);
      // Do not retry permanent auth/permission errors
      return !msg.includes("OAuthException") && !msg.includes("190");
    }
  });
}

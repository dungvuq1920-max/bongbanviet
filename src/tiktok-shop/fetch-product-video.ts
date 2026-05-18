import { fetchProductInfo } from "../shopee/fetch-product-info.js";
import { fetchVideo } from "../tiktok/fetch-video.js";

export async function fetchProductVideo(input: { productSourceUrl?: string; videoSourceUrl?: string; sourceId?: string }) {
  const [product, video] = await Promise.all([
    fetchProductInfo({ sourceUrl: input.productSourceUrl }),
    fetchVideo({ sourceUrl: input.videoSourceUrl, sourceId: input.sourceId })
  ]);
  return { product, video };
}


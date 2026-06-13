import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../../lib/supabase";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    await supabase.from("scrape_progress").upsert({
      id: 1,
      in_progress: true,
      pages_scraped: 0,
      total_pages: 1116,
      enriched: 0,
      to_enrich: 0,
      started_at: new Date().toISOString(),
      completed_at: null,
      last_refreshed: null,
    });

    return res.json({
      ok: true,
      message: "Scraping dimulai. Panggil /api/lumajang/scrape-chunk secara berurutan.",
      totalPages: 1116,
      chunkSize: 100,
      totalChunks: Math.ceil(1116 / 100),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Gagal memulai scraping" });
  }
}

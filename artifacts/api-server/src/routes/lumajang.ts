import { Router } from "express";
import type { Request, Response } from "express";
import { logger } from "../lib/logger";

const router = Router();

const SIKUMBANG_BASE = "https://sikumbang.tapera.go.id";
const LUMAJANG_KODE = "3508";
const CACHE_TTL_MS = 10 * 60 * 1000;
const CONCURRENT_PAGES = 30;
const ENRICH_CONCURRENCY = 5;

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

interface ScrapingState {
  inProgress: boolean;
  pagesScraped: number;
  totalPages: number;
  enriching: boolean;
  enriched: number;
  toEnrich: number;
}

interface SalesSnapshot {
  month: string;
  recordedAt: string;
  developerSales: Record<string, { namaDeveloper: string; asosiasi: string; totalUnit: number; jumlahLokasi: number }>;
  kecamatanSales: Record<string, number>;
}

let kecamatanCache: CacheEntry<KecamatanRaw[]> | null = null;
let listingsCache: CacheEntry<ListingItem[]> | null = null;
let lastRefreshAt: string | null = null;
let scraping: ScrapingState = { inProgress: false, pagesScraped: 0, totalPages: 0, enriching: false, enriched: 0, toEnrich: 0 };
let scrapePromise: Promise<ListingItem[]> | null = null;
let salesSnapshots: SalesSnapshot[] = [];

interface KecamatanRaw {
  kodeWilayah: string;
  namaWilayah: string;
  provinsi: string;
  kabupaten: string;
  kecamatan: string;
  peminatan: number;
  pilihan: number;
  supply: number;
}

interface SikumbangListing {
  idLokasi: string;
  namaPerumahan: string;
  jenisPerumahan: string;
  jumlahUnit: string;
  jumlahUnitKomersil: string;
  foto: string[];
  wilayah: {
    kodeWilayah: string;
    namaWilayah: string;
    provinsi: string;
    kabupaten: string;
    kecamatan: string;
    kelurahan: string | null;
    kbsni: string | null;
  };
  pengembang: {
    nama: string;
    asosiasi: string;
  };
}

interface ListingItem {
  idLokasi: string;
  namaPerumahan: string;
  jenisPerumahan: string;
  kecamatan: string;
  kelurahan: string | null;
  namaDeveloper: string;
  asosiasi: string;
  jumlahUnit: string | null;
  foto: string[];
}

function mapListing(l: SikumbangListing): ListingItem {
  return {
    idLokasi: l.idLokasi,
    namaPerumahan: l.namaPerumahan,
    jenisPerumahan: l.jenisPerumahan,
    kecamatan: l.wilayah?.kecamatan ?? "",
    kelurahan: l.wilayah?.kelurahan ?? null,
    namaDeveloper: l.pengembang?.nama ?? "",
    asosiasi: l.pengembang?.asosiasi ?? "",
    jumlahUnit: (l.jumlahUnit && l.jumlahUnit !== "0" && l.jumlahUnit !== "" && l.jumlahUnit !== "...") ? l.jumlahUnit : null,
    foto: (l.foto ?? [])
      .filter((f) => f && typeof f === "string" && f.trim() !== "")
      .map((f) => f.startsWith("http") ? f : `${SIKUMBANG_BASE}${f}`),
  };
}

function isLumajang(l: SikumbangListing): boolean {
  return (
    l.wilayah?.kabupaten === "KAB LUMAJANG" ||
    l.idLokasi?.startsWith("LMJ")
  );
}

async function fetchPage(page: number): Promise<{ listings: ListingItem[]; maxPage: number }> {
  const res = await fetch(`${SIKUMBANG_BASE}/?page=${page}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return { listings: [], maxPage: 0 };
  const html = await res.text();
  const match = html.match(/window\.SIKUMBANG_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  if (!match) return { listings: [], maxPage: 0 };
  const pageData = JSON.parse(match[1]) as {
    page: number;
    maxPage: number;
    listLokasi: SikumbangListing[];
  };
  const listings = (pageData.listLokasi ?? [])
    .filter(isLumajang)
    .map(mapListing);
  return { listings, maxPage: pageData.maxPage ?? 0 };
}

interface SikumbangDetailResponse {
  detail: {
    namaPerumahan?: string;
    foto?: string[];
    tipeRumah?: { fotoTampak?: string; fotoDenah?: string }[];
    koordinatPerumahan?: string;
  };
  bangunan?: { id: number; idRumah: string }[];
}

async function fetchListingDetail(idLokasi: string): Promise<Partial<ListingItem> | null> {
  try {
    const url = `${SIKUMBANG_BASE}/lokasi-perumahan/${idLokasi}/json`;
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const raw = (await r.json()) as SikumbangDetailResponse | SikumbangListing;

    if ("detail" in raw && raw.detail) {
      const d = raw as SikumbangDetailResponse;
      const jumlahUnit = Array.isArray(d.bangunan) && d.bangunan.length > 0
        ? String(d.bangunan.length)
        : null;
      const foto = (d.detail.foto ?? [])
        .filter((f) => f && typeof f === "string")
        .map((f) => f.startsWith("http") ? f : `${SIKUMBANG_BASE}${f}`);
      return { jumlahUnit, foto };
    }

    const mapped = mapListing(raw as SikumbangListing);
    return { jumlahUnit: mapped.jumlahUnit, foto: mapped.foto, kelurahan: mapped.kelurahan };
  } catch {
    return null;
  }
}

async function enrichListings(listings: ListingItem[]): Promise<void> {
  const toEnrich = listings.filter((l) => !l.jumlahUnit || l.jumlahUnit === "");
  if (toEnrich.length === 0) return;

  scraping.enriching = true;
  scraping.toEnrich = toEnrich.length;
  scraping.enriched = 0;

  logger.info({ toEnrich: toEnrich.length }, "Starting unit enrichment");

  for (let i = 0; i < toEnrich.length; i += ENRICH_CONCURRENCY) {
    const batch = toEnrich.slice(i, i + ENRICH_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((l) => fetchListingDetail(l.idLokasi))
    );

    for (let j = 0; j < batch.length; j++) {
      const r = results[j];
      const listing = batch[j];
      if (r.status === "fulfilled" && r.value) {
        const idx = listings.findIndex((l) => l.idLokasi === listing.idLokasi);
        if (idx !== -1) {
          if (r.value.jumlahUnit) listings[idx].jumlahUnit = r.value.jumlahUnit;
          if (r.value.foto && r.value.foto.length > 0) listings[idx].foto = r.value.foto;
          if (r.value.kelurahan) listings[idx].kelurahan = r.value.kelurahan;
        }
      }
      scraping.enriched++;
    }

    if (listingsCache) {
      listingsCache = { data: [...listings], fetchedAt: listingsCache.fetchedAt };
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  scraping.enriching = false;
  logger.info({ enriched: scraping.enriched }, "Unit enrichment complete");
}

function recordSalesSnapshot(listings: ListingItem[]): void {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const developerSales: Record<string, { namaDeveloper: string; asosiasi: string; totalUnit: number; jumlahLokasi: number }> = {};
  for (const l of listings) {
    if (!l.namaDeveloper) continue;
    const units = parseInt(l.jumlahUnit ?? "0", 10) || 0;
    if (!developerSales[l.namaDeveloper]) {
      developerSales[l.namaDeveloper] = { namaDeveloper: l.namaDeveloper, asosiasi: l.asosiasi, totalUnit: 0, jumlahLokasi: 0 };
    }
    developerSales[l.namaDeveloper].totalUnit += units;
    developerSales[l.namaDeveloper].jumlahLokasi++;
  }

  const kecamatanSales: Record<string, number> = {};
  for (const l of listings) {
    if (!l.kecamatan) continue;
    const units = parseInt(l.jumlahUnit ?? "0", 10) || 0;
    kecamatanSales[l.kecamatan] = (kecamatanSales[l.kecamatan] ?? 0) + units;
  }

  const existingIdx = salesSnapshots.findIndex((s) => s.month === month);
  const snapshot: SalesSnapshot = {
    month,
    recordedAt: now.toISOString(),
    developerSales,
    kecamatanSales,
  };

  if (existingIdx !== -1) {
    salesSnapshots[existingIdx] = snapshot;
  } else {
    salesSnapshots.push(snapshot);
    if (salesSnapshots.length > 12) {
      salesSnapshots = salesSnapshots.slice(-12);
    }
  }
}

async function runFullScrape(): Promise<ListingItem[]> {
  const results: ListingItem[] = [];
  const seen = new Set<string>();

  scraping = { inProgress: true, pagesScraped: 0, totalPages: 0, enriching: false, enriched: 0, toEnrich: 0 };

  try {
    const first = await fetchPage(1);
    const maxPage = first.maxPage || 1116;
    scraping.totalPages = maxPage;
    scraping.pagesScraped = 1;

    for (const l of first.listings) {
      if (!seen.has(l.idLokasi)) {
        seen.add(l.idLokasi);
        results.push(l);
      }
    }

    for (let start = 2; start <= maxPage; start += CONCURRENT_PAGES) {
      const batch = Array.from(
        { length: Math.min(CONCURRENT_PAGES, maxPage - start + 1) },
        (_, i) => start + i
      );

      const settled = await Promise.allSettled(batch.map(fetchPage));

      for (const r of settled) {
        if (r.status === "fulfilled") {
          for (const l of r.value.listings) {
            if (!seen.has(l.idLokasi)) {
              seen.add(l.idLokasi);
              results.push(l);
            }
          }
        }
      }

      scraping.pagesScraped = Math.min(start + CONCURRENT_PAGES - 2, maxPage);
      listingsCache = { data: [...results], fetchedAt: Date.now() };
    }

    listingsCache = { data: results, fetchedAt: Date.now() };
    lastRefreshAt = new Date().toISOString();
    logger.info({ total: results.length }, "Full SIKUMBANG scrape complete");

    setImmediate(() => {
      enrichListings(results)
        .then(() => {
          recordSalesSnapshot(results);
        })
        .catch((err) => logger.error({ err }, "Enrichment failed"));
    });
  } finally {
    scraping = { inProgress: false, pagesScraped: scraping.totalPages, totalPages: scraping.totalPages, enriching: false, enriched: 0, toEnrich: 0 };
    scrapePromise = null;
  }

  return results;
}

async function fetchKecamatanData(): Promise<KecamatanRaw[]> {
  if (kecamatanCache && Date.now() - kecamatanCache.fetchedAt < CACHE_TTL_MS) {
    return kecamatanCache.data;
  }
  const res = await fetch(
    `${SIKUMBANG_BASE}/grafik-data?kode=${LUMAJANG_KODE}&asosiasi=`,
    { signal: AbortSignal.timeout(15000) }
  );
  if (!res.ok) throw new Error(`Grafik data fetch failed: ${res.status}`);
  const json = (await res.json()) as { data: KecamatanRaw[] };
  const data = json.data ?? [];
  kecamatanCache = { data, fetchedAt: Date.now() };
  return data;
}

function ensureScraping(): void {
  const cacheExpired = !listingsCache || Date.now() - listingsCache.fetchedAt >= CACHE_TTL_MS;
  if (cacheExpired && !scraping.inProgress && !scrapePromise) {
    scrapePromise = runFullScrape().catch((err) => {
      logger.error({ err }, "Full scrape failed");
      return [];
    });
  }
}

function getCachedListings(): ListingItem[] {
  return listingsCache?.data ?? [];
}

router.get("/lumajang/summary", async (req, res) => {
  try {
    ensureScraping();
    const kecamatanData = await fetchKecamatanData();
    const listings = getCachedListings();

    const totalStok = kecamatanData.reduce((sum, k) => sum + (k.supply || 0), 0);
    const totalPeminatan = kecamatanData.reduce((sum, k) => sum + (k.peminatan || 0), 0);
    const totalPilihan = kecamatanData.reduce((sum, k) => sum + (k.pilihan || 0), 0);
    const totalSisa = Math.max(0, totalStok - totalPilihan);
    const developerSet = new Set(listings.map((l) => l.namaDeveloper).filter(Boolean));

    const totalUnitFromListings = listings.reduce((sum, l) => {
      const n = parseInt(l.jumlahUnit ?? "0", 10);
      return sum + (isNaN(n) ? 0 : n);
    }, 0);

    res.json({
      totalLokasi: listings.length,
      totalDeveloper: developerSet.size,
      totalStok,
      totalTerjual: totalPilihan,
      totalSisa,
      totalPeminatan,
      totalUnitFromListings,
      lastUpdated: lastRefreshAt ?? new Date().toISOString(),
      scraping: { ...scraping },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get lumajang summary");
    res.status(500).json({ error: "Gagal mengambil data summary" });
  }
});

router.get("/lumajang/kecamatan", async (req, res) => {
  try {
    const kecamatanData = await fetchKecamatanData();
    const mapped = kecamatanData.map((k) => ({
      kodeWilayah: k.kodeWilayah,
      namaWilayah: k.namaWilayah,
      supply: k.supply || 0,
      peminatan: k.peminatan || 0,
      pilihan: k.pilihan || 0,
      sisa: Math.max(0, (k.supply || 0) - (k.pilihan || 0)),
    }));
    res.json(mapped);
  } catch (err) {
    req.log.error({ err }, "Failed to get kecamatan data");
    res.status(500).json({ error: "Gagal mengambil data kecamatan" });
  }
});

router.get("/lumajang/developers", async (req, res) => {
  try {
    ensureScraping();
    const listings = getCachedListings();

    const devMap = new Map<string, { namaDeveloper: string; asosiasi: string; listings: ListingItem[] }>();

    for (const listing of listings) {
      if (!listing.namaDeveloper) continue;
      const existing = devMap.get(listing.namaDeveloper);
      if (existing) {
        existing.listings.push(listing);
      } else {
        devMap.set(listing.namaDeveloper, {
          namaDeveloper: listing.namaDeveloper,
          asosiasi: listing.asosiasi,
          listings: [listing],
        });
      }
    }

    const result = Array.from(devMap.values())
      .map((dev) => ({
        namaDeveloper: dev.namaDeveloper,
        asosiasi: dev.asosiasi,
        jumlahLokasi: dev.listings.length,
        totalUnit: dev.listings.reduce((sum, l) => {
          const n = parseInt(l.jumlahUnit ?? "0", 10);
          return sum + (isNaN(n) ? 0 : n);
        }, 0),
        listings: dev.listings,
      }))
      .sort((a, b) => b.jumlahLokasi - a.jumlahLokasi);

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get developers data");
    res.status(500).json({ error: "Gagal mengambil data developer" });
  }
});

router.get("/lumajang/listings", async (req, res) => {
  try {
    ensureScraping();
    const page = parseInt(String(req.query.page ?? "1"), 10);
    const limit = parseInt(String(req.query.limit ?? "20"), 10);
    const kecamatan = req.query.kecamatan as string | undefined;

    let listings = getCachedListings();

    if (kecamatan) {
      listings = listings.filter((l) =>
        l.kecamatan.toLowerCase().includes(kecamatan.toLowerCase())
      );
    }

    const total = listings.length;
    const start = (page - 1) * limit;
    const data = listings.slice(start, start + limit);

    res.json({ data, total, page, limit });
  } catch (err) {
    req.log.error({ err }, "Failed to get listings");
    res.status(500).json({ error: "Gagal mengambil data listing" });
  }
});

router.get("/lumajang/listings/:idLokasi", async (req, res) => {
  try {
    const { idLokasi } = req.params;

    const cached = getCachedListings().find((l) => l.idLokasi === idLokasi);

    const needsFetch = !cached || !cached.jumlahUnit || cached.foto.length === 0;
    if (!needsFetch && cached) return res.json(cached);

    const enriched = await fetchListingDetail(idLokasi);

    if (!enriched && cached) return res.json(cached);
    if (!enriched) return res.status(404).json({ error: "Lokasi tidak ditemukan" });

    if (cached) {
      if (enriched.jumlahUnit) cached.jumlahUnit = enriched.jumlahUnit;
      if (enriched.foto && enriched.foto.length > 0) cached.foto = enriched.foto;
      if (enriched.kelurahan) cached.kelurahan = enriched.kelurahan;
      return res.json(cached);
    }

    return res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "Failed to get listing detail");
    res.status(500).json({ error: "Gagal mengambil detail listing" });
  }
});

router.get("/lumajang/penjualan-bulanan", async (req, res) => {
  try {
    ensureScraping();
    const listings = getCachedListings();

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const developerSales: Record<string, { namaDeveloper: string; asosiasi: string; totalUnit: number; jumlahLokasi: number }> = {};
    for (const l of listings) {
      if (!l.namaDeveloper) continue;
      const units = parseInt(l.jumlahUnit ?? "0", 10) || 0;
      if (!developerSales[l.namaDeveloper]) {
        developerSales[l.namaDeveloper] = { namaDeveloper: l.namaDeveloper, asosiasi: l.asosiasi, totalUnit: 0, jumlahLokasi: 0 };
      }
      developerSales[l.namaDeveloper].totalUnit += units;
      developerSales[l.namaDeveloper].jumlahLokasi++;
    }

    const prevSnapshot = salesSnapshots.find((s) => s.month < currentMonth);
    const currentSnapshotIdx = salesSnapshots.findIndex((s) => s.month === currentMonth);

    const developersArray = Object.values(developerSales)
      .filter((d) => d.totalUnit > 0)
      .map((dev) => {
        const prevUnit = prevSnapshot?.developerSales?.[dev.namaDeveloper]?.totalUnit ?? null;
        const deltaBulanIni = prevUnit !== null ? dev.totalUnit - prevUnit : null;
        return {
          ...dev,
          unitBulanLalu: prevUnit,
          deltaBulanIni,
        };
      })
      .sort((a, b) => b.totalUnit - a.totalUnit);

    res.json({
      bulan: currentMonth,
      totalDeveloper: developersArray.length,
      snapshotCount: salesSnapshots.length,
      developers: developersArray,
      snapshots: salesSnapshots.map((s) => ({
        month: s.month,
        recordedAt: s.recordedAt,
        totalUnit: Object.values(s.developerSales).reduce((sum, d) => sum + d.totalUnit, 0),
        activeDevelopers: Object.values(s.developerSales).filter((d) => d.totalUnit > 0).length,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get penjualan bulanan");
    res.status(500).json({ error: "Gagal mengambil data penjualan bulanan" });
  }
});

router.get("/lumajang/photo-proxy", async (req: Request, res: Response) => {
  try {
    const rawUrl = req.query.url as string;
    if (!rawUrl) return res.status(400).json({ error: "URL diperlukan" });

    let photoUrl: string;
    try {
      photoUrl = decodeURIComponent(rawUrl);
    } catch {
      photoUrl = rawUrl;
    }

    if (!photoUrl.startsWith("https://sikumbang.tapera.go.id") && !photoUrl.startsWith("http://sikumbang.tapera.go.id")) {
      return res.status(403).json({ error: "URL tidak diizinkan" });
    }

    const r = await fetch(photoUrl, {
      signal: AbortSignal.timeout(15000),
      headers: {
        "Referer": "https://sikumbang.tapera.go.id/",
        "User-Agent": "Mozilla/5.0 (compatible; LumajangDashboard/1.0)",
      },
    });

    if (!r.ok) return res.status(r.status).json({ error: "Gagal mengambil foto" });

    const contentType = r.headers.get("content-type") ?? "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");

    const buffer = await r.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    req.log.error({ err }, "Photo proxy failed");
    res.status(500).json({ error: "Gagal memuat foto" });
  }
});

router.post("/lumajang/refresh", async (req, res) => {
  try {
    if (scraping.inProgress) {
      return res.json({
        success: false,
        message: `Sedang scraping... (${scraping.pagesScraped}/${scraping.totalPages} halaman)`,
        timestamp: new Date().toISOString(),
      });
    }

    kecamatanCache = null;
    listingsCache = null;

    fetchKecamatanData().catch(() => {});
    scrapePromise = runFullScrape().catch((err) => {
      logger.error({ err }, "Refresh scrape failed");
      return [];
    });

    res.json({
      success: true,
      message: "Scraping dimulai — data akan diperbarui secara bertahap",
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to refresh data");
    res.status(500).json({
      success: false,
      message: "Gagal memperbarui data",
      timestamp: new Date().toISOString(),
    });
  }
});

ensureScraping();

export default router;

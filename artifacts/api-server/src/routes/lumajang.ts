import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();

const SIKUMBANG_BASE = "https://sikumbang.tapera.go.id";
const LUMAJANG_KODE = "3508";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

let kecamatanCache: CacheEntry<KecamatanRaw[]> | null = null;
let listingsCache: CacheEntry<ListingItem[]> | null = null;
let lastRefreshAt: string | null = null;

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

async function fetchAllLumajangListings(): Promise<ListingItem[]> {
  if (listingsCache && Date.now() - listingsCache.fetchedAt < CACHE_TTL_MS) {
    return listingsCache.data;
  }

  const results: ListingItem[] = [];
  let page = 1;
  const limit = 200;
  let hasMore = true;

  while (hasMore && page <= 10) {
    try {
      const url = `${SIKUMBANG_BASE}/?page=${page}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) break;

      const html = await res.text();
      const match = html.match(/window\.SIKUMBANG_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
      if (!match) break;

      const pageData = JSON.parse(match[1]) as {
        page: number;
        maxPage: number;
        listLokasi: SikumbangListing[];
      };

      const lumajangListings = pageData.listLokasi.filter(
        (l) =>
          l.wilayah?.kabupaten === "KAB LUMAJANG" ||
          l.idLokasi.startsWith("LMJ")
      );

      for (const l of lumajangListings) {
        results.push({
          idLokasi: l.idLokasi,
          namaPerumahan: l.namaPerumahan,
          jenisPerumahan: l.jenisPerumahan,
          kecamatan: l.wilayah?.kecamatan ?? "",
          kelurahan: l.wilayah?.kelurahan ?? null,
          namaDeveloper: l.pengembang?.nama ?? "",
          asosiasi: l.pengembang?.asosiasi ?? "",
          jumlahUnit: l.jumlahUnit ?? null,
          foto: (l.foto ?? []).map((f) =>
            f.startsWith("http") ? f : `${SIKUMBANG_BASE}${f}`
          ),
        });
      }

      if (page >= pageData.maxPage || lumajangListings.length === 0) {
        hasMore = false;
      }

      page++;

      if (results.length >= limit) break;
    } catch (err) {
      logger.warn({ err, page }, "Failed to fetch page, stopping");
      break;
    }
  }

  listingsCache = { data: results, fetchedAt: Date.now() };
  lastRefreshAt = new Date().toISOString();
  return results;
}

async function fetchLumajangListingsTargeted(): Promise<ListingItem[]> {
  if (listingsCache && Date.now() - listingsCache.fetchedAt < CACHE_TTL_MS) {
    return listingsCache.data;
  }

  const results: ListingItem[] = [];
  const concurrentPages = 5;
  const maxPages = 50;

  for (let startPage = 1; startPage <= maxPages; startPage += concurrentPages) {
    const pages = Array.from(
      { length: Math.min(concurrentPages, maxPages - startPage + 1) },
      (_, i) => startPage + i
    );

    const pageResults = await Promise.allSettled(
      pages.map(async (page) => {
        const url = `${SIKUMBANG_BASE}/?page=${page}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (!res.ok) return [];

        const html = await res.text();
        const match = html.match(/window\.SIKUMBANG_DATA\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
        if (!match) return [];

        const pageData = JSON.parse(match[1]) as {
          page: number;
          maxPage: number;
          listLokasi: SikumbangListing[];
        };

        return pageData.listLokasi.filter(
          (l) =>
            l.wilayah?.kabupaten === "KAB LUMAJANG" ||
            l.idLokasi.startsWith("LMJ")
        ).map((l) => ({
          idLokasi: l.idLokasi,
          namaPerumahan: l.namaPerumahan,
          jenisPerumahan: l.jenisPerumahan,
          kecamatan: l.wilayah?.kecamatan ?? "",
          kelurahan: l.wilayah?.kelurahan ?? null,
          namaDeveloper: l.pengembang?.nama ?? "",
          asosiasi: l.pengembang?.asosiasi ?? "",
          jumlahUnit: l.jumlahUnit ?? null,
          foto: (l.foto ?? []).map((f) =>
            f.startsWith("http") ? f : `${SIKUMBANG_BASE}${f}`
          ),
        }));
      })
    );

    for (const result of pageResults) {
      if (result.status === "fulfilled") {
        results.push(...result.value);
      }
    }

    if (results.length > 0) {
      break;
    }
  }

  listingsCache = { data: results, fetchedAt: Date.now() };
  lastRefreshAt = new Date().toISOString();
  return results;
}

router.get("/lumajang/summary", async (req, res) => {
  try {
    const [kecamatanData, listings] = await Promise.all([
      fetchKecamatanData(),
      fetchLumajangListingsTargeted(),
    ]);

    const totalStok = kecamatanData.reduce((sum, k) => sum + (k.supply || 0), 0);
    const totalPeminatan = kecamatanData.reduce((sum, k) => sum + (k.peminatan || 0), 0);
    const totalPilihan = kecamatanData.reduce((sum, k) => sum + (k.pilihan || 0), 0);
    const totalSisa = Math.max(0, totalStok - totalPilihan);

    const developerSet = new Set(listings.map((l) => l.namaDeveloper).filter(Boolean));

    res.json({
      totalLokasi: listings.length,
      totalDeveloper: developerSet.size,
      totalStok,
      totalTerjual: totalPilihan,
      totalSisa,
      totalPeminatan,
      lastUpdated: lastRefreshAt ?? new Date().toISOString(),
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
    const listings = await fetchLumajangListingsTargeted();

    const devMap = new Map<
      string,
      {
        namaDeveloper: string;
        asosiasi: string;
        listings: ListingItem[];
      }
    >();

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
    const page = parseInt(String(req.query.page ?? "1"), 10);
    const limit = parseInt(String(req.query.limit ?? "20"), 10);
    const kecamatan = req.query.kecamatan as string | undefined;

    let listings = await fetchLumajangListingsTargeted();

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

    const cacheRes = listingsCache?.data.find((l) => l.idLokasi === idLokasi);
    if (cacheRes) {
      return res.json(cacheRes);
    }

    const url = `${SIKUMBANG_BASE}/lokasi-perumahan/${idLokasi}/json`;
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) {
      return res.status(404).json({ error: "Lokasi tidak ditemukan" });
    }
    const detail = await r.json() as SikumbangListing;
    return res.json({
      idLokasi: detail.idLokasi,
      namaPerumahan: detail.namaPerumahan,
      jenisPerumahan: detail.jenisPerumahan,
      kecamatan: detail.wilayah?.kecamatan ?? "",
      kelurahan: detail.wilayah?.kelurahan ?? null,
      namaDeveloper: detail.pengembang?.nama ?? "",
      asosiasi: detail.pengembang?.asosiasi ?? "",
      jumlahUnit: detail.jumlahUnit ?? null,
      foto: (detail.foto ?? []).map((f) =>
        f.startsWith("http") ? f : `${SIKUMBANG_BASE}${f}`
      ),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get listing detail");
    res.status(500).json({ error: "Gagal mengambil detail listing" });
  }
});

router.post("/lumajang/refresh", async (req, res) => {
  try {
    kecamatanCache = null;
    listingsCache = null;

    await Promise.all([fetchKecamatanData(), fetchLumajangListingsTargeted()]);

    res.json({
      success: true,
      message: "Data berhasil diperbarui dari SIKUMBANG",
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

export default router;

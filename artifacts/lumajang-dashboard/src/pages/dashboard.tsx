import { useState, Fragment } from "react";
import {
  useGetLumajangSummary,
  useGetLumajangKecamatan,
  useGetLumajangListings,
  useGetLumajangDevelopers,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import {
  Building, MapPin, Package, CheckCircle, Clock, Loader2,
  ChevronDown, ChevronRight, Search, X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const KECAMATAN_COORDS: Record<string, [number, number]> = {
  "LUMAJANG": [-8.1347, 113.2269],
  "KUNIR": [-8.2294, 113.1891],
  "YOSOWILANGUN": [-8.2167, 113.1000],
  "ROWOKANGKUNG": [-8.2917, 113.2333],
  "TEKUNG": [-8.1731, 113.2667],
  "TEMPEH": [-8.2333, 113.3333],
  "PASIRIAN": [-8.3333, 113.3500],
  "CANDIPURO": [-8.3667, 113.4167],
  "PRONOJIWO": [-8.2833, 113.4500],
  "SENDURO": [-8.1167, 113.3333],
  "PASRUJAMBE": [-8.1500, 113.3833],
  "GUCIALIT": [-8.0833, 113.3500],
  "JATIROTO": [-8.2167, 113.1500],
  "RANUYOSO": [-8.0833, 113.2500],
  "KLAKAH": [-8.1500, 113.2667],
  "RANDUAGUNG": [-8.1667, 113.2000],
  "SUKODONO": [-8.0667, 113.1833],
  "PADANG": [-8.1833, 113.3167],
  "KEDUNGJAJANG": [-8.0500, 113.2000],
  "SUMBERSUKO": [-8.1333, 113.2500],
};

function getCoords(kecamatan: string): [number, number] | null {
  const key = kecamatan.toUpperCase().trim();
  return KECAMATAN_COORDS[key] ?? null;
}

function LokasiModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const { data: allListings, isLoading } = useGetLumajangListings(
    { page: 1, limit: 200 },
    { query: { enabled: open } }
  );

  const listings = allListings?.data ?? [];

  const byKecamatan: Record<string, typeof listings> = {};
  for (const l of listings) {
    const k = l.kecamatan || "Lainnya";
    if (!byKecamatan[k]) byKecamatan[k] = [];
    byKecamatan[k].push(l);
  }

  const filtered = listings.filter(
    (l) =>
      l.namaPerumahan.toLowerCase().includes(search.toLowerCase()) ||
      l.kecamatan.toLowerCase().includes(search.toLowerCase()) ||
      l.namaDeveloper.toLowerCase().includes(search.toLowerCase())
  );

  const mapMarkers = Object.entries(byKecamatan).map(([kec, items]) => {
    const coords = getCoords(kec);
    return { kec, items, coords };
  }).filter((m) => m.coords !== null);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-blue-600" />
            {listings.length} Lokasi Perumahan — Kabupaten Lumajang
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex flex-col gap-0">
              <div className="h-72 w-full shrink-0">
                <MapContainer
                  center={[-8.18, 113.25]}
                  zoom={10}
                  style={{ height: "100%", width: "100%" }}
                  scrollWheelZoom={false}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  />
                  {mapMarkers.map(({ kec, items, coords }) => (
                    <CircleMarker
                      key={kec}
                      center={coords!}
                      radius={Math.max(8, Math.min(24, items.length * 2))}
                      pathOptions={{ color: "#2563eb", fillColor: "#3b82f6", fillOpacity: 0.7 }}
                    >
                      <Popup maxWidth={280}>
                        <div className="font-semibold text-sm mb-2">{kec} — {items.length} lokasi</div>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {items.map((l) => (
                            <div key={l.idLokasi} className="text-xs border-b pb-1 last:border-0">
                              <div className="font-medium">{l.namaPerumahan}</div>
                              <div className="text-gray-500">{l.namaDeveloper} · {l.jumlahUnit ? `${l.jumlahUnit} unit` : "—"}</div>
                            </div>
                          ))}
                        </div>
                      </Popup>
                    </CircleMarker>
                  ))}
                </MapContainer>
              </div>

              <div className="px-6 py-4 border-t">
                <div className="relative mb-4">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Cari perumahan, kecamatan, atau developer..."
                    className="pl-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nama Perumahan</TableHead>
                        <TableHead>Developer</TableHead>
                        <TableHead>Kecamatan</TableHead>
                        <TableHead className="text-right">Jumlah Unit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((l) => (
                        <TableRow key={l.idLokasi}>
                          <TableCell className="font-medium text-sm">{l.namaPerumahan}</TableCell>
                          <TableCell className="text-sm">{l.namaDeveloper}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-normal">{l.kecamatan}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold">{l.jumlahUnit || "—"}</TableCell>
                        </TableRow>
                      ))}
                      {filtered.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                            Tidak ada hasil ditemukan
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeveloperModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { data: developers, isLoading } = useGetLumajangDevelopers({ query: { enabled: open } });

  const filtered = (developers ?? [])
    .filter(
      (d) =>
        d.namaDeveloper.toLowerCase().includes(search.toLowerCase()) ||
        d.asosiasi.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => b.totalUnit - a.totalUnit);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Building className="h-5 w-5 text-blue-600" />
            {developers?.length ?? 0} Developer Aktif — Klik baris untuk lihat detail perumahan
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="relative mb-4">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari developer atau asosiasi..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>Developer</TableHead>
                    <TableHead>Asosiasi</TableHead>
                    <TableHead className="text-right">Lokasi</TableHead>
                    <TableHead className="text-right">Total Unit (Stok)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((dev) => (
                    <Fragment key={dev.namaDeveloper}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setExpanded((p) => ({ ...p, [dev.namaDeveloper]: !p[dev.namaDeveloper] }))}
                      >
                        <TableCell>
                          {expanded[dev.namaDeveloper]
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          }
                        </TableCell>
                        <TableCell className="font-bold">{dev.namaDeveloper}</TableCell>
                        <TableCell><Badge variant="outline" className="font-normal">{dev.asosiasi}</Badge></TableCell>
                        <TableCell className="text-right">{dev.jumlahLokasi}</TableCell>
                        <TableCell className="text-right font-semibold">{dev.totalUnit.toLocaleString()}</TableCell>
                      </TableRow>

                      {expanded[dev.namaDeveloper] && (
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={5} className="p-0">
                            <div className="p-4 pl-10">
                              <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                                Daftar Perumahan ({dev.listings.length})
                              </p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {dev.listings.map((l) => {
                                  const unit = l.jumlahUnit ? parseInt(l.jumlahUnit, 10) : 0;
                                  return (
                                    <div key={l.idLokasi} className="bg-background rounded border p-3">
                                      <div className="font-medium text-sm leading-tight">{l.namaPerumahan}</div>
                                      <div className="flex items-center justify-between mt-1">
                                        <span className="text-xs text-muted-foreground">{l.kecamatan}</span>
                                        <div className="flex items-center gap-2 text-xs">
                                          <span className="text-blue-600 font-semibold">
                                            {unit > 0 ? `${unit.toLocaleString()} unit` : "—"}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        Tidak ada data ditemukan.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StokModal({ open, onClose, summary }: {
  open: boolean;
  onClose: () => void;
  summary: { totalStok: number; totalDipilih: number; totalSisa: number } | undefined;
}) {
  const { data: kecamatan, isLoading } = useGetLumajangKecamatan({ query: { enabled: open } });

  const sorted = [...(kecamatan ?? [])].filter((k) => k.supply > 0).sort((a, b) => b.supply - a.supply);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600" />
            Rincian Total Stok — Seluruh 118 Lokasi Lumajang
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {summary && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="rounded-lg border p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">{summary.totalStok.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground mt-1">Total Stok Terdaftar</div>
              </div>
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-center">
                <div className="text-2xl font-bold text-yellow-600">{summary.totalDipilih.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground mt-1">Sudah Dipilih / Diminati</div>
                <div className="text-xs text-yellow-600 mt-0.5">
                  {summary.totalStok > 0 ? ((summary.totalDipilih / summary.totalStok) * 100).toFixed(1) : 0}% dari total
                </div>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
                <div className="text-2xl font-bold text-green-600">{summary.totalSisa.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground mt-1">Sisa Stok Tersedia</div>
                <div className="text-xs text-green-600 mt-0.5">
                  {summary.totalStok > 0 ? ((summary.totalSisa / summary.totalStok) * 100).toFixed(1) : 0}% dari total
                </div>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kecamatan</TableHead>
                    <TableHead className="text-right">Total Stok</TableHead>
                    <TableHead className="text-right">Sudah Dipilih</TableHead>
                    <TableHead className="text-right">Sisa Tersedia</TableHead>
                    <TableHead className="text-right">% Dipilih</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((k) => {
                    const pct = k.supply > 0 ? ((k.pilihan / k.supply) * 100).toFixed(1) : "0.0";
                    return (
                      <TableRow key={k.kodeWilayah}>
                        <TableCell className="font-medium">{k.namaWilayah}</TableCell>
                        <TableCell className="text-right font-semibold">{k.supply.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-yellow-600 font-semibold">{k.pilihan.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-green-600 font-semibold">{k.sisa.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <span className={`text-sm font-medium ${parseFloat(pct) >= 80 ? "text-red-600" : parseFloat(pct) >= 50 ? "text-yellow-600" : "text-green-600"}`}>
                            {pct}%
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            * "Dipilih" = unit yang dipilih/diminati calon pembeli di SIKUMBANG (bukan transaksi terkonfirmasi)
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ClickableStatCard({
  title, value, icon: Icon, description, onClick, color = "blue",
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  description?: string;
  onClick: () => void;
  color?: "blue" | "yellow" | "green";
}) {
  const colorMap = {
    blue: "hover:border-blue-400 hover:bg-blue-50/50",
    yellow: "hover:border-yellow-400 hover:bg-yellow-50/50",
    green: "hover:border-green-400 hover:bg-green-50/50",
  };
  const iconColorMap = {
    blue: "text-blue-600",
    yellow: "text-yellow-600",
    green: "text-green-600",
  };

  return (
    <Card
      className={`cursor-pointer transition-all border-2 ${colorMap[color]}`}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${iconColorMap[color]}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
        <p className="text-xs text-blue-500 mt-1 font-medium">Klik untuk detail →</p>
      </CardContent>
    </Card>
  );
}

function StatCard({ title, value, icon: Icon, description }: { title: string; value: string | number; icon: React.ElementType; description?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const [openModal, setOpenModal] = useState<"lokasi" | "developer" | "stok" | null>(null);

  const { data: summary, isLoading: isSummaryLoading } = useGetLumajangSummary({}, {
    query: {
      refetchInterval: (query) => {
        const data = query.state.data;
        return data?.scraping?.inProgress ? 3000 : false;
      },
    },
  });
  const { data: kecamatan, isLoading: isKecamatanLoading } = useGetLumajangKecamatan();

  const isLoading = isSummaryLoading || isKecamatanLoading;
  const isScrapingInProgress = summary?.scraping?.inProgress ?? false;
  const scrapingPct = summary?.scraping?.totalPages
    ? Math.round((summary.scraping.pagesScraped / summary.scraping.totalPages) * 100)
    : 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-96 bg-muted animate-pulse rounded-xl" />
          <div className="h-96 bg-muted animate-pulse rounded-xl" />
        </div>
      </div>
    );
  }

  if (!summary || !kecamatan) return null;

  const topKecamatan = [...kecamatan]
    .filter((k) => k.supply > 0)
    .sort((a, b) => b.supply - a.supply)
    .slice(0, 10);

  const pieData = [
    { name: "Dipilih", value: summary.totalDipilih, color: "#eab308" },
    { name: "Sisa Stok", value: summary.totalSisa, color: "#22c55e" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ringkasan Eksekutif</h1>
        <p className="text-muted-foreground mt-1">
          Status ketersediaan perumahan subsidi di Kabupaten Lumajang — klik kartu untuk detail
        </p>
      </div>

      {isScrapingInProgress && (
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <Loader2 className="h-5 w-5 text-blue-600 animate-spin mt-0.5 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-blue-800">Mengambil data dari SIKUMBANG Tapera...</p>
                  <span className="text-sm font-bold text-blue-700">{scrapingPct}%</span>
                </div>
                <Progress value={scrapingPct} className="h-2" />
                <p className="text-xs text-blue-600">
                  {summary.scraping.pagesScraped.toLocaleString()} dari {summary.scraping.totalPages.toLocaleString()} halaman dipindai
                  — {summary.totalLokasi} lokasi Lumajang ditemukan
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <ClickableStatCard
          title="Total Lokasi"
          value={isScrapingInProgress ? `${summary.totalLokasi}…` : summary.totalLokasi}
          icon={MapPin}
          description="Lihat peta & daftar"
          onClick={() => setOpenModal("lokasi")}
          color="blue"
        />
        <ClickableStatCard
          title="Total Developer"
          value={summary.totalDeveloper}
          icon={Building}
          description="Lihat semua developer"
          onClick={() => setOpenModal("developer")}
          color="blue"
        />
        <ClickableStatCard
          title="Total Stok"
          value={summary.totalStok.toLocaleString()}
          icon={Package}
          description="Lihat rincian per kecamatan"
          onClick={() => setOpenModal("stok")}
          color="blue"
        />
        <StatCard
          title="Dipilih / Diminati"
          value={summary.totalDipilih.toLocaleString()}
          icon={CheckCircle}
          description="Unit yang dipilih calon pembeli"
        />
        <StatCard
          title="Sisa Stok"
          value={summary.totalSisa.toLocaleString()}
          icon={Clock}
          description="Unit belum dipilih"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Supply vs Peminat per Kecamatan (Top 10)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topKecamatan} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="namaWilayah" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="supply" name="Total Stok" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pilihan" name="Sudah Dipilih" fill="#eab308" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Proporsi Stok</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center">
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 text-center w-full">
              <div className="text-sm font-medium text-muted-foreground">Tingkat Dipilih</div>
              <div className="text-3xl font-bold mt-1">
                {summary.totalStok > 0
                  ? ((summary.totalDipilih / summary.totalStok) * 100).toFixed(1)
                  : "0.0"}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">dari total stok terdaftar</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <LokasiModal open={openModal === "lokasi"} onClose={() => setOpenModal(null)} />
      <DeveloperModal open={openModal === "developer"} onClose={() => setOpenModal(null)} />
      <StokModal open={openModal === "stok"} onClose={() => setOpenModal(null)} summary={summary} />
    </div>
  );
}

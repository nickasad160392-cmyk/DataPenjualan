import { useGetLumajangSummary, useGetLumajangKecamatan, useGetLumajangListings } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Building, MapPin, Package, CheckCircle, Clock, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

function StatCard({ title, value, icon: Icon, description }: { title: string; value: string | number; icon: any; description?: string }) {
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
  const { data: summary, isLoading: isSummaryLoading } = useGetLumajangSummary({}, {
    query: {
      refetchInterval: (query) => {
        const data = query.state.data;
        return data?.scraping?.inProgress ? 3000 : false;
      },
    },
  });
  const { data: kecamatan, isLoading: isKecamatanLoading } = useGetLumajangKecamatan();
  const { data: listings, isLoading: isListingsLoading, refetch: refetchListings } = useGetLumajangListings({ page: 1, limit: 5 }, {
    query: {
      refetchInterval: summary?.scraping?.inProgress ? 5000 : false,
    },
  });

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
    .filter(k => k.supply > 0)
    .sort((a, b) => b.supply - a.supply)
    .slice(0, 10);

  const pieData = [
    { name: "Terjual", value: summary.totalTerjual, color: "#eab308" },
    { name: "Sisa Stok", value: summary.totalSisa, color: "#22c55e" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ringkasan Eksekutif</h1>
        <p className="text-muted-foreground mt-1">Status ketersediaan perumahan subsidi di Kabupaten Lumajang</p>
      </div>

      {isScrapingInProgress && (
        <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <Loader2 className="h-5 w-5 text-blue-600 animate-spin mt-0.5 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    Mengambil data dari SIKUMBANG Tapera...
                  </p>
                  <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
                    {scrapingPct}%
                  </span>
                </div>
                <Progress value={scrapingPct} className="h-2" />
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {summary.scraping.pagesScraped.toLocaleString()} dari {summary.scraping.totalPages.toLocaleString()} halaman dipindai
                  — {summary.totalLokasi} lokasi Lumajang ditemukan sejauh ini
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Total Lokasi"
          value={isScrapingInProgress ? `${summary.totalLokasi}…` : summary.totalLokasi}
          icon={MapPin}
          description={isScrapingInProgress ? "Masih dihitung..." : undefined}
        />
        <StatCard title="Total Developer" value={summary.totalDeveloper} icon={Building} />
        <StatCard title="Total Stok" value={summary.totalStok.toLocaleString()} icon={Package} />
        <StatCard title="Terjual" value={summary.totalTerjual.toLocaleString()} icon={CheckCircle} />
        <StatCard title="Stok Sisa" value={summary.totalSisa.toLocaleString()} icon={Clock} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Distribusi Supply vs Peminat per Kecamatan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topKecamatan} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="namaWilayah" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="supply" name="Supply (Stok)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="peminatan" name="Peminatan" fill="#f59e0b" radius={[4, 4, 0, 0]} />
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
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 text-center w-full">
              <div className="text-sm font-medium text-muted-foreground">Tingkat Penyerapan</div>
              <div className="text-3xl font-bold mt-1">
                {summary.totalStok > 0
                  ? ((summary.totalTerjual / summary.totalStok) * 100).toFixed(1)
                  : "0.0"}%
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Listing Terbaru
            {isScrapingInProgress && (
              <Badge variant="secondary" className="gap-1 font-normal text-xs">
                <Loader2 className="h-3 w-3 animate-spin" /> memuat...
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {listings?.data && listings.data.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Perumahan</TableHead>
                    <TableHead>Developer</TableHead>
                    <TableHead>Kecamatan</TableHead>
                    <TableHead className="text-right">Unit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listings.data.map((listing) => (
                    <TableRow key={listing.idLokasi}>
                      <TableCell className="font-medium">{listing.namaPerumahan}</TableCell>
                      <TableCell>{listing.namaDeveloper}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal">
                          {listing.kecamatan}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{listing.jumlahUnit || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {isScrapingInProgress ? "Menunggu data pertama..." : "Tidak ada data listing"}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

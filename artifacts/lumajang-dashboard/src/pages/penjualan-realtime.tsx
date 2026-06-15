import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { TrendingUp, Activity, AlertCircle, MapPin } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";

interface KecamatanChange {
  namaWilayah: string;
  kodeWilayah: string;
  delta: number;
  newTotal: number;
  oldTotal: number;
}

interface SaleEvent {
  id: string;
  recordedAt: string;
  kecamatanChanges: KecamatanChange[];
  totalDelta: number;
}

interface SaleEventsResponse {
  events: SaleEvent[];
  totalUnits: number;
  count: number;
}

async function fetchSaleEvents(): Promise<SaleEventsResponse> {
  const res = await fetch("/api/lumajang/sale-events");
  if (!res.ok) throw new Error("Gagal mengambil data penjualan");
  return res.json();
}

function formatDate(iso: string) {
  try {
    return format(new Date(iso), "dd MMM yyyy, HH:mm", { locale: id });
  } catch {
    return iso;
  }
}

function StatCard({ title, value, icon: Icon, sub }: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function PenjualanRealtime() {
  const { data, isLoading, error } = useQuery<SaleEventsResponse>({
    queryKey: ["sale-events"],
    queryFn: fetchSaleEvents,
    refetchInterval: 30000,
  });

  const events = data?.events ?? [];

  const chartData = [...events]
    .reverse()
    .slice(-20)
    .map((e) => ({
      label: format(new Date(e.recordedAt), "dd/MM HH:mm"),
      unit: e.totalDelta,
    }));

  const affectedKecamatan = new Set(events.flatMap((e) => e.kecamatanChanges.map((c) => c.namaWilayah)));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
        <div className="h-64 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Penjualan Realtime</h1>
        <p className="text-muted-foreground mt-1">
          Rekaman perubahan unit dipilih (peminat baru) setiap kali data di-refresh dari SIKUMBANG Tapera
        </p>
      </div>

      {events.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
              <Activity className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Belum ada data penjualan tercatat</h3>
              <p className="text-muted-foreground text-sm mt-1 max-w-md">
                Data penjualan mulai direkam sejak halaman ini aktif. Klik <strong>Refresh Data</strong> minimal
                dua kali untuk mulai mendeteksi perubahan unit yang dipilih calon pembeli.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-4 py-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                Perubahan terdeteksi dari SIKUMBANG: jika unit dipilih bertambah antara dua refresh,
                event baru akan muncul di sini secara otomatis.
              </span>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              title="Total Unit Dipilih Baru"
              value={data?.totalUnits.toLocaleString() ?? 0}
              icon={TrendingUp}
              sub="Akumulasi sejak monitoring aktif"
            />
            <StatCard
              title="Jumlah Event Tercatat"
              value={data?.count ?? 0}
              icon={Activity}
              sub="Setiap refresh yang ada perubahan"
            />
            <StatCard
              title="Kecamatan Terdampak"
              value={affectedKecamatan.size}
              icon={MapPin}
              sub="Unik kecamatan yang ada peminat baru"
            />
          </div>

          {chartData.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Tren Unit Dipilih Baru per Refresh</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                      <Tooltip
                        formatter={(v: number) => [`${v} unit`, "Unit dipilih baru"]}
                      />
                      <Bar dataKey="unit" name="Unit dipilih baru" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Riwayat Event Penjualan</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {events.map((event) => (
                  <div key={event.id} className="p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm text-muted-foreground">{formatDate(event.recordedAt)}</span>
                          <Badge variant="secondary" className="text-xs">
                            +{event.totalDelta} unit dipilih
                          </Badge>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {event.kecamatanChanges.map((c) => (
                            <div key={c.kodeWilayah} className="bg-background border rounded-md p-2.5">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{c.namaWilayah}</span>
                                <span className="text-sm font-bold text-green-600">+{c.delta}</span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {c.oldTotal} → {c.newTotal} unit dipilih
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            * "Unit dipilih" adalah unit yang dipilih/diminati calon pembeli di sistem SIKUMBANG Tapera.
            Data ini mencerminkan peminatan, bukan transaksi jual-beli yang terkonfirmasi.
            Direkam sejak monitoring pertama kali aktif — histori tidak tersimpan saat server restart.
          </p>
        </>
      )}
    </div>
  );
}

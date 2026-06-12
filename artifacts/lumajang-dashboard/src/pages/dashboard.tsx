import { useGetLumajangSummary, useGetLumajangKecamatan, useGetLumajangListings } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Building, MapPin, Package, CheckCircle, Clock } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

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
  const { data: summary, isLoading: isSummaryLoading } = useGetLumajangSummary();
  const { data: kecamatan, isLoading: isKecamatanLoading } = useGetLumajangKecamatan();
  const { data: listings, isLoading: isListingsLoading } = useGetLumajangListings({ page: 1, limit: 5 });

  const isLoading = isSummaryLoading || isKecamatanLoading || isListingsLoading;

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

  // Prepare data for charts
  const topKecamatan = [...kecamatan]
    .filter(k => k.supply > 0)
    .sort((a, b) => b.supply - a.supply)
    .slice(0, 10);

  const pieData = [
    { name: "Terjual", value: summary.totalTerjual, color: "#eab308" }, // amber
    { name: "Sisa Stok", value: summary.totalSisa, color: "#22c55e" }, // green
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Ringkasan Eksekutif</h1>
        <p className="text-muted-foreground mt-1">Status ketersediaan perumahan subsidi di Kabupaten Lumajang</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Total Lokasi" value={summary.totalLokasi} icon={MapPin} />
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
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 text-center w-full">
              <div className="text-sm font-medium text-muted-foreground">Tingkat Penyerapan</div>
              <div className="text-3xl font-bold mt-1">
                {((summary.totalTerjual / summary.totalStok) * 100).toFixed(1)}%
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Listing Terbaru</CardTitle>
        </CardHeader>
        <CardContent>
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
                {listings?.data.map((listing) => (
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
        </CardContent>
      </Card>
    </div>
  );
}

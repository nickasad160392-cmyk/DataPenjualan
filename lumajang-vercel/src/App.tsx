import { Switch, Route } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "./components/layout";
import Dashboard from "./pages/dashboard";
import Kecamatan from "./pages/kecamatan";
import Developer from "./pages/developer";
import Listing from "./pages/listing";
import Penjualan from "./pages/penjualan";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 30_000 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Layout>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/kecamatan" component={Kecamatan} />
          <Route path="/developer" component={Developer} />
          <Route path="/listing" component={Listing} />
          <Route path="/penjualan" component={Penjualan} />
          <Route>
            <div className="text-center py-20 text-muted-foreground">
              <p className="text-4xl font-bold mb-4">404</p>
              <p>Halaman tidak ditemukan.</p>
            </div>
          </Route>
        </Switch>
      </Layout>
    </QueryClientProvider>
  );
}

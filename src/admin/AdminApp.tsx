import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Card, CardSubtitle, CardTitle } from '../ui/Card';
import { Select } from '../ui/Field';

type Order = {
  id: string;
  status: string;
  total_cents: number | null;
  created_at: string;
};

type RiderUnpaidStat = {
  rider_id: string;
  deliveries_count: number;
  delivered_total_cents: number;
  payout_cents: number;
};

interface AdminAppProps {
  userId: string;
  onLogout: () => void;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'en_route', label: 'En route' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'failed', label: 'Failed' },
];

function formatMoneyZAR(cents: number) {
  return `R ${(cents / 100).toFixed(2)}`;
}

function formatDateTime(d: string) {
  const dt = new Date(d);
  return dt.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function badgeForStatus(status: string) {
  switch (status) {
    case 'pending':
      return <Badge variant="warning">Pending</Badge>;
    case 'assigned':
      return <Badge variant="info">Assigned</Badge>;
    case 'en_route':
      return <Badge variant="info">En route</Badge>;
    case 'delivered':
      return <Badge variant="success">Delivered</Badge>;
    case 'cancelled':
      return <Badge variant="error">Cancelled</Badge>;
    case 'failed':
      return <Badge variant="error">Failed</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
}

export function AdminApp({ userId, onLogout }: AdminAppProps) {
  const [riderStats, setRiderStats] = useState<RiderUnpaidStat[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');

  const loadOrders = async () => {
    setLoading(true);
    setError(null);

    let query = supabase
      .from('orders')
      .select('id, status, total_cents, created_at')
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') query = query.eq('status', statusFilter);

    const { data, error } = await query;
    setLoading(false);

    if (error) {
      console.error(error);
      setError(error.message);
      return;
    }

    setOrders((data ?? []) as Order[]);
  };

  const loadRiderStats = async () => {
    setLoadingStats(true);
    const { data, error } = await supabase
      .from('v_rider_weekly_unpaid')
      .select('rider_id, deliveries_count, delivered_total_cents, payout_cents')
      .order('deliveries_count', { ascending: false });

    setLoadingStats(false);

    if (error) {
      console.error(error);
      setError(error.message);
      return;
    }

    setRiderStats((data ?? []) as RiderUnpaidStat[]);
  };

  const downloadUnpaidOrdersCsv = async () => {
    const { data, error } = await supabase
      .from('v_rider_unpaid_orders_export')
      .select('order_id, rider_id, user_id, total_cents, delivered_at');

    if (error) {
      console.error(error);
      setError(error.message);
      return;
    }

    const rows = (data ?? []) as any[];
    const header = ['order_id', 'rider_id', 'user_id', 'total_cents', 'delivered_at'];
    const csv = [header.join(','), ...rows.map((r) => header.map((k) => JSON.stringify(r[k] ?? '')).join(','))].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `aqva_unpaid_deliveries_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();

    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    loadRiderStats();
    const id = setInterval(loadRiderStats, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(loadOrders, 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, statusFilter]);

  const totalAmountCents = orders.reduce((sum, o) => sum + (o.total_cents ?? 0), 0);

  const totalUnpaidDeliveries = riderStats.reduce((s, r) => s + (r.deliveries_count ?? 0), 0);
  const totalPayoutCents = riderStats.reduce((s, r) => s + (r.payout_cents ?? 0), 0);

  return (
    <div className="min-h-screen aqva-bg text-white">
      <div className="max-w-[1120px] mx-auto px-6 py-8">
        <header className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <div className="text-2xl font-bold tracking-[0.18em]">AQVA Admin Dashboard</div>
            <div className="text-sm text-white/70 mt-1">Overview of operations</div>
          </div>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            Log out
          </Button>
        </header>

        {error && <div className="text-red-200 mb-4">{error}</div>}

        <div className="grid gap-4">
          <Card>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle>Rider payouts</CardTitle>
                <CardSubtitle>Unpaid delivered orders (weekly)</CardSubtitle>
              </div>

              <div className="flex gap-3">
                <Button variant="ghost" size="sm" onClick={loadRiderStats}>
                  Refresh
                </Button>
                <Button variant="primary" size="sm" onClick={downloadUnpaidOrdersCsv}>
                  Download CSV
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-5">
              <div className="aqva-card-strong p-4">
                <div className="text-xs text-white/60">Deliveries</div>
                <div className="text-2xl font-semibold mt-1">{loadingStats ? '…' : totalUnpaidDeliveries}</div>
              </div>
              <div className="aqva-card-strong p-4">
                <div className="text-xs text-white/60">Total payout</div>
                <div className="text-2xl font-semibold mt-1 text-[var(--aqva-green-light)]">
                  {loadingStats ? '…' : formatMoneyZAR(totalPayoutCents)}
                </div>
              </div>
              <div className="aqva-card-strong p-4">
                <div className="text-xs text-white/60">Riders in list</div>
                <div className="text-2xl font-semibold mt-1">{loadingStats ? '…' : riderStats.length}</div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle>Orders</CardTitle>
                <CardSubtitle>Filter and monitor recent orders</CardSubtitle>
              </div>
              <div className="flex gap-3 items-center">
                <div className="min-w-[220px]">
                  <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button variant="secondary" size="sm" onClick={loadOrders}>
                  Refresh
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-5">
              <div className="aqva-card-strong p-4">
                <div className="text-xs text-white/60">Orders (current filter)</div>
                <div className="text-2xl font-semibold mt-1">{orders.length}</div>
              </div>
              <div className="aqva-card-strong p-4">
                <div className="text-xs text-white/60">Total (current filter)</div>
                <div className="text-2xl font-semibold mt-1 text-[var(--aqva-cyan-light)]">
                  {formatMoneyZAR(totalAmountCents)}
                </div>
              </div>
            </div>

            {loading && <div className="text-sm text-white/70 mt-4">Loading…</div>}

            {!loading && orders.length === 0 && !error && (
              <div className="text-sm text-white/70 mt-4">No orders for this filter.</div>
            )}

            {orders.length > 0 && (
              <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
                <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-black/25 text-xs font-semibold text-white/80">
                  <div className="col-span-5">ID</div>
                  <div className="col-span-3">Created</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-2 text-right">Total</div>
                </div>

                {orders.map((o, idx) => (
                  <div
                    key={o.id}
                    className={[
                      'grid grid-cols-12 gap-2 px-4 py-3 text-sm',
                      idx % 2 === 0 ? 'bg-white/5' : 'bg-white/[0.03]',
                    ].join(' ')}
                  >
                    <div className="col-span-5 font-mono text-xs md:text-sm truncate">{o.id}</div>
                    <div className="col-span-3 text-white/80 text-xs md:text-sm">{formatDateTime(o.created_at)}</div>
                    <div className="col-span-2">{badgeForStatus(o.status)}</div>
                    <div className="col-span-2 text-right font-semibold text-[var(--aqva-cyan-light)]">
                      {formatMoneyZAR((o.total_cents ?? 0))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

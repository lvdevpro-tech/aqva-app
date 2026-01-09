import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Card, CardSubtitle, CardTitle } from '../ui/Card';

type PaymentStatus = 'unpaid' | 'paid' | 'refunded' | string;

type Order = {
  id: string;
  status: string;
  payment_status: PaymentStatus | null;
  total_cents: number;
  created_at: string;
  rider_id: string | null;
  address: {
    id: string;
    label: string | null;
    line1: string | null;
    line2: string | null;
    city: string | null;
    postcode: string | null;
    country: string | null;
  } | null;
  user: {
    id: string;
    full_name: string | null;
    phone: string | null;
  } | null;
};

interface RiderAppProps {
  userId: string;
  onLogout: () => void;
}

const SUPPORT_EMAIL = 'support@aqva.co.za';

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

export function RiderApp({ userId, onLogout }: RiderAppProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [riderId, setRiderId] = useState<string | null>(null);
  const [riderLoading, setRiderLoading] = useState(true);

  const [isOnline, setIsOnline] = useState(false);

  const [geoWatchId, setGeoWatchId] = useState<number | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const formatAddress = (addr: Order['address'] | null) => {
    if (!addr) return 'Address not available';
    const parts = [addr.line1, addr.line2, addr.city, addr.postcode, addr.country].filter(Boolean);
    return parts.join(', ');
  };

  const hasActiveOrderForRider = async (rid: string | null): Promise<boolean> => {
    if (!rid) return false;

    const { data, error } = await supabase
      .from('orders')
      .select('id')
      .eq('rider_id', rid)
      .in('status', ['assigned', 'en_route'])
      .limit(1);

    if (error) {
      console.error(error);
      return false;
    }

    return !!data && data.length > 0;
  };

  const mailtoSupport = (subject: string, body: string) => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = url;
  };

  useEffect(() => {
    const loadRiderProfile = async () => {
      if (!userId) return;

      const { data, error } = await supabase
        .from('riders')
        .select('id, is_online')
        .eq('auth_user_id', userId)
        .single();

      if (error) {
        console.error(error);
        setError('Rider profile not found. Please contact AQVA admin.');
        setRiderLoading(false);
        return;
      }

      setRiderId(data.id);
      setIsOnline(data.is_online);
      setRiderLoading(false);
    };

    loadRiderProfile();
  }, [userId]);

  const loadOrders = async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from('orders')
      .select(`
        id,
        status,
        payment_status,
        total_cents,
        created_at,
        rider_id,
        address:addresses ( id, label, line1, line2, city, postcode, country ),
        user:users ( id, full_name, phone )
      `)
      .in('status', ['pending', 'assigned', 'en_route'])
      .eq('payment_status', 'paid')
      .order('created_at', { ascending: true });

    setLoading(false);

    if (error) {
      console.error(error);
      setError(error.message);
      return;
    }

    const raw = (data ?? []) as any[];

    const normalized: Order[] = raw.map((row) => ({
      id: row.id,
      status: row.status,
      payment_status: row.payment_status ?? null,
      total_cents: row.total_cents,
      created_at: row.created_at,
      rider_id: row.rider_id ?? null,
      address: row.address && Array.isArray(row.address) ? row.address[0] ?? null : row.address ?? null,
      user: row.user ?? null,
    }));

    setOrders(normalized);
  };

  useEffect(() => {
    if (!userId) return;
    loadOrders();
  }, [userId]);

  const toggleOnline = async () => {
    if (!riderId) return;

    const hasActive = orders.some(
      (o) => o.rider_id === riderId && (o.status === 'assigned' || o.status === 'en_route')
    );

    if (hasActive && isOnline) {
      alert('You have an active delivery. Finish it before going offline.');
      return;
    }

    const newStatus = !isOnline;
    setIsOnline(newStatus);

    const { error } = await supabase.from('riders').update({ is_online: newStatus }).eq('id', riderId);

    if (error) {
      console.error(error);
      setError('Unable to change online status.');
    }
  };

  const availableOrders = useMemo(
    () => orders.filter((o) => o.status === 'pending' && !o.rider_id && (o.payment_status ?? '') === 'paid'),
    [orders]
  );

  const myOrders = useMemo(
    () => orders.filter((o) => o.rider_id === riderId && (o.status === 'assigned' || o.status === 'en_route')),
    [orders, riderId]
  );

  const acceptOrder = async (orderId: string) => {
    if (!riderId) return;

    setError(null);
    setUpdatingId(orderId);

    const alreadyHasOrder = await hasActiveOrderForRider(riderId);
    if (alreadyHasOrder) {
      setUpdatingId(null);
      alert('You already have an active delivery. Finish it before taking another one.');
      return;
    }

    const { data, error } = await supabase
      .from('orders')
      .update({
        status: 'assigned',
        rider_id: riderId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .eq('status', 'pending')
      .eq('payment_status', 'paid')
      .is('rider_id', null)
      .select('id')
      .maybeSingle();

    setUpdatingId(null);

    if (error) {
      console.error(error);
      setError(error.message);
      return;
    }

    if (!data) {
      alert('This order is no longer available (taken or not paid).');
      await loadOrders();
      return;
    }

    loadOrders();
  };

  const startDelivery = async (orderId: string) => {
    if (!riderId) return;

    setError(null);
    setUpdatingId(orderId);

    const { error } = await supabase
      .from('orders')
      .update({
        status: 'en_route',
        eta_minutes: 10,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .eq('rider_id', riderId)
      .eq('status', 'assigned');

    setUpdatingId(null);

    if (error) {
      console.error(error);
      setError(error.message);
      return;
    }

    loadOrders();
  };

  const markDelivered = async (orderId: string) => {
    if (!riderId) return;

    setError(null);
    setUpdatingId(orderId);

    const now = new Date().toISOString();

    const { error } = await supabase
      .from('orders')
      .update({
        status: 'delivered',
        delivered_at: now,
        updated_at: now,
      })
      .eq('id', orderId)
      .eq('rider_id', riderId)
      .eq('status', 'en_route');

    setUpdatingId(null);

    if (error) {
      console.error(error);
      setError(error.message);
      return;
    }

    loadOrders();
  };

  const markUndeliverable = async (orderId: string) => {
    if (!riderId) return;

    const confirmFail = window.confirm('Confirm: unable to deliver this order?');
    if (!confirmFail) return;

    setError(null);
    setUpdatingId(orderId);

    const now = new Date().toISOString();

    const { error } = await supabase
      .from('orders')
      .update({
        status: 'failed',
        cancelled_at: now,
        updated_at: now,
      })
      .eq('id', orderId)
      .eq('rider_id', riderId)
      .in('status', ['assigned', 'en_route']);

    setUpdatingId(null);

    if (error) {
      console.error(error);
      setError(error.message);
      return;
    }

    loadOrders();
  };

  useEffect(() => {
    const hasEnRoute = myOrders.some((o) => o.status === 'en_route');

    if (!riderId) return;

    if (!isOnline) {
      if (geoWatchId !== null) {
        navigator.geolocation.clearWatch(geoWatchId);
        setGeoWatchId(null);
      }
      return;
    }

    if (!('geolocation' in navigator)) {
      setGeoError("Geolocation isn't supported by this browser.");
      return;
    }

    if (hasEnRoute && geoWatchId === null) {
      const id = navigator.geolocation.watchPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;

          const { error } = await supabase
            .from('rider_locations')
            .upsert(
              { rider_id: riderId, latitude, longitude, last_updated_at: new Date().toISOString() },
              { onConflict: 'rider_id' }
            );

          if (error) {
            console.error(error);
            setGeoError(error.message);
          } else {
            setGeoError(null);
          }
        },
        (err) => {
          console.error(err);
          setGeoError(err.message);
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
      );

      setGeoWatchId(id);
    }

    if (!hasEnRoute && geoWatchId !== null) {
      navigator.geolocation.clearWatch(geoWatchId);
      setGeoWatchId(null);
    }

    return () => {
      if (geoWatchId !== null) navigator.geolocation.clearWatch(geoWatchId);
    };
  }, [myOrders, geoWatchId, isOnline, riderId]);

  if (riderLoading) {
    return (
      <div className="min-h-screen aqva-bg text-white flex items-center justify-center">
        Loading…
      </div>
    );
  }

  if (!riderId) {
    return (
      <div className="min-h-screen aqva-bg text-white flex items-center justify-center px-6 text-center">
        Your account is not configured as an AQVA rider.
        <br />
        Please contact the administrator.
      </div>
    );
  }

  return (
    <div className="min-h-screen aqva-bg text-white">
      <div className="max-w-[980px] mx-auto px-6 py-8">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-2xl font-bold tracking-[0.18em]">AQVA Rider Dashboard</div>
            <div className="text-sm text-white/70 mt-1">Available orders & your active deliveries</div>
            {geoError && <div className="text-xs text-orange-200 mt-2">Location: {geoError}</div>}
          </div>

          <div className="flex flex-col gap-2 min-w-[220px]">
            <Button variant="ghost" size="sm" onClick={onLogout}>
              Log out
            </Button>

            <button
              onClick={toggleOnline}
              className={[
                'aqva-card-strong px-4 py-3 rounded-2xl border transition flex items-center justify-between',
                isOnline ? 'border-[rgba(0,212,146,0.45)]' : 'border-white/15',
              ].join(' ')}
            >
              <div>
                <div className="text-xs text-white/60">You are currently</div>
                <div className={['text-xl font-bold', isOnline ? 'text-[var(--aqva-green-light)]' : 'text-white/70'].join(' ')}>
                  {isOnline ? 'Online' : 'Offline'}
                </div>
              </div>
              <div
                className={[
                  'w-12 h-7 rounded-full relative transition',
                  isOnline ? 'bg-[var(--aqva-green)]' : 'bg-white/20',
                ].join(' ')}
              >
                <div
                  className={[
                    'w-6 h-6 bg-white rounded-full absolute top-0.5 transition',
                    isOnline ? 'left-6' : 'left-1',
                  ].join(' ')}
                />
              </div>
            </button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                mailtoSupport(
                  'AQVA Rider Support',
                  `Hello AQVA Support,\n\nI need help.\n\nRider auth_user_id: ${userId}\nRider_id: ${riderId}\n\nDetails:\n- `
                )
              }
            >
              Email support
            </Button>
          </div>
        </header>

        {error && <div className="text-red-200 mt-4">{error}</div>}
        {loading && <div className="text-white/70 mt-4">Loading…</div>}

        <div className="grid gap-5 mt-6">
          <Card>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle>Available orders</CardTitle>
                <CardSubtitle>Paid orders only</CardSubtitle>
              </div>
              {!isOnline ? <Badge variant="neutral">Offline</Badge> : <Badge variant="success">Online</Badge>}
            </div>

            {!isOnline && <div className="text-sm text-white/70 mt-4">Go online to accept orders.</div>}
            {isOnline && availableOrders.length === 0 && !loading && (
              <div className="text-sm text-white/70 mt-4">No paid orders available right now.</div>
            )}

            <div className="grid gap-3 mt-5">
              {availableOrders.map((o) => (
                <div key={o.id} className="aqva-card-strong p-4">
                  <div className="flex justify-between gap-4">
                    <div>
                      <div className="text-xs text-white/60">Order</div>
                      <div className="font-mono text-sm">{o.id}</div>
                      <div className="text-xs text-white/60 mt-2">Created: <span className="text-white/85">{formatDateTime(o.created_at)}</span></div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-white/60">Total</div>
                      <div className="text-lg font-semibold text-[var(--aqva-cyan-light)]">{formatMoneyZAR(o.total_cents)}</div>
                      <div className="mt-2">
                        <Badge variant="warning">Pending</Badge>
                      </div>
                    </div>
                  </div>

                  <Button
                    className="w-full mt-4"
                    variant="primary"
                    disabled={!isOnline || updatingId === o.id}
                    onClick={() => isOnline && acceptOrder(o.id)}
                  >
                    {updatingId === o.id ? 'Updating…' : 'Accept order'}
                  </Button>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle>Active Orders</CardTitle>
                <CardSubtitle>Deliveries assigned to you</CardSubtitle>
              </div>
              <Badge variant={myOrders.length > 0 ? 'info' : 'neutral'}>{myOrders.length} active</Badge>
            </div>

            {myOrders.length === 0 && !loading && (
              <div className="aqva-card-strong p-6 mt-4 text-center text-white/70">
                No active orders.
              </div>
            )}

            <div className="grid gap-3 mt-5">
              {myOrders.map((o) => (
                <div key={o.id} className="aqva-card-strong p-4">
                  <div className="flex justify-between gap-4">
                    <div>
                      <div className="text-xs text-white/60">Order</div>
                      <div className="font-mono text-sm">{o.id}</div>
                      <div className="text-xs text-white/60 mt-2">Created: <span className="text-white/85">{formatDateTime(o.created_at)}</span></div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-white/60">Total</div>
                      <div className="text-lg font-semibold text-[var(--aqva-cyan-light)]">{formatMoneyZAR(o.total_cents)}</div>
                      <div className="mt-2">
                        <Badge variant={o.status === 'assigned' ? 'info' : 'success'}>
                          {o.status === 'assigned' ? 'Assigned' : 'En route'}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="aqva-divider my-4" />

                  <div className="text-sm">
                    <div className="text-white/75">
                      Customer: <span className="text-white">{o.user?.full_name || 'AQVA customer'}</span>
                    </div>
                    <div className="text-white/75 mt-1">
                      Phone: <span className="text-white">{o.user?.phone || '—'}</span>
                    </div>
                    <div className="text-white/75 mt-1">
                      Address: <span className="text-white">{formatAddress(o.address)}</span>
                    </div>
                  </div>

                  {o.status === 'assigned' && (
                    <Button className="w-full mt-4" variant="secondary" disabled={updatingId === o.id} onClick={() => startDelivery(o.id)}>
                      {updatingId === o.id ? 'Updating…' : 'Start delivery'}
                    </Button>
                  )}

                  {o.status === 'en_route' && (
                    <>
                      <Button className="w-full mt-4" variant="primary" disabled={updatingId === o.id} onClick={() => markDelivered(o.id)}>
                        {updatingId === o.id ? 'Updating…' : 'Mark delivered'}
                      </Button>

                      <div className="flex gap-3 flex-wrap mt-3">
                        {o.user?.phone && (
                          <a
                            href={`tel:${o.user.phone}`}
                            className="flex-1 min-w-[140px] aqva-card-strong px-4 py-3 rounded-2xl border border-white/15 text-center text-sm hover:border-white/25"
                          >
                            Call customer
                          </a>
                        )}

                        {o.address && (
                          <button
                            type="button"
                            onClick={() => {
                              const query = formatAddress(o.address);
                              if (!query || query === 'Address not available') return;
                              const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
                              window.open(url, '_blank');
                            }}
                            className="flex-1 min-w-[140px] aqva-card-strong px-4 py-3 rounded-2xl border border-white/15 text-sm hover:border-white/25"
                          >
                            Open in Maps
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            mailtoSupport(
                              `AQVA Delivery Support - Order ${o.id}`,
                              `Hello AQVA Support,\n\nI need help on this delivery.\n\nOrder ID: ${o.id}\nRider ID: ${riderId}\nStatus: ${o.status}\nPayment: ${o.payment_status}\n\nCustomer: ${o.user?.full_name ?? '—'}\nCustomer phone: ${o.user?.phone ?? '—'}\nAddress: ${formatAddress(o.address)}\n\nIssue:\n- `
                            )
                          }
                          className="flex-1 min-w-[180px] aqva-card-strong px-4 py-3 rounded-2xl border border-white/15 text-sm hover:border-white/25"
                        >
                          Email support
                        </button>
                      </div>

                      <Button className="w-full mt-3" variant="danger" disabled={updatingId === o.id} onClick={() => markUndeliverable(o.id)}>
                        {updatingId === o.id ? 'Updating…' : 'Cannot deliver'}
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

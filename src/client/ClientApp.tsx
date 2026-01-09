import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet';
import { supabase } from '../lib/supabaseClient';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Card, CardSubtitle, CardTitle } from '../ui/Card';
import { ErrorText, Helper, Input, Label, Select, SuccessText } from '../ui/Field';

type Zone = { id: string; name: string };
type Address = { id: string; label: string; line1: string };
type Pack = { id: string; name: string; units_per_pack: number; price_cents: number };

type OrderStatus = {
  id: string;
  status: string;
  eta_minutes: number | null;
  created_at: string;
  updated_at: string | null;
  rider_id: string | null;
  payment_method: string | null;
  payment_status: string | null;
  total_cents: number | null;
};

type RiderLocation = {
  rider_id: string;
  latitude: number;
  longitude: number;
  last_updated_at: string;
} | null;

type UserProfile = {
  id: string;
  auth_user_id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
};

interface ClientAppProps {
  userId: string;
  onLogout: () => void;
}

interface RiderMapProps {
  latitude: number;
  longitude: number;
  lastUpdatedAt: string;
}

function formatMoneyZAR(cents: number) {
  // Decide one format: "R 99.00"
  return `R ${(cents / 100).toFixed(2)}`;
}

function formatDateTime(d: string) {
  // One format: "12 Dec 2025, 14:05"
  const dt = new Date(d);
  return dt.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function ensureUserProfile(): Promise<UserProfile> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error('Not authenticated.');

  const authUser = authData.user;

  const { data: existing, error: selectError } = await supabase
    .from('users')
    .select('id, auth_user_id, email, full_name, phone')
    .eq('auth_user_id', authUser.id)
    .maybeSingle();

  if (selectError && selectError.code !== 'PGRST116') throw selectError;
  if (existing) return existing as UserProfile;

  const { data: inserted, error: insertError } = await supabase
    .from('users')
    .insert({
      auth_user_id: authUser.id,
      email: authUser.email,
      full_name: (authUser.user_metadata as any)?.full_name ?? null,
      phone: (authUser.user_metadata as any)?.phone ?? null,
    })
    .select('id, auth_user_id, email, full_name, phone')
    .single();

  if (insertError) throw insertError;
  return inserted as UserProfile;
}

function RiderMap({ latitude, longitude, lastUpdatedAt }: RiderMapProps) {
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold">Rider location</div>
        <div className="text-xs text-white/55">Last update: {formatDateTime(lastUpdatedAt)}</div>
      </div>

      <div className="mt-3 h-[280px] w-full overflow-hidden rounded-2xl border border-white/15">
        <MapContainer center={[latitude, longitude]} zoom={14} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap contributors" />
          <CircleMarker center={[latitude, longitude]} radius={10} />
        </MapContainer>
      </div>
    </div>
  );
}

export function ClientApp({ userId, onLogout }: ClientAppProps) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);

  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [selectedPackId, setSelectedPackId] = useState('');
  const [quantity, setQuantity] = useState(1);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [loadingData, setLoadingData] = useState(true);
  const [ordering, setOrdering] = useState(false);

  const [userPublicId, setUserPublicId] = useState<string | null>(null);

  const [showAddressForm, setShowAddressForm] = useState(false);
  const [newAddressLabel, setNewAddressLabel] = useState('');
  const [newAddressLine1, setNewAddressLine1] = useState('');
  const [newAddressCity, setNewAddressCity] = useState('');
  const [newAddressPostcode, setNewAddressPostcode] = useState('');
  const [savingAddress, setSavingAddress] = useState(false);

  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  const [riderLocation, setRiderLocation] = useState<RiderLocation | null>(null);
  const [riderLocationError, setRiderLocationError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoadingData(true);
      setError(null);

      try {
        const profile = await ensureUserProfile();
        setUserPublicId(profile.id);

        const [{ data: zonesData, error: zonesError }, { data: addrData, error: addrError }, { data: packsData, error: packsError }] =
          await Promise.all([
            supabase.from('zones').select('id, name').eq('is_active', true),
            supabase.from('addresses').select('id, label, line1').eq('user_id', profile.id),
            supabase.from('packs').select('id, name, units_per_pack, price_cents').eq('is_active', true),
          ]);

        if (zonesError || addrError || packsError) {
          console.error(zonesError || addrError || packsError);
          setError('Failed to load data. Please check Supabase.');
        } else {
          setZones(zonesData ?? []);
          setAddresses(addrData ?? []);
          setPacks(packsData ?? []);
        }

        const { data: latestOrders, error: latestOrderError } = await supabase
          .from('orders')
          .select('id, status, eta_minutes, created_at, updated_at, rider_id, payment_method, payment_status, total_cents')
          .eq('user_id', profile.id)
          .in('status', ['pending', 'assigned', 'en_route'])
          .order('created_at', { ascending: false })
          .limit(1);

        if (!latestOrderError && latestOrders && latestOrders.length > 0) {
          const latest = latestOrders[0] as OrderStatus;
          setLastOrderId(latest.id);
          setOrderStatus(latest);
        }
      } catch (err: any) {
        console.error(err);
        setError(err?.message ?? 'Unable to load user profile.');
      } finally {
        setLoadingData(false);
      }
    };

    if (userId) loadData();
  }, [userId]);

  useEffect(() => {
    if (!orderStatus || !orderStatus.rider_id) {
      setRiderLocation(null);
      return;
    }

    if (['delivered', 'failed', 'cancelled'].includes(orderStatus.status)) {
      setRiderLocation(null);
      return;
    }

    let isCancelled = false;

    const fetchRiderLocation = async () => {
      const { data, error } = await supabase
        .from('rider_locations')
        .select('rider_id, latitude, longitude, last_updated_at')
        .eq('rider_id', orderStatus.rider_id)
        .order('last_updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (isCancelled) return;

      if (error) {
        console.error(error);
        setRiderLocationError(error.message);
        return;
      }

      if (!data) {
        setRiderLocation(null);
        setRiderLocationError('Rider location is not available yet.');
        return;
      }

      setRiderLocation(data as RiderLocation);
      setRiderLocationError(null);
    };

    fetchRiderLocation();
    const intervalId = window.setInterval(fetchRiderLocation, 5000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [orderStatus?.id, orderStatus?.rider_id, orderStatus?.status]);

  const handleCreateAddress = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!userPublicId) {
      setError('User not initialized.');
      return;
    }

    if (!newAddressLine1.trim()) {
      setError('Please enter at least address line 1.');
      return;
    }

    try {
      setSavingAddress(true);

      const { data, error } = await supabase
        .from('addresses')
        .insert([
          {
            user_id: userPublicId,
            label: newAddressLabel || 'Home',
            line1: newAddressLine1,
            city: newAddressCity || null,
            postcode: newAddressPostcode || null,
            country: 'ZA',
            is_default: addresses.length === 0,
          },
        ])
        .select('id, label, line1')
        .single();

      if (error || !data) {
        console.error(error);
        setError(error?.message || 'Could not create address.');
        return;
      }

      setAddresses((prev) => [...prev, data]);
      setSelectedAddressId(data.id);
      setShowAddressForm(false);

      setNewAddressLabel('');
      setNewAddressLine1('');
      setNewAddressCity('');
      setNewAddressPostcode('');

      setMessage('Address added.');
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? 'Could not create address.');
    } finally {
      setSavingAddress(false);
    }
  };

  const fetchOrderStatus = async (orderId: string) => {
    setLoadingStatus(true);
    const { data, error } = await supabase
      .from('orders')
      .select('id, status, eta_minutes, created_at, updated_at, rider_id, payment_method, payment_status, total_cents')
      .eq('id', orderId)
      .single();

    setLoadingStatus(false);

    if (error) {
      console.error(error);
      setError(error.message);
      return;
    }

    setOrderStatus(data as OrderStatus);
  };

  useEffect(() => {
    if (!lastOrderId) return;

    fetchOrderStatus(lastOrderId);
    const interval = setInterval(() => fetchOrderStatus(lastOrderId), 5000);
    return () => clearInterval(interval);
  }, [lastOrderId]);

  const handleCancelOrder = async () => {
    if (!lastOrderId || !orderStatus) return;

    const ok = window.confirm('Cancel this order?');
    if (!ok) return;

    const { error } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', lastOrderId);

    if (error) {
      console.error(error);
      setError(error.message);
      return;
    }

    fetchOrderStatus(lastOrderId);
  };

  const hasActiveOrder = () => !!orderStatus && ['pending', 'assigned', 'en_route'].includes(orderStatus.status);

  const startStripeCheckout = async (orderId: string) => {
    setError(null);

    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr) {
      console.error(sessionErr);
      setError(`Auth failed. Please retry.`);
      return;
    }

    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setError('You are not signed in anymore. Please log in again.');
      return;
    }

    const { data, error } = await supabase.functions.invoke('create-checkout', {
      body: { order_id: orderId },
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (error) {
      console.error('Checkout invoke error:', error);
      setError('Payment failed, try again.');
      return;
    }

    if (!data?.url) {
      console.error('Checkout data:', data);
      setError('Payment failed, try again.');
      return;
    }

    window.location.assign(data.url);
  };

  const handlePlaceOrder = async () => {
    if (ordering) return;
    setError(null);
    setMessage(null);

    if (hasActiveOrder()) {
      setError('You already have an active order. Please wait for delivery or cancel it.');
      return;
    }

    if (!selectedZoneId || !selectedAddressId || !selectedPackId) {
      setError('Please select a zone, address and pack.');
      return;
    }

    try {
      const q = Number(quantity);
      if (!Number.isFinite(q) || q < 1) {
        setError('Quantity must be at least 1.');
        return;
      }

      setOrdering(true);

      const { data, error } = await supabase.rpc('create_order', {
        p_address_id: selectedAddressId,
        p_zone_id: selectedZoneId,
        p_pack_id: selectedPackId,
        p_quantity: q,
        p_payment_method: 'card',
      });

      if (error) {
        console.error(error);
        setError('Order failed. Please retry.');
        return;
      }

      const orderId = data as string;
      await fetchOrderStatus(orderId);
      setLastOrderId(orderId);

      setMessage('Redirecting to secure payment…');
      await startStripeCheckout(orderId);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? 'Order failed.');
    } finally {
      setOrdering(false);
    }
  };

  const statusBadgeVariant = (status: string) => {
    switch (status) {
      case 'pending':
        return 'warning';
      case 'assigned':
        return 'info';
      case 'en_route':
        return 'info';
      case 'delivered':
        return 'success';
      case 'failed':
      case 'cancelled':
        return 'error';
      default:
        return 'neutral';
    }
  };

  const getStatusTitle = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Order received';
      case 'assigned':
        return 'Rider assigned';
      case 'en_route':
        return 'On the way';
      case 'delivered':
        return 'Delivered';
      case 'failed':
        return 'Delivery failed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  };

  const getStatusDescription = (status: string, etaMinutes: number | null) => {
    switch (status) {
      case 'pending':
        return 'We received your order. A rider will accept it shortly.';
      case 'assigned':
        return 'A rider is assigned and preparing your delivery.';
      case 'en_route':
        return etaMinutes ? `Your rider is on the way. ETA ~ ${etaMinutes} min.` : 'Your rider is on the way.';
      case 'delivered':
        return 'Delivered. Store bottles in a cool place away from sunlight.';
      case 'failed':
        return 'The rider could not complete the delivery (address issue or customer unavailable).';
      case 'cancelled':
        return 'Order cancelled. You can place a new order anytime.';
      default:
        return '';
    }
  };

  return (
    <div className="min-h-screen aqva-bg text-white">
      <div className="max-w-[760px] mx-auto px-6 py-8">
        <header className="flex items-center justify-between gap-4 mb-3">
          <div>
            <div className="text-3xl font-bold tracking-[0.2em]">AQVA</div>
            <div className="text-sm text-white/70 mt-1">Safe Water Delivered Fast – Johannesburg only</div>
          </div>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            Log out
          </Button>
        </header>

        <div className="grid gap-4 mt-6">
          <Card>
            <CardTitle>Where are you?</CardTitle>
            <CardSubtitle>Select your delivery zone</CardSubtitle>

            <div className="mt-4">
              <Label>Choose your zone</Label>
              <Select value={selectedZoneId} onChange={(e) => setSelectedZoneId(e.target.value)}>
                <option value="">Select a zone</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="mt-4 aqva-divider pt-4 text-sm text-white/70">
              Delivery in ~20 minutes on average • Fast and reliable service
            </div>
          </Card>

          <Card>
            <CardTitle>Select Delivery Address</CardTitle>
            <CardSubtitle>Choose where to deliver your water</CardSubtitle>

            <div className="mt-4">
              <Label>Address</Label>
              <Select value={selectedAddressId} onChange={(e) => setSelectedAddressId(e.target.value)}>
                <option value="">Select an address</option>
                {addresses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} — {a.line1}
                  </option>
                ))}
              </Select>
              <Helper>You can add a new address below.</Helper>

              {!showAddressForm && (
                <Button variant="ghost" className="w-full mt-4" onClick={() => setShowAddressForm(true)}>
                  + Add new address
                </Button>
              )}

              {showAddressForm && (
                <form onSubmit={handleCreateAddress} className="mt-4 grid gap-3 aqva-card-strong p-4">
                  <Input placeholder="Label (Home, Office…)" value={newAddressLabel} onChange={(e) => setNewAddressLabel(e.target.value)} />
                  <Input required placeholder="Address line 1" value={newAddressLine1} onChange={(e) => setNewAddressLine1(e.target.value)} />
                  <Input placeholder="City" value={newAddressCity} onChange={(e) => setNewAddressCity(e.target.value)} />
                  <Input placeholder="Postcode" value={newAddressPostcode} onChange={(e) => setNewAddressPostcode(e.target.value)} />

                  <div className="flex gap-3">
                    <Button type="submit" variant="primary" className="flex-1" disabled={savingAddress}>
                      {savingAddress ? 'Saving…' : 'Save'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="flex-1"
                      onClick={() => {
                        setShowAddressForm(false);
                        setNewAddressLabel('');
                        setNewAddressLine1('');
                        setNewAddressCity('');
                        setNewAddressPostcode('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </Card>

          <Card>
            <CardTitle>Select Quantity</CardTitle>
            <CardSubtitle>How many packs do you need?</CardSubtitle>

            <div className="mt-4">
              <Label>Pack</Label>
              <Select value={selectedPackId} onChange={(e) => setSelectedPackId(e.target.value)}>
                <option value="">Select a pack</option>
                {packs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatMoneyZAR(p.price_cents)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 aqva-card-strong p-4">
              <div className="text-sm text-white/80">Quantity</div>
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
                  −
                </Button>
                <div className="min-w-[32px] text-center font-semibold">{quantity}</div>
                <Button variant="secondary" size="sm" onClick={() => setQuantity((q) => q + 1)}>
                  +
                </Button>
              </div>
            </div>

            <div className="mt-4 aqva-divider pt-4 text-sm text-white/75">
              Payment is online only (card).
            </div>
          </Card>

          {loadingData && <div className="text-sm text-white/70">Loading…</div>}
          {error && <ErrorText>{error}</ErrorText>}
          {message && <SuccessText>{message}</SuccessText>}

          <Button variant="primary" size="lg" className="w-full" disabled={ordering} onClick={handlePlaceOrder}>
            {ordering ? 'Placing order…' : 'Confirm Order'}
          </Button>

          {lastOrderId && (
            <Card className="mt-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>Order Status</CardTitle>
                  <div className="text-xs text-white/55 mt-2 font-mono">Order ID: {lastOrderId}</div>
                </div>
                {orderStatus?.status && <Badge variant={statusBadgeVariant(orderStatus.status)}>{getStatusTitle(orderStatus.status)}</Badge>}
              </div>

              {loadingStatus && !orderStatus && <div className="text-sm text-white/70 mt-4">Loading…</div>}

              {orderStatus && (
                <div className="mt-4 grid gap-3">
                  <div className="aqva-card-strong p-4">
                    <div className="text-sm text-white/70">Estimated arrival</div>
                    <div className="text-2xl font-semibold mt-1">
                      {orderStatus.eta_minutes != null ? `${orderStatus.eta_minutes} min` : '—'}
                    </div>
                    <div className="text-sm text-white/75 mt-1">{getStatusDescription(orderStatus.status, orderStatus.eta_minutes)}</div>
                  </div>

                  <div className="text-sm text-white/70">
                    Created: <span className="text-white">{formatDateTime(orderStatus.created_at)}</span>
                  </div>

                  {['pending', 'assigned', 'en_route'].includes(orderStatus.status) && (
                    <Button variant="danger" className="w-full" onClick={handleCancelOrder}>
                      Cancel order
                    </Button>
                  )}

                  {orderStatus.status === 'delivered' && (
                    <SuccessText>Delivered. Thank you for using AQVA.</SuccessText>
                  )}
                  {orderStatus.status === 'failed' && (
                    <ErrorText>Delivery failed. Please contact support or place a new order.</ErrorText>
                  )}
                  {orderStatus.status === 'cancelled' && <ErrorText>Order cancelled.</ErrorText>}

                  {['assigned', 'en_route'].includes(orderStatus.status) && !riderLocation && !riderLocationError && (
                    <div className="text-xs text-white/55">Waiting for rider GPS…</div>
                  )}

                  {riderLocationError && <ErrorText>Rider location: {riderLocationError}</ErrorText>}

                  {riderLocation && (
                    <RiderMap latitude={riderLocation.latitude} longitude={riderLocation.longitude} lastUpdatedAt={riderLocation.last_updated_at} />
                  )}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

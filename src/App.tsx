// src/App.tsx
import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './lib/supabaseClient';
import { Button } from './ui/Button';

import { AuthScreen } from './auth/AuthScreen';
import { ClientApp } from './client/ClientApp';
import { RiderApp } from './rider/RiderApp';
import { AdminApp } from './admin/AdminApp';

type Role = 'client' | 'rider' | 'admin' | null;

// --- Helper: is_admin RPC with timeout (avoid blocking UI) ---
async function safeIsAdminRpc(timeoutMs = 1500): Promise<{ data: any; error: any }> {
  const rpcPromise = supabase.rpc('is_admin');
  const timeoutPromise = new Promise<{ data: any; error: any }>((resolve) =>
    setTimeout(() => resolve({ data: null, error: null }), timeoutMs)
  );

  return Promise.race([rpcPromise, timeoutPromise]) as Promise<{ data: any; error: any }>;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role>(null);

  const [loadingSession, setLoadingSession] = useState(true);
  const [resolvingRole, setResolvingRole] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const path = window.location.pathname;

if (path === '/payment/success') {
  return (
    <div className="min-h-screen aqva-bg text-white px-6 py-10">
      <div className="max-w-[520px] mx-auto">
        <div className="text-3xl font-bold tracking-[0.15em]">AQVA</div>

        <div className="mt-6 aqva-card p-6">
          <h1 className="text-2xl font-semibold">Paiement confirmé</h1>
          <p className="text-white/70 mt-2">
            Merci. Votre paiement a été reçu. Vous pouvez revenir à l’application.
          </p>

          <Button
            className="w-full mt-5"
            size="lg"
            variant="primary"
            onClick={() => (window.location.href = '/')}
          >
            Retour à l’accueil
          </Button>
        </div>
      </div>
    </div>
  );
}


  if (path === '/payment/cancel') {
  return (
    <div className="min-h-screen aqva-bg text-white px-6 py-10">
      <div className="max-w-[520px] mx-auto">
        <div className="text-3xl font-bold tracking-[0.15em]">AQVA</div>

        <div className="mt-6 aqva-card p-6">
          <h1 className="text-2xl font-semibold">Paiement annulé</h1>
          <p className="text-white/70 mt-2">
            Le paiement a été annulé. Vous pouvez réessayer.
          </p>

          <Button
            className="w-full mt-5"
            size="lg"
            variant="danger"
            onClick={() => (window.location.href = '/')}
          >
            Retour
          </Button>
        </div>
      </div>
    </div>
  );
}


  // --- Resolve role for a given user ---
  const resolveRole = async (user: User) => {
    setResolvingRole(true);
    setError(null);

    try {
      // 1) Admin?
      const { data: isAdmin, error: adminError } = await safeIsAdminRpc();

      if (adminError) {
        console.error('is_admin error', adminError);
      } else if (isAdmin === true) {
        setRole('admin');
        return;
      }

      // 2) Rider?
      const { data: riderRow, error: riderError } = await supabase
        .from('riders')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (riderError && riderError.code !== 'PGRST116') {
        console.error('rider check error', riderError);
      } else if (riderRow) {
        setRole('rider');
        return;
      }

      // 3) Default: client
      setRole('client');
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? 'Unable to detect user role.');
      setRole('client');
    } finally {
      setResolvingRole(false);
    }
  };

  // --- Init + auth change listener ---
  useEffect(() => {
    const init = async () => {
      setLoadingSession(true);
      setError(null);

      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.error('getSession error', error);

        const currentSession = data?.session ?? null;
        setSession(currentSession);

        if (currentSession?.user) {
          // fire-and-forget
          resolveRole(currentSession.user);
        } else {
          setRole(null);
        }
      } catch (e: any) {
        console.error('init() error', e);
        setError(e?.message ?? 'Unable to load session.');
        setSession(null);
        setRole(null);
      } finally {
        setLoadingSession(false);
      }
    };

    init();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);

      if (!newSession) {
        setRole(null);
        return;
      }

      // fire-and-forget
      resolveRole(newSession.user);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // --- Global logout ---
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setRole(null);
  };

  // 1) Session loading (getSession only)
  if (loadingSession) {
  return (
    <div className="min-h-screen aqva-bg text-white flex items-center justify-center px-6">
      <div className="aqva-card p-6 text-center max-w-[520px] w-full">
        <div className="text-xl font-semibold">Chargement de votre session AQVA…</div>
        <div className="text-white/60 text-sm mt-2">Veuillez patienter.</div>
      </div>
    </div>
  );
}


  // 2) No session → Auth screen
  if (!session) {
    return <AuthScreen />;
  }

  // 3) Session ok, role resolving
 if (resolvingRole || !role) {
  return (
    <div className="min-h-screen aqva-bg text-white flex items-center justify-center px-6">
      <div className="aqva-card p-6 text-center max-w-[520px] w-full">
        <div className="text-xl font-semibold">Configuration de votre espace AQVA…</div>
        <div className="text-white/60 text-sm mt-2">Détection du profil en cours.</div>
      </div>
    </div>
  );
}


  const userId = session.user.id;

  return (
    <>
      {error && (
        <div
          style={{
            position: 'fixed',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#b91c1c',
            color: 'white',
            padding: '6px 12px',
            borderRadius: 999,
            fontSize: 12,
            zIndex: 50,
          }}
        >
          {error}
        </div>
      )}

      {role === 'admin' && <AdminApp userId={userId} onLogout={handleLogout} />}
      {role === 'rider' && <RiderApp userId={userId} onLogout={handleLogout} />}
      {role === 'client' && <ClientApp userId={userId} onLogout={handleLogout} />}
    </>
  );
}

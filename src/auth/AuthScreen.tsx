import type { FormEvent } from 'react';
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ErrorText, Input, Label, SuccessText } from '../ui/Field';

type Mode = 'login' | 'signup';

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setMessage('Signed in. Redirecting…');
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName, phone },
          },
        });
        if (error) throw error;
        setMessage('Account created. If you are not signed in automatically, log in with your credentials.');
      }
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen aqva-bg text-white flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-[440px]">
        <div className="mb-6">
          <div className="text-4xl font-extrabold tracking-[0.35em]">AQVA</div>
          <div className="text-sm text-white/70 mt-2">
            Safe Water Delivered Fast – Johannesburg only
          </div>
        </div>

        <Card className="p-6">
          <div className="flex p-1 rounded-full bg-black/25 border border-white/10 mb-5">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={[
                'flex-1 py-2 rounded-full text-sm font-semibold transition',
                mode === 'login' ? 'bg-[var(--aqva-cyan)] text-white' : 'text-white/70 hover:text-white',
              ].join(' ')}
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => setMode('signup')}
              className={[
                'flex-1 py-2 rounded-full text-sm font-semibold transition',
                mode === 'signup' ? 'bg-[var(--aqva-cyan)] text-white' : 'text-white/70 hover:text-white',
              ].join(' ')}
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4">
            {mode === 'signup' && (
              <>
                <div>
                  <Label>Full name</Label>
                  <Input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="John Mbeki"
                  />
                </div>

                <div>
                  <Label>Phone (WhatsApp)</Label>
                  <Input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+27 …"
                  />
                </div>
              </>
            )}

            <div>
              <Label>Email</Label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
              />
            </div>

            <div>
              <Label>Password</Label>
              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && <ErrorText>{error}</ErrorText>}
            {message && <SuccessText>{message}</SuccessText>}

            <Button type="submit" disabled={loading} variant="primary" size="lg" className="w-full mt-2">
              {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
            </Button>

            <div className="text-xs text-white/55 mt-2">
              Riders use the same screen. Rider accounts are pre-configured by AQVA admin.
            </div>
          </form>
        </Card>

        <div className="text-center text-xs text-white/45 mt-6">
          Pilot Phase 2025 • Johannesburg
        </div>
      </div>
    </div>
  );
}

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { BackendConnectionStatus } from '../config/supabaseConfig';
import { detectUnsafeServiceRoleJwt, mapSupabaseErrorPt } from '../utils/formatters';

interface ResolvedPublicConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

let cachedConfig: ResolvedPublicConfig | null = null;
let cachedClient: SupabaseClient | null = null;

function isPlausibleUrl(url: string): boolean {
  if (!url || url.includes('MY_')) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export async function resolveSupabasePublicConfig(): Promise<ResolvedPublicConfig> {
  if (cachedConfig) return cachedConfig;

  let supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  let supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  if ((!supabaseUrl || !supabaseAnonKey) && typeof window !== 'undefined') {
    try {
      const resp = await fetch('/api/public-config', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (resp.ok) {
        const data = (await resp.json()) as Partial<ResolvedPublicConfig>;
        if (!supabaseUrl && data.supabaseUrl) {
          supabaseUrl = data.supabaseUrl.trim();
        }
        if (!supabaseAnonKey && data.supabaseAnonKey) {
          supabaseAnonKey = data.supabaseAnonKey.trim();
        }
      }
    } catch {
      // Ignora falha silenciosa de fallback quando servido estaticamente sem API Express
    }
  }

  if (isPlausibleUrl(supabaseUrl) && supabaseAnonKey && !supabaseAnonKey.includes('MY_')) {
    cachedConfig = { supabaseUrl, supabaseAnonKey };
  }
  return { supabaseUrl, supabaseAnonKey };
}

export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (cachedClient) return cachedClient;

  const { supabaseUrl, supabaseAnonKey } = await resolveSupabasePublicConfig();
  if (!isPlausibleUrl(supabaseUrl) || !supabaseAnonKey || supabaseAnonKey.includes('MY_')) {
    return null;
  }

  if (detectUnsafeServiceRoleJwt(supabaseAnonKey)) {
    return null;
  }

  cachedClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'bercali-admin-supabase-auth',
    },
  });

  return cachedClient;
}

/**
 * Executa um teste real de comunicação ao Supabase Auth e PostgreSQL.
 * Nunca assume que a base de dados está ligada apenas porque as variáveis existem.
 */
export async function probeSupabaseConnection(): Promise<BackendConnectionStatus> {
  const { supabaseUrl, supabaseAnonKey } = await resolveSupabasePublicConfig();
  const urlValid = isPlausibleUrl(supabaseUrl);
  const keyPresent = Boolean(supabaseAnonKey && !supabaseAnonKey.includes('MY_'));

  if (keyPresent && detectUnsafeServiceRoleJwt(supabaseAnonKey)) {
    return {
      state: 'security_blocked',
      isDatabaseConnected: false,
      supabaseUrlConfigured: urlValid,
      supabaseAnonKeyConfigured: false,
      summaryLabel: 'Bloqueio de Segurança · Chave Privada Detetada',
      detailMessage:
        'Foi detetada uma chave privilegiada (service_role) em VITE_SUPABASE_ANON_KEY. Por segurança, o cliente foi bloqueado. Substitui-a pela chave pública anon/publishable do projeto Supabase.',
    };
  }

  if (!urlValid || !keyPresent) {
    return {
      state: 'missing_env',
      isDatabaseConnected: false,
      supabaseUrlConfigured: urlValid,
      supabaseAnonKeyConfigured: keyPresent,
      summaryLabel: 'Configuração Pendente · Variáveis Supabase Ausentes',
      detailMessage:
        'Define VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nas variáveis de ambiente do projeto e recarrega a aplicação para ligar ao Supabase.',
    };
  }

  const client = await getSupabaseClient();
  if (!client) {
    return {
      state: 'missing_env',
      isDatabaseConnected: false,
      supabaseUrlConfigured: urlValid,
      supabaseAnonKeyConfigured: keyPresent,
      summaryLabel: 'Cliente Supabase Não Inicializado',
      detailMessage: 'Verifica o formato de VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.',
    };
  }

  try {
    const { error: authErr } = await client.auth.getSession();
    if (authErr) {
      return {
        state: 'connection_error',
        isDatabaseConnected: false,
        supabaseUrlConfigured: true,
        supabaseAnonKeyConfigured: true,
        summaryLabel: 'Erro de Ligação ao Supabase Auth',
        detailMessage: mapSupabaseErrorPt(authErr),
      };
    }

    // Sonda real GET (limit 1) para detetar PGRST205 quando as tabelas ainda não foram criadas no Supabase
    const { error: tableErr } = await client
      .from('store_settings')
      .select('id')
      .limit(1);

    if (tableErr) {
      const code = String((tableErr as { code?: string }).code || '');
      const msg = String(tableErr.message || '').toLowerCase();

      if (
        code === '42P01' ||
        code === 'PGRST205' ||
        msg.includes('could not find the table') ||
        msg.includes('does not exist')
      ) {
        return {
          state: 'schema_missing',
          isDatabaseConnected: false,
          supabaseUrlConfigured: true,
          supabaseAnonKeyConfigured: true,
          summaryLabel: 'Supabase Ligado · Migrações SQL Pendentes',
          detailMessage:
            'A comunicação com o projeto Supabase foi validada, mas as tabelas ainda não existem. Executa os 3 ficheiros de /supabase/migrations no SQL Editor do Supabase.',
        };
      }

      if (msg.includes('invalid api key') || msg.includes('jwt') || code === 'PGRST301') {
        return {
          state: 'connection_error',
          isDatabaseConnected: false,
          supabaseUrlConfigured: true,
          supabaseAnonKeyConfigured: true,
          summaryLabel: 'Credenciais Supabase Inválidas',
          detailMessage:
            'O servidor Supabase rejeitou a chave configurada em VITE_SUPABASE_ANON_KEY. Confirma se copiaste a chave anon public correta do mesmo projeto.',
        };
      }

      // Nota: erro 42501 (RLS denied sem sessão autenticada) confirma que a tabela EXISTE e que o RLS está ativo!
      if (code !== '42501') {
        return {
          state: 'connection_error',
          isDatabaseConnected: false,
          supabaseUrlConfigured: true,
          supabaseAnonKeyConfigured: true,
          summaryLabel: 'Erro ao Consultar PostgreSQL',
          detailMessage: mapSupabaseErrorPt(tableErr),
        };
      }
    }

    return {
      state: 'ready',
      isDatabaseConnected: true,
      supabaseUrlConfigured: true,
      supabaseAnonKeyConfigured: true,
      summaryLabel: 'Supabase PostgreSQL + RLS Ativos',
      detailMessage:
        'Ligação real verificada com Supabase Auth, PostgreSQL e políticas Row Level Security.',
    };
  } catch (err: unknown) {
    return {
      state: 'connection_error',
      isDatabaseConnected: false,
      supabaseUrlConfigured: true,
      supabaseAnonKeyConfigured: true,
      summaryLabel: 'Falha de Comunicação com Supabase',
      detailMessage: mapSupabaseErrorPt(err),
    };
  }
}

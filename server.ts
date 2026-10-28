import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  /**
   * Fornece apenas configuração pública do cliente Supabase (URL + chave anónima pública)
   * caso as variáveis tenham sido definidas no ambiente de execução do servidor.
   * NUNCA expõe chaves service_role nem credenciais privadas.
   */
  app.get('/api/public-config', (_req, res) => {
    const supabaseUrl = (
      process.env.VITE_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      ''
    ).trim();
    const rawKey = (
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      ''
    ).trim();

    const isSecretKey = rawKey.startsWith('sb_secret_');
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      supabaseUrl,
      supabaseAnonKey: isSecretKey ? '' : rawKey,
    });
  });

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'bercali-admin-panel' });
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Bercali Store Admin Server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

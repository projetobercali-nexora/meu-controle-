# Bercali Store — Painel Administrativo

Centro de controlo administrativo independente da **Bercali Store**, ligado em tempo real ao **Supabase** (PostgreSQL + Auth + Storage + Realtime), preparado como **Progressive Web App (PWA)** instalável e pronto para publicação contínua via **GitHub + Vercel**.

---

## Funcionalidades Principais

- **Dashboard, Relatórios e Auditoria**: Métricas reais em Kwanzas (`Kz`) separando encomendas recebidas/pendentes de vendas confirmadas e entregues.
- **Gestão de Catálogo e Loja Online**: Produtos, categorias, imagens no bucket `product-media`, destaques, ordenação e controlo de estado da loja (`store_settings`).
- **Encomendas em Tempo Real + Som Configurável**: Subscrição **Supabase Realtime** (`INSERT` em `public.orders`) respeitando RLS e RBAC, com sino de notificações, avisos instantâneos (toast), notificações nativas em segundo plano, reconexão automática, recuperação de encomendas perdidas ao regressar à app e 5 melodias sintetizadas via Web Audio API.
- **CRM Comercial & WhatsApp Angolano**: Acompanhamento de clientes, etiquetas, notas, tarefas automáticas e validação de WhatsApp no formato angolano (`+244` + 9 dígitos).
- **Marketing & Meta Pixel**: Validação estrita do identificador numérico (15 ou 16 dígitos) e persistência em `marketing_settings`.
- **PWA Segura**: Instalável no telemóvel e computador (`manifest.webmanifest`), com *Service Worker* exclusivo para o *shell* estático da aplicação — **nunca guarda em cache pedidos ao Supabase** (`auth`, `rest`, `realtime`, `storage`).

---

## 1. Publicar o Projeto no GitHub

1. Confirma que o ficheiro `.gitignore` está presente na raiz (ignora `node_modules/`, `dist/` e todos os ficheiros `.env*`, exceto `.env.example`).
2. **Nunca** envies chaves secretas nem ficheiros `.env` para o repositório.
3. Inicializa o repositório e envia o código para o GitHub:

```bash
git init
git add .
git commit -m "chore: preparar Bercali Store Painel Administrativo para Vercel e PWA"
git branch -M main
git remote add origin https://github.com/SEU_UTILIZADOR/bercali-admin.git
git push -u origin main
```

---

## 2. Importar e Publicar na Vercel

1. Acede a [vercel.com/new](https://vercel.com/new) e importa o repositório GitHub criado no passo anterior.
2. Confirma as definições de compilação (*Build & Output Settings*):
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
3. O ficheiro `vercel.json` na raiz já configura automaticamente o *rewrite* de SPA (todas as rotas encaminham para `/index.html`) e os cabeçalhos de atualização imediata do `sw.js` e `manifest.webmanifest`.

---

## 3. Configurar as Variáveis de Ambiente na Vercel

Em **Vercel > Project Settings > Environment Variables**, adiciona apenas as duas variáveis públicas do projeto Supabase (para os ambientes *Production*, *Preview* e *Development*):

| Variável | Onde obter no Supabase | Obrigatória |
| :--- | :--- | :---: |
| `VITE_SUPABASE_URL` | `Project Settings > API > Project URL` | Sim |
| `VITE_SUPABASE_ANON_KEY` | `Project Settings > API > Project API keys > anon public` | Sim |

> **Regra Crítica de Segurança**: **NUNCA** uses a chave `service_role` (nem chaves iniciadas por `sb_secret_`) no frontend ou na Vercel com prefixo `VITE_`. O painel utiliza exclusivamente a chave pública `anon` protegida por **Row Level Security (RLS)** e bloqueia automaticamente a inicialização caso detete uma chave `service_role`.

Após guardar as variáveis na Vercel, clica em **Deploy** (ou **Redeploy**).

---

## 4. Configurar o Domínio da Vercel no Supabase Auth (Obrigatório)

Para que o início de sessão administrativo, a renovação de sessão e a recuperação de palavra-passe funcionem corretamente em produção:

1. Abre o painel do **Supabase** do projeto.
2. Acede a **Authentication > URL Configuration**.
3. Em **Site URL**, define o domínio principal atribuído pela Vercel (ou o teu subdomínio personalizado), por exemplo:
   ```text
   https://bercali-admin.vercel.app
   ```
4. Em **Redirect URLs**, adiciona o domínio de produção (e URLs de preview, se aplicável):
   ```text
   https://bercali-admin.vercel.app/**
   ```
5. Clica em **Save**.

---

## 5. Migrações SQL e Ativação do Realtime em `orders`

As migrações SQL versionadas encontram-se em `/supabase/migrations`:

1. `20261024000001_core_tables_and_constraints.sql` — 14 tabelas base e restrições.
2. `20261024000002_functions_triggers_and_crm_automation.sql` — Funções RPC, triggers e automação CRM.
3. `20261024000003_rls_and_storage_policies.sql` — Políticas Row Level Security (RLS) e bucket `product-media`.
4. `20261025000004_storefront_integration.sql` — Integração segura com a Loja Online e checkout RPC `create_storefront_order`.
5. `20261028000005_enable_orders_realtime.sql` — **Adiciona `public.orders` à publicação `supabase_realtime`** para notificações instantâneas de novas encomendas no painel.

Se já executaste as migrações anteriores, basta executar o ficheiro `supabase/migrations/20261028000005_enable_orders_realtime.sql` no **Supabase > SQL Editor** para ativar a emissão de eventos `INSERT` em tempo real na tabela `orders`.

---

## 6. Desenvolvimento Local

1. Copia `.env.example` para `.env` e preenche `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
2. Instala as dependências:
   ```bash
   npm install
   ```
3. Inicia o servidor de desenvolvimento na porta `3000`:
   ```bash
   npm run dev
   ```
4. Para gerar a compilação de produção (`dist/`):
   ```bash
   npm run build
   ```

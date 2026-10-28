import React from 'react';
import {
  BookOpen,
  CheckCircle2,
  Database,
  ExternalLink,
  Palette,
  ShieldCheck,
} from 'lucide-react';
import {
  BERCALI_BRAND_MANUAL_PDF,
  BercaliSpeedLines,
} from '../components/BrandLogo';
import { SQL_MIGRATION_FILES } from '../config/supabaseConfig';

export const HelpSupportPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-brand font-extrabold text-2xl text-[#0A0A0A] tracking-tight">
            Ajuda, Guia Operacional e Base de Dados
          </h1>
          <p className="text-sm text-[#525252] mt-1">
            Documentação operacional da equipa, identidade oficial da marca e instruções de migração Supabase
          </p>
        </div>

        <a
          href={BERCALI_BRAND_MANUAL_PDF}
          target="_blank"
          rel="noreferrer"
          className="btn-bercali-primary px-4 py-2.5 rounded-[10px] text-xs inline-flex items-center gap-2 whitespace-nowrap self-start"
        >
          <BookOpen className="w-4 h-4" />
          <span>Abrir Manual de Marca Oficial (PDF)</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Operational Rules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
        <div className="bg-white border border-[#E5E5E5] rounded-xl p-6 space-y-3">
          <div className="flex items-center gap-2 text-[#FF8A00]">
            <ShieldCheck className="w-4 h-4" />
            <h2 className="font-brand font-bold text-base text-[#0A0A0A]">
              Regras Operacionais da Equipa Bercali
            </h2>
          </div>
          <ul className="space-y-2.5 text-[#525252] leading-relaxed">
            <li>
              <strong className="text-[#0A0A0A]">Separação independente da loja:</strong> Este projeto é exclusivamente o painel administrativo. Não inclui catálogo público, carrinho nem checkout de clientes.
            </li>
            <li>
              <strong className="text-[#0A0A0A]">Confirmação de vendas via WhatsApp:</strong> Pedidos recebidos pelo WhatsApp iniciam como <em>Recebida</em> ou <em>Pendente de confirmação</em>. Só contam como vendas confirmadas após validação real.
            </li>
            <li>
              <strong className="text-[#0A0A0A]">Preservação de histórico:</strong> Quando um artigo sai de linha, utiliza <em>Arquivar</em> para manter a integridade de <span className="font-mono">order_items</span> e relatórios históricos.
            </li>
            <li>
              <strong className="text-[#0A0A0A]">Deduplicação automática no CRM:</strong> Todos os números angolanos são convertidos para <span className="font-mono">+2449XXXXXXXX</span> tanto no cliente como na função SQL <span className="font-mono">normalize_angola_phone()</span>.
            </li>
          </ul>
        </div>

        <div className="bg-white border border-[#E5E5E5] rounded-xl p-6 space-y-3">
          <div className="flex items-center gap-2 text-[#FF8A00]">
            <Palette className="w-4 h-4" />
            <h2 className="font-brand font-bold text-base text-[#0A0A0A]">
              Resumo do Manual de Marca Bercali Store (v1.0)
            </h2>
          </div>
          <BercaliSpeedLines />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            {[
              { name: 'Laranja Bercali', hex: '#FF8A00', swatch: 'bg-[#FF8A00]' },
              { name: 'Amarelo Âmbar', hex: '#FFC400', swatch: 'bg-[#FFC400]' },
              { name: 'Preto Profundo', hex: '#0A0A0A', swatch: 'bg-[#0A0A0A]' },
              { name: 'Cinza Claro', hex: '#F4F4F4', swatch: 'bg-[#F4F4F4] border border-[#D4D4D4]' },
            ].map((c) => (
              <div key={c.hex} className="p-2.5 rounded-lg border border-[#E5E5E5]">
                <div className={`h-6 rounded mb-1.5 ${c.swatch}`} />
                <p className="font-semibold text-[#0A0A0A] text-[11px]">{c.name}</p>
                <p className="font-mono text-[10px] text-[#525252]">{c.hex}</p>
              </div>
            ))}
          </div>
          <p className="text-[#525252] leading-relaxed pt-1">
            <strong className="text-[#0A0A0A]">Tipografia oficial:</strong> <em>Montserrat</em> (títulos, botões e métricas em Kwanzas) combinada com <em>Poppins</em> (texto corrido, menus e tabelas).
          </p>
          <p className="text-[#525252] leading-relaxed">
            <strong className="text-[#0A0A0A]">Slogan oficial:</strong> <em>"O futuro das compras começa aqui."</em>
          </p>
        </div>
      </div>

      {/* Versioned SQL Migrations Reference */}
      <div className="bg-[#0A0A0A] text-white rounded-xl p-6 space-y-4 text-xs">
        <div className="flex items-center gap-2 text-[#FFC400]">
          <Database className="w-4 h-4" />
          <h2 className="font-brand font-bold text-base">
            Ordem de Execução das Migrações SQL no Supabase
          </h2>
        </div>
        <p className="text-[#D4D4D4] leading-relaxed">
          Ficheiros SQL incluídos em <span className="font-mono text-[#FFC400]">/supabase/migrations</span> para execução no <strong>Supabase SQL Editor</strong> (sem eliminar tabelas ou produtos já existentes):
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-[#D4D4D4]">
          {SQL_MIGRATION_FILES.map((file, idx) => (
            <div key={file} className="flex items-start gap-2 p-3.5 rounded-lg bg-[#1A1A1A] border border-[#262626]">
              <CheckCircle2 className="w-4 h-4 text-[#FF8A00] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-semibold text-white">Ficheiro {idx + 1}</p>
                <p className="font-mono text-[11px] text-[#A3A3A3] break-all mt-1">{file}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="p-3.5 rounded-lg bg-[#1A1A1A] border border-[#262626] text-[#D4D4D4] space-y-1.5">
          <p className="font-semibold text-white">
            Integração com a Loja Online e Primeiro Superadministrador:
          </p>
          <p className="leading-relaxed">
            Para ativar o checkout público validado (<span className="font-mono text-[#FFC400]">create_storefront_order</span>), destaques de produtos e leitura pública de <span className="font-mono text-[#FFC400]">store_settings</span>, executa <span className="font-mono text-[#FFC400]">supabase/migrations/20261025000004_storefront_integration.sql</span> no SQL Editor e consulta o guia <span className="font-mono text-[#FFC400]">supabase/INTEGRACAO_LOJA_ONLINE.md</span>.
          </p>
          <pre className="font-mono text-[11px] text-[#FFC400] overflow-x-auto pt-1">
            {`SELECT public.bootstrap_first_super_admin('teu-email@empresa.ao', 'Nome Completo');`}
          </pre>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock,
  CreditCard,
  Headphones,
  Laptop,
  Loader2,
  Lock,
  Package,
  RotateCcw,
  ShieldAlert,
  ShoppingBag,
  Truck,
  Watch,
  XCircle,
} from 'lucide-react';
import { getRoleLabel } from '../auth/permissions';
import { useAdmin } from '../context/AdminContext';
import {
  CrmStage,
  DatePeriodFilter,
  DatePeriodPreset,
  OrderOrigin,
  OrderStatus,
  PaymentStatus,
  Product,
  ProductStatus,
} from '../types/domain';

export const ORDER_STATUS_META: Record<
  OrderStatus,
  { label: string; textClass: string; Icon: React.FC<{ className?: string }> }
> = {
  received: { label: 'Recebida', textClass: 'text-[#525252]', Icon: Clock },
  pending_confirmation: {
    label: 'Pendente de confirmação',
    textClass: 'text-[#B45309]',
    Icon: AlertTriangle,
  },
  confirmed: { label: 'Confirmada', textClass: 'text-[#15803D]', Icon: CheckCircle2 },
  preparing: { label: 'Em preparação', textClass: 'text-[#0A0A0A]', Icon: Package },
  shipped: { label: 'Enviada', textClass: 'text-[#0369A1]', Icon: Truck },
  delivered: { label: 'Entregue', textClass: 'text-[#15803D]', Icon: CheckCircle2 },
  cancelled: { label: 'Cancelada', textClass: 'text-[#B91C1C]', Icon: XCircle },
};

export const PAYMENT_STATUS_META: Record<
  PaymentStatus,
  { label: string; textClass: string; Icon: React.FC<{ className?: string }> }
> = {
  pending: { label: 'Pagamento pendente', textClass: 'text-[#B45309]', Icon: Clock },
  paid: { label: 'Pago', textClass: 'text-[#15803D]', Icon: CreditCard },
  refunded: { label: 'Reembolsado', textClass: 'text-[#525252]', Icon: RotateCcw },
  cancelled: { label: 'Cancelado', textClass: 'text-[#B91C1C]', Icon: XCircle },
};

export const ORDER_ORIGIN_LABELS: Record<OrderOrigin, string> = {
  website: 'Loja Online (Checkout)',
  whatsapp_store: 'Loja -> WhatsApp',
  whatsapp_direct: 'WhatsApp Direto',
  instagram: 'Instagram / Social',
  manual_admin: 'Registo Manual',
};

export const CRM_STAGE_LABELS: Record<CrmStage, string> = {
  new_contact: 'Novo contacto',
  interested: 'Interessado',
  in_service: 'Em atendimento',
  awaiting_reply: 'Aguardando resposta',
  converted: 'Cliente convertido',
  recurring: 'Cliente recorrente',
  not_interested: 'Sem interesse',
};

export const PRODUCT_STATUS_META: Record<
  ProductStatus,
  { label: string; textClass: string; Icon: React.FC<{ className?: string }> }
> = {
  active: { label: 'Ativo', textClass: 'text-[#15803D]', Icon: CheckCircle2 },
  inactive: { label: 'Inativo', textClass: 'text-[#B45309]', Icon: Clock },
  archived: { label: 'Arquivado', textClass: 'text-[#525252]', Icon: Archive },
};

export const OrderStatusInline: React.FC<{ status: OrderStatus }> = ({ status }) => {
  const meta = ORDER_STATUS_META[status] || ORDER_STATUS_META.received;
  const Icon = meta.Icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${meta.textClass}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{meta.label}</span>
    </span>
  );
};

export const PaymentStatusInline: React.FC<{ status: PaymentStatus }> = ({ status }) => {
  const meta = PAYMENT_STATUS_META[status] || PAYMENT_STATUS_META.pending;
  const Icon = meta.Icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${meta.textClass}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{meta.label}</span>
    </span>
  );
};

export const ProductStatusInline: React.FC<{ status: ProductStatus }> = ({ status }) => {
  const meta = PRODUCT_STATUS_META[status] || PRODUCT_STATUS_META.active;
  const Icon = meta.Icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${meta.textClass}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{meta.label}</span>
    </span>
  );
};

export const ProductVisualThumb: React.FC<{
  preset: Product['visualPreset'];
  name: string;
  imageUrl?: string | null;
  size?: 'sm' | 'md';
}> = ({ preset, name, imageUrl, size = 'sm' }) => {
  const [failed, setFailed] = useState(false);

  const dims = size === 'md' ? 'w-12 h-12 rounded-[10px]' : 'w-9 h-9 rounded-lg';

  if (imageUrl && !failed && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
    return (
      <img
        src={imageUrl}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${dims} object-cover shrink-0 border border-[#E5E5E5] bg-[#F4F4F4]`}
      />
    );
  }

  const Icon =
    preset === 'audio'
      ? Headphones
      : preset === 'watch'
        ? Watch
        : preset === 'bag'
          ? ShoppingBag
          : preset === 'tech'
            ? Laptop
            : Package;

  return (
    <div
      className={`${dims} bg-[#0A0A0A] text-[#FF8A00] flex items-center justify-center shrink-0 border border-[#262626]`}
      title={name}
    >
      <Icon className={size === 'md' ? 'w-5 h-5' : 'w-4 h-4'} />
    </div>
  );
};

export const PeriodFilterBar: React.FC<{
  value: DatePeriodFilter;
  onChange: (next: DatePeriodFilter) => void;
}> = ({ value, onChange }) => {
  const todayIso = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgoIso = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);

  const presets: Array<{ id: DatePeriodPreset; label: string; ariaLabel: string }> = [
    { id: 'today', label: 'Hoje', ariaLabel: 'Hoje' },
    { id: '7d', label: 'Últimos 7 dias', ariaLabel: 'Últimos 7 dias' },
    { id: '30d', label: 'Últimos 30 dias', ariaLabel: 'Últimos 30 dias' },
    { id: 'all', label: 'Tudo', ariaLabel: 'Todo o período' },
    { id: 'custom', label: 'Personalizado', ariaLabel: 'Intervalo personalizado' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 max-w-full min-w-0">
      <div
        role="group"
        aria-label="Filtro de período"
        className="inline-flex flex-wrap items-center gap-1 p-1 bg-white border border-[#E5E5E5] rounded-[10px] max-w-full"
      >
        {presets.map((p) => {
          const active = value.preset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              aria-label={p.ariaLabel}
              onClick={() =>
                onChange({
                  preset: p.id,
                  startDate: value.startDate || thirtyDaysAgoIso,
                  endDate: value.endDate || todayIso,
                })
              }
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-[#0A0A0A] text-white'
                  : 'text-[#525252] hover:text-[#0A0A0A] hover:bg-[#F4F4F4]'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {value.preset === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 bg-white border border-[#E5E5E5] rounded-[10px] px-3 py-1.5">
          <label className="flex items-center gap-1.5 text-xs text-[#525252]">
            <span>De</span>
            <input
              type="date"
              value={value.startDate || thirtyDaysAgoIso}
              onChange={(e) => onChange({ ...value, startDate: e.target.value })}
              className="text-xs text-[#0A0A0A] border border-[#D4D4D4] rounded px-2 py-1 tabular-data"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-[#525252]">
            <span>Até</span>
            <input
              type="date"
              value={value.endDate || todayIso}
              onChange={(e) => onChange({ ...value, endDate: e.target.value })}
              className="text-xs text-[#0A0A0A] border border-[#D4D4D4] rounded px-2 py-1 tabular-data"
            />
          </label>
        </div>
      )}
    </div>
  );
};

export const AccessDeniedState: React.FC<{ moduleTitle: string; requiredNote?: string }> = ({
  moduleTitle,
  requiredNote,
}) => {
  const { session, setActiveModule } = useAdmin();
  return (
    <div className="bg-white border border-[#E5E5E5] rounded-xl p-8 max-w-xl mx-auto my-8 text-center">
      <div className="w-12 h-12 rounded-[10px] bg-[#0A0A0A] text-[#FF8A00] flex items-center justify-center mx-auto mb-4">
        <Lock className="w-5 h-5" />
      </div>
      <h2 className="font-brand font-bold text-xl text-[#0A0A0A] mb-2">
        Acesso restrito a {moduleTitle}
      </h2>
      <p className="text-sm text-[#525252] leading-relaxed mb-5">
        O teu perfil atual (<strong>{getRoleLabel(session.role)}</strong>) não possui autorização para aceder a esta área. Esta permissão é igualmente validada no servidor pelas políticas Row Level Security (RLS) do Supabase.
      </p>
      {requiredNote && (
        <p className="text-xs text-[#525252] mb-6">{requiredNote}</p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setActiveModule('dashboard')}
          className="btn-bercali-primary px-4 py-2 text-xs rounded-[10px] whitespace-nowrap"
        >
          Voltar ao Dashboard
        </button>
      </div>
    </div>
  );
};

export const EmptyDataState: React.FC<{
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ title, description, actionLabel, onAction }) => {
  return (
    <div className="bg-white border border-[#E5E5E5] rounded-xl p-10 text-center">
      <div className="w-11 h-11 rounded-[10px] bg-[#F4F4F4] text-[#0A0A0A] flex items-center justify-center mx-auto mb-3">
        <ShieldAlert className="w-5 h-5 text-[#FF8A00]" />
      </div>
      <h3 className="font-brand font-bold text-base text-[#0A0A0A] mb-1.5">{title}</h3>
      <p className="text-sm text-[#525252] max-w-md mx-auto leading-relaxed mb-5">{description}</p>
      {actionLabel && onAction && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onAction}
            className="btn-bercali-primary px-4 py-2 text-xs rounded-[10px] whitespace-nowrap"
          >
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
};

export const LoadingBlock: React.FC<{ label?: string }> = ({
  label = 'A carregar dados do Supabase...',
}) => (
  <div className="bg-white border border-[#E5E5E5] rounded-xl p-10 flex flex-col items-center justify-center gap-3 text-center">
    <Loader2 className="w-5 h-5 text-[#FF8A00] animate-spin" />
    <p className="text-xs font-medium text-[#525252]">{label}</p>
  </div>
);

export const ConfirmDialog: React.FC<{
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  isBusy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ open, title, description, confirmLabel, destructive, isBusy, onConfirm, onCancel }) => {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="bg-white rounded-xl border border-[#E5E5E5] max-w-md w-full p-6">
        <h3 id="confirm-dialog-title" className="font-brand font-bold text-lg text-[#0A0A0A] mb-2">
          {title}
        </h3>
        <p className="text-sm text-[#525252] leading-relaxed mb-6">{description}</p>
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium border border-[#D4D4D4] text-[#0A0A0A] rounded-[10px] hover:bg-[#F4F4F4] whitespace-nowrap disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={onConfirm}
            className={`px-4 py-2 text-xs font-bold rounded-[10px] whitespace-nowrap disabled:opacity-50 ${
              destructive
                ? 'bg-[#EF4444] text-white hover:opacity-90'
                : 'btn-bercali-primary'
            }`}
          >
            {isBusy ? 'A processar...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

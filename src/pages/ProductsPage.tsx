import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Edit3,
  Film,
  Image as ImageIcon,
  Loader2,
  Plus,
  Power,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  AccessDeniedState,
  ConfirmDialog,
  EmptyDataState,
  LoadingBlock,
  ProductStatusInline,
  ProductVisualThumb,
} from '../components/SharedUI';
import { useAdmin } from '../context/AdminContext';
import { Product, ProductMedia, ProductStatus } from '../types/domain';
import { formatDatePt, formatKwanza } from '../utils/formatters';

const PAGE_SIZE = 8;

interface ProductFormState {
  id?: string;
  name: string;
  sku: string;
  categoryId: string;
  priceKz: string;
  promoPriceKz: string;
  description: string;
  trackStock: boolean;
  stockQuantity: string;
  lowStockThreshold: string;
  isAvailable: boolean;
  isFeatured: boolean;
  sortOrder: string;
  status: ProductStatus;
  visualPreset: Product['visualPreset'];
  media: ProductMedia[];
}

export const ProductsPage: React.FC = () => {
  const {
    snapshot,
    isDataLoading,
    isMutating,
    can,
    canOpenModule,
    focusedEntityId,
    setFocusedEntityId,
    setActiveModule,
    uploadProductMedia,
    upsertProduct,
    setProductStatus,
    deleteProduct,
    notify,
  } = useAdmin();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ProductStatus | 'low_stock'>('all');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newMediaUrl, setNewMediaUrl] = useState('');
  const [newMediaType, setNewMediaType] = useState<'image' | 'video'>('image');
  const [archiveTarget, setArchiveTarget] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canWrite = can('products:write');

  const createBlankForm = (): ProductFormState => ({
    name: '',
    sku: '',
    categoryId: snapshot.categories[0]?.id || '',
    priceKz: '',
    promoPriceKz: '',
    description: '',
    trackStock: true,
    stockQuantity: '10',
    lowStockThreshold: String(snapshot.storeSettings.defaultLowStockThreshold || 5),
    isAvailable: true,
    isFeatured: false,
    sortOrder: '0',
    status: 'active',
    visualPreset: 'tech',
    media: [],
  });

  const [form, setForm] = useState<ProductFormState>(createBlankForm);

  useEffect(() => {
    if (focusedEntityId) {
      const found = snapshot.products.find((p) => p.id === focusedEntityId);
      if (found) {
        setSearch(found.sku);
      }
      setFocusedEntityId(null);
    }
  }, [focusedEntityId, snapshot.products, setFocusedEntityId]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of snapshot.categories) map.set(c.id, c.name);
    return map;
  }, [snapshot.categories]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return snapshot.products.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) {
        return false;
      }
      if (categoryFilter !== 'all' && p.categoryId !== categoryFilter) {
        return false;
      }
      if (statusFilter === 'low_stock') {
        return (
          p.status === 'active' &&
          p.trackStock &&
          p.stockQuantity !== null &&
          p.stockQuantity <= p.lowStockThreshold
        );
      }
      if (statusFilter !== 'all' && p.status !== statusFilter) {
        return false;
      }
      return true;
    }).sort((a, b) => {
      const featDiff = Number(Boolean(b.isFeatured)) - Number(Boolean(a.isFeatured));
      if (featDiff !== 0) return featDiff;
      const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [snapshot.products, search, categoryFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filteredProducts.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (!canOpenModule('products')) {
    return <AccessDeniedState moduleTitle="Gestão de Produtos" />;
  }

  const openCreateModal = () => {
    setFormError(null);
    setNewMediaUrl('');
    setForm(createBlankForm());
    setModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setFormError(null);
    setNewMediaUrl('');
    setForm({
      id: product.id,
      name: product.name,
      sku: product.sku,
      categoryId: product.categoryId,
      priceKz: String(product.priceKz),
      promoPriceKz: product.promoPriceKz !== null ? String(product.promoPriceKz) : '',
      description: product.description,
      trackStock: product.trackStock,
      stockQuantity: product.stockQuantity !== null ? String(product.stockQuantity) : '0',
      lowStockThreshold: String(product.lowStockThreshold),
      isAvailable: product.isAvailable,
      isFeatured: Boolean(product.isFeatured),
      sortOrder: String(product.sortOrder ?? 0),
      status: product.status,
      visualPreset: product.visualPreset,
      media: structuredClone(product.media),
    });
    setModalOpen(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setFormError(null);
    setIsUploadingMedia(true);
    try {
      const uploadedItems: ProductMedia[] = [];
      for (const file of Array.from(files)) {
        const uploaded = await uploadProductMedia(file, form.sku || form.name || 'produto');
        uploadedItems.push(uploaded);
      }
      setForm((prev) => ({
        ...prev,
        media: [...prev.media, ...uploadedItems].map((m, idx) => ({
          ...m,
          isPrimary: idx === 0,
        })),
      }));
      notify('success', `${uploadedItems.length} ficheiro(s) enviado(s) para o Supabase Storage.`);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao enviar ficheiro para o Storage.');
    } finally {
      setIsUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddMediaRef = () => {
    const clean = newMediaUrl.trim();
    if (!clean) return;
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      setFormError('Indica um URL completo iniciado por https:// ou utiliza o botão de upload para o Supabase Storage.');
      return;
    }
    setFormError(null);
    const item: ProductMedia = {
      id: `med-${Date.now()}`,
      productId: form.id || 'temp',
      type: newMediaType,
      url: clean,
      altText: form.name || 'Media do produto',
      isPrimary: form.media.length === 0,
      storageRef: '',
    };
    setForm((prev) => ({ ...prev, media: [...prev.media, item] }));
    setNewMediaUrl('');
  };

  const promoteMediaToPrimary = (mediaId: string) => {
    setForm((prev) => {
      const target = prev.media.find((m) => m.id === mediaId);
      if (!target) return prev;
      const reordered = [target, ...prev.media.filter((m) => m.id !== mediaId)].map((m, idx) => ({
        ...m,
        isPrimary: idx === 0,
      }));
      return { ...prev, media: reordered };
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError(null);
    setIsSubmitting(true);
    try {
      const priceNum = Number(form.priceKz);
      const promoNum = form.promoPriceKz.trim() ? Number(form.promoPriceKz) : null;
      const stockNum = form.trackStock ? Number(form.stockQuantity) : null;
      const lowNum = Number(form.lowStockThreshold || 5);
      const sortNum = Number(form.sortOrder || 0);

      await upsertProduct({
        id: form.id,
        name: form.name,
        sku: form.sku,
        categoryId: form.categoryId,
        priceKz: priceNum,
        promoPriceKz: promoNum,
        description: form.description,
        trackStock: form.trackStock,
        stockQuantity: stockNum,
        lowStockThreshold: lowNum,
        isAvailable: form.isAvailable,
        isFeatured: form.isFeatured,
        sortOrder: Number.isFinite(sortNum) ? Math.round(sortNum) : 0,
        status: form.status,
        visualPreset: form.visualPreset,
        media: form.media,
      });
      setModalOpen(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao guardar produto.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (productId: string, nextStatus: ProductStatus) => {
    try {
      await setProductStatus(productId, nextStatus);
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Erro ao alterar estado do produto.');
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    try {
      await deleteProduct(deleteTarget.id);
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Erro ao eliminar produto.');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-brand font-extrabold text-2xl text-[#0A0A0A] tracking-tight">
            Gestão de Produtos
          </h1>
          <p className="text-sm text-[#525252] mt-1">
            Catálogo sincronizado com <span className="font-mono text-xs">products</span>, <span className="font-mono text-xs">product_media</span> e bucket <span className="font-mono text-xs">product-media</span>
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={openCreateModal}
            disabled={snapshot.categories.length === 0 || isMutating}
            title={
              snapshot.categories.length === 0
                ? 'Cria primeiro uma categoria em Categorias'
                : undefined
            }
            className="btn-bercali-primary px-4 py-2.5 rounded-[10px] text-xs inline-flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Produto</span>
          </button>
        )}
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white border border-[#E5E5E5] rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              aria-label="Pesquisar produtos por nome ou SKU"
              placeholder="Pesquisar por nome ou SKU..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-[#F4F4F4] border border-transparent focus:bg-white focus:border-[#FF8A00] focus:outline-none rounded-[10px]"
            />
          </div>

          <select
            aria-label="Filtrar por categoria"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-xs bg-white border border-[#D4D4D4] rounded-[10px] text-[#0A0A0A]"
          >
            <option value="all">Todas as categorias</option>
            {snapshot.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div
          role="group"
          aria-label="Filtrar por estado do produto"
          className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#F4F4F4] rounded-[10px]"
        >
          {(
            [
              { id: 'all', label: 'Todos' },
              { id: 'active', label: 'Ativos' },
              { id: 'inactive', label: 'Inativos' },
              { id: 'low_stock', label: 'Stock baixo' },
              { id: 'archived', label: 'Arquivados' },
            ] as const
          ).map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.id);
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-white text-[#0A0A0A] shadow-xs'
                    : 'text-[#525252] hover:text-[#0A0A0A]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table or Empty State */}
      {isDataLoading && snapshot.products.length === 0 ? (
        <LoadingBlock label="A carregar catálogo de produtos..." />
      ) : snapshot.products.length === 0 ? (
        <EmptyDataState
          title="Ainda não existem produtos registados"
          description={
            snapshot.categories.length === 0
              ? 'Antes de criar o primeiro produto no catálogo, cria pelo menos uma categoria no módulo Categorias.'
              : 'O catálogo na base de dados está vazio. Cria o primeiro produto com preço em Kwanzas (Kz) e imagens no Supabase Storage.'
          }
          actionLabel={
            canWrite
              ? snapshot.categories.length === 0
                ? 'Criar Primeira Categoria'
                : 'Criar Primeiro Produto'
              : undefined
          }
          onAction={
            canWrite
              ? snapshot.categories.length === 0
                ? () => setActiveModule('categories')
                : openCreateModal
              : undefined
          }
        />
      ) : filteredProducts.length === 0 ? (
        <EmptyDataState
          title="Nenhum produto corresponde aos filtros"
          description="Ajusta a pesquisa por SKU/nome ou limpa os filtros de categoria e estado."
        />
      ) : (
        <div className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E5E5E5] bg-[#FAFAFA] text-[11px] font-semibold text-[#525252]">
                  <th className="py-3 px-4">Produto & SKU</th>
                  <th className="py-3 px-4">Categoria</th>
                  <th className="py-3 px-4 text-right">Preço (Kz)</th>
                  <th className="py-3 px-4 text-right">Stock</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Atualizado</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E5E5] text-xs">
                {paginated.map((p) => {
                  const isLowStock =
                    p.trackStock &&
                    p.stockQuantity !== null &&
                    p.stockQuantity <= p.lowStockThreshold;
                  const primaryImg = p.media.find((m) => m.type === 'image')?.url || null;
                  return (
                    <tr key={p.id} className="hover:bg-[#FAFAFA] transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <ProductVisualThumb
                            preset={p.visualPreset}
                            name={p.name}
                            imageUrl={primaryImg}
                          />
                          <div className="min-w-0">
                            <p className="font-semibold text-[#0A0A0A] truncate max-w-xs">
                              {p.name}
                            </p>
                            <p className="text-[11px] text-[#525252] font-mono">
                              {p.sku}
                              {' · '}
                              <span>{p.media.length} media</span>
                              {p.isFeatured && ' · Destaque'}
                              {Boolean(p.sortOrder) && ` · Ordem #${p.sortOrder}`}
                              {!p.isAvailable && ' · Indisponível'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[#525252]">
                        {categoryMap.get(p.categoryId) || 'Sem categoria'}
                      </td>
                      <td className="py-3 px-4 text-right tabular-data">
                        {p.promoPriceKz !== null ? (
                          <div>
                            <span className="metric-num font-bold text-[#0A0A0A] block">
                              {formatKwanza(p.promoPriceKz)}
                            </span>
                            <span className="text-[11px] text-[#737373] line-through">
                              {formatKwanza(p.priceKz)}
                            </span>
                          </div>
                        ) : (
                          <span className="metric-num font-bold text-[#0A0A0A]">
                            {formatKwanza(p.priceKz)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right tabular-data">
                        {p.trackStock ? (
                          <span
                            className={`font-mono font-medium ${
                              isLowStock ? 'text-[#B91C1C]' : 'text-[#0A0A0A]'
                            }`}
                          >
                            {p.stockQuantity} un.
                          </span>
                        ) : (
                          <span className="text-[#737373]">Livre</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <ProductStatusInline status={p.status} />
                      </td>
                      <td className="py-3 px-4 text-[#525252] tabular-data whitespace-nowrap">
                        {formatDatePt(p.updatedAt)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {canWrite ? (
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={isMutating}
                              onClick={() => openEditModal(p)}
                              aria-label={`Editar ${p.name}`}
                              className="p-1.5 rounded-lg border border-[#E5E5E5] text-[#0A0A0A] hover:bg-[#F4F4F4] disabled:opacity-40"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            {p.status !== 'archived' ? (
                              <>
                                <button
                                  type="button"
                                  disabled={isMutating}
                                  onClick={() =>
                                    void handleStatusChange(
                                      p.id,
                                      p.status === 'active' ? 'inactive' : 'active'
                                    )
                                  }
                                  aria-label={
                                    p.status === 'active'
                                      ? `Desativar ${p.name}`
                                      : `Ativar ${p.name}`
                                  }
                                  title={p.status === 'active' ? 'Desativar' : 'Ativar'}
                                  className="p-1.5 rounded-lg border border-[#E5E5E5] text-[#0A0A0A] hover:bg-[#F4F4F4] disabled:opacity-40"
                                >
                                  <Power className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  disabled={isMutating}
                                  onClick={() => setArchiveTarget(p)}
                                  aria-label={`Arquivar ${p.name}`}
                                  title="Arquivar preservando histórico"
                                  className="p-1.5 rounded-lg border border-[#E5E5E5] text-[#525252] hover:text-[#B91C1C] hover:bg-[#FEF2F2] disabled:opacity-40"
                                >
                                  <Archive className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={isMutating}
                                onClick={() => void handleStatusChange(p.id, 'inactive')}
                                className="px-2 py-1 text-[11px] font-medium border border-[#D4D4D4] rounded-lg hover:bg-[#F4F4F4] disabled:opacity-40"
                              >
                                Restaurar
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={isMutating}
                              onClick={() => setDeleteTarget(p)}
                              aria-label={`Eliminar ${p.name}`}
                              title="Eliminar produto (apenas se não tiver encomendas associadas)"
                              className="p-1.5 rounded-lg border border-[#E5E5E5] text-[#525252] hover:text-[#B91C1C] hover:bg-[#FEF2F2] disabled:opacity-40"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#737373]">Só leitura</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-4 py-3 border-t border-[#E5E5E5] flex items-center justify-between text-xs text-[#525252]">
            <span className="tabular-data">
              A mostrar {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, filteredProducts.length)} de {filteredProducts.length}{' '}
              produto(s)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-[#D4D4D4] disabled:opacity-40 text-[#0A0A0A] hover:bg-[#F4F4F4]"
              >
                Anterior
              </button>
              <span className="tabular-data font-medium text-[#0A0A0A]">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-[#D4D4D4] disabled:opacity-40 text-[#0A0A0A] hover:bg-[#F4F4F4]"
              >
                Seguinte
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Product Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-modal-title"
        >
          <div className="bg-white rounded-xl border border-[#E5E5E5] max-w-2xl w-full p-6 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-[#E5E5E5]">
              <div>
                <h2 id="product-modal-title" className="font-brand font-bold text-lg text-[#0A0A0A]">
                  {form.id ? 'Editar Produto' : 'Criar Novo Produto'}
                </h2>
                <p className="text-xs text-[#525252]">
                  Persistido nas tabelas <span className="font-mono">products</span> e <span className="font-mono">product_media</span> do Supabase.
                </p>
              </div>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setModalOpen(false)}
                aria-label="Fechar janela de produto"
                className="p-1.5 rounded-lg hover:bg-[#F4F4F4]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleFormSubmit(e)} noValidate className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="prod-name" className="block font-medium text-[#0A0A0A] mb-1">
                    Nome do produto *
                  </label>
                  <input
                    id="prod-name"
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ex.: Auscultadores Bluetooth Pro"
                    className="w-full px-3 py-2 border border-[#D4D4D4] rounded-[10px] focus:border-[#FF8A00] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="prod-sku" className="block font-medium text-[#0A0A0A] mb-1">
                    Código / SKU *
                  </label>
                  <input
                    id="prod-sku"
                    type="text"
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    placeholder="Ex.: BRC-AUD-210"
                    className="w-full px-3 py-2 font-mono border border-[#D4D4D4] rounded-[10px] focus:border-[#FF8A00] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="prod-cat" className="block font-medium text-[#0A0A0A] mb-1">
                    Categoria *
                  </label>
                  <select
                    id="prod-cat"
                    value={form.categoryId}
                    onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                    className="w-full px-3 py-2 border border-[#D4D4D4] rounded-[10px] bg-white"
                  >
                    {snapshot.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="prod-price" className="block font-medium text-[#0A0A0A] mb-1">
                    Preço base (Kz) *
                  </label>
                  <input
                    id="prod-price"
                    type="number"
                    min="1"
                    value={form.priceKz}
                    onChange={(e) => setForm({ ...form, priceKz: e.target.value })}
                    placeholder="Ex.: 28500"
                    className="w-full px-3 py-2 border border-[#D4D4D4] rounded-[10px] tabular-data focus:border-[#FF8A00] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="prod-promo" className="block font-medium text-[#0A0A0A] mb-1">
                    Preço promocional (Kz, opcional)
                  </label>
                  <input
                    id="prod-promo"
                    type="number"
                    min="1"
                    value={form.promoPriceKz}
                    onChange={(e) => setForm({ ...form, promoPriceKz: e.target.value })}
                    placeholder="Opcional (< preço base)"
                    className="w-full px-3 py-2 border border-[#D4D4D4] rounded-[10px] tabular-data focus:border-[#FF8A00] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="prod-desc" className="block font-medium text-[#0A0A0A] mb-1">
                  Descrição comercial
                </label>
                <textarea
                  id="prod-desc"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Características principais, garantia e conteúdo da embalagem..."
                  className="w-full px-3 py-2 border border-[#D4D4D4] rounded-[10px] focus:border-[#FF8A00] focus:outline-none"
                />
              </div>

              {/* Stock, Storefront Highlight & Publication Status */}
              <div className="p-4 rounded-[10px] bg-[#F4F4F4] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <label className="inline-flex items-center gap-2 font-medium text-[#0A0A0A]">
                    <input
                      type="checkbox"
                      checked={form.trackStock}
                      onChange={(e) => setForm({ ...form, trackStock: e.target.checked })}
                      className="rounded border-[#D4D4D4]"
                    />
                    <span>Ativar gestão de stock por unidades</span>
                  </label>

                  <label className="inline-flex items-center gap-2 font-medium text-[#0A0A0A]">
                    <input
                      type="checkbox"
                      checked={form.isAvailable}
                      onChange={(e) => setForm({ ...form, isAvailable: e.target.checked })}
                      className="rounded border-[#D4D4D4]"
                    />
                    <span>Disponível para encomenda</span>
                  </label>

                  <label className="inline-flex items-center gap-2 font-medium text-[#0A0A0A]">
                    <input
                      type="checkbox"
                      checked={form.isFeatured}
                      onChange={(e) => setForm({ ...form, isFeatured: e.target.checked })}
                      className="rounded border-[#D4D4D4]"
                    />
                    <span>Destacar na montra da loja</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                  {form.trackStock && (
                    <>
                      <div>
                        <label htmlFor="prod-stock" className="block text-[#525252] mb-1">
                          Stock atual
                        </label>
                        <input
                          id="prod-stock"
                          type="number"
                          min="0"
                          value={form.stockQuantity}
                          onChange={(e) => setForm({ ...form, stockQuantity: e.target.value })}
                          className="w-full px-3 py-1.5 bg-white border border-[#D4D4D4] rounded-lg tabular-data"
                        />
                      </div>
                      <div>
                        <label htmlFor="prod-low" className="block text-[#525252] mb-1">
                          Alerta stock mín.
                        </label>
                        <input
                          id="prod-low"
                          type="number"
                          min="0"
                          value={form.lowStockThreshold}
                          onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })}
                          className="w-full px-3 py-1.5 bg-white border border-[#D4D4D4] rounded-lg tabular-data"
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <label htmlFor="prod-order" className="block text-[#525252] mb-1">
                      Ordem na loja
                    </label>
                    <input
                      id="prod-order"
                      type="number"
                      min="0"
                      value={form.sortOrder}
                      onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                      className="w-full px-3 py-1.5 bg-white border border-[#D4D4D4] rounded-lg tabular-data"
                    />
                  </div>
                  <div>
                    <label htmlFor="prod-status" className="block text-[#525252] mb-1">
                      Estado de publicação
                    </label>
                    <select
                      id="prod-status"
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value as ProductStatus })}
                      className="w-full px-3 py-1.5 bg-white border border-[#D4D4D4] rounded-lg"
                    >
                      <option value="active">Ativo (Publicado na loja)</option>
                      <option value="inactive">Inativo (Oculto na loja)</option>
                      <option value="archived">Arquivado (Oculto)</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="prod-preset" className="block text-[#525252] mb-1">
                      Ícone reserva
                    </label>
                    <select
                      id="prod-preset"
                      value={form.visualPreset}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          visualPreset: e.target.value as Product['visualPreset'],
                        })
                      }
                      className="w-full px-3 py-1.5 bg-white border border-[#D4D4D4] rounded-lg"
                    >
                      <option value="tech">Tecnologia</option>
                      <option value="audio">Áudio</option>
                      <option value="watch">Relógio / Wearable</option>
                      <option value="bag">Mochila / Moda</option>
                      <option value="accessory">Acessório</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Imagens e Vídeos (Supabase Storage + URL) */}
              <div className="border border-[#E5E5E5] rounded-[10px] p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[#0A0A0A]">
                      Imagens e Vídeos (<span className="font-mono">product_media</span>)
                    </p>
                    <p className="text-[11px] text-[#525252]">
                      Envia ficheiros diretamente para o bucket <strong>product-media</strong> (máx. 15 MB) ou associa um URL externo HTTPS.
                    </p>
                  </div>

                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                      multiple
                      onChange={(e) => void handleFileUpload(e)}
                      className="hidden"
                      id="product-storage-upload"
                    />
                    <label
                      htmlFor="product-storage-upload"
                      className={`px-3 py-2 rounded-lg bg-[#0A0A0A] text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap hover:opacity-90 ${
                        isUploadingMedia ? 'opacity-60 pointer-events-none' : ''
                      }`}
                    >
                      {isUploadingMedia ? (
                        <Loader2 className="w-3.5 h-3.5 text-[#FF8A00] animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5 text-[#FF8A00]" />
                      )}
                      <span>{isUploadingMedia ? 'A enviar...' : 'Carregar ficheiro (Storage)'}</span>
                    </label>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    aria-label="Tipo de media"
                    value={newMediaType}
                    onChange={(e) => setNewMediaType(e.target.value as 'image' | 'video')}
                    className="px-3 py-2 border border-[#D4D4D4] rounded-lg bg-white"
                  >
                    <option value="image">Imagem (URL)</option>
                    <option value="video">Vídeo (URL)</option>
                  </select>
                  <input
                    type="url"
                    value={newMediaUrl}
                    onChange={(e) => setNewMediaUrl(e.target.value)}
                    placeholder="https://... (opcional se usares upload direto)"
                    className="flex-1 px-3 py-2 border border-[#D4D4D4] rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={handleAddMediaRef}
                    className="px-3 py-2 border border-[#0A0A0A] rounded-lg font-medium hover:bg-[#F4F4F4] whitespace-nowrap"
                  >
                    Adicionar URL
                  </button>
                </div>

                {form.media.length > 0 && (
                  <div className="space-y-1.5">
                    {form.media.map((m, idx) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#F4F4F4]"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          {m.type === 'video' ? (
                            <Film className="w-3.5 h-3.5 text-[#FF8A00] shrink-0" />
                          ) : (
                            <ImageIcon className="w-3.5 h-3.5 text-[#FF8A00] shrink-0" />
                          )}
                          <span className="font-mono text-[11px] truncate">{m.url}</span>
                          {idx === 0 && (
                            <span className="text-[10px] font-semibold text-[#15803D] shrink-0">
                              · Principal
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          {idx > 0 && (
                            <button
                              type="button"
                              onClick={() => promoteMediaToPrimary(m.id)}
                              className="text-[11px] font-medium text-[#0A0A0A] hover:underline whitespace-nowrap"
                            >
                              Definir principal
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                media: prev.media.filter((x) => x.id !== m.id),
                              }))
                            }
                            aria-label={`Remover media ${m.url}`}
                            className="text-[#B91C1C] hover:opacity-80"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {formError && (
                <div role="alert" className="p-3 rounded-[10px] bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C]">
                  {formError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-[#D4D4D4] rounded-[10px] font-medium hover:bg-[#F4F4F4] disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isUploadingMedia}
                  className="btn-bercali-primary px-5 py-2 rounded-[10px] disabled:opacity-50"
                >
                  {isSubmitting
                    ? 'A guardar...'
                    : form.id
                      ? 'Guardar alterações'
                      : 'Criar Produto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Arquivar produto sem apagar histórico?"
        description={
          archiveTarget
            ? `O produto "${archiveTarget.name}" deixará de estar disponível no catálogo público, mas o seu registo e histórico em encomendas anteriores serão integralmente preservados.`
            : ''
        }
        confirmLabel="Arquivar produto"
        isBusy={isMutating}
        onConfirm={() => {
          if (archiveTarget) {
            void handleStatusChange(archiveTarget.id, 'archived').finally(() =>
              setArchiveTarget(null)
            );
          }
        }}
        onCancel={() => setArchiveTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Eliminar produto definitivamente?"
        description={
          deleteTarget
            ? `O produto "${deleteTarget.name}" (${deleteTarget.sku}) e os respetivos ficheiros de media serão removidos. Se já tiver encomendas associadas, a eliminação será bloqueada para proteger o histórico comercial — nesse caso utiliza "Arquivar".`
            : ''
        }
        confirmLabel="Eliminar produto"
        destructive
        isBusy={isMutating}
        onConfirm={() => void handleDeleteConfirmed()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

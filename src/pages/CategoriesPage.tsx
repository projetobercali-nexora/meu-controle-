import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Edit3,
  FolderTree,
  Plus,
  Power,
  Trash2,
  X,
} from 'lucide-react';
import {
  AccessDeniedState,
  ConfirmDialog,
  EmptyDataState,
  LoadingBlock,
} from '../components/SharedUI';
import { useAdmin } from '../context/AdminContext';
import { Category } from '../types/domain';
import { formatDatePt, formatKwanza } from '../utils/formatters';

export const CategoriesPage: React.FC = () => {
  const {
    snapshot,
    isDataLoading,
    isMutating,
    can,
    canOpenModule,
    upsertCategory,
    toggleCategoryActive,
    deleteCategory,
    assignProductToCategory,
    notify,
  } = useAdmin();

  const canWrite = can('categories:write');

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    snapshot.categories[0]?.id || null
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [productToAssign, setProductToAssign] = useState('');

  const productCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of snapshot.products) {
      counts.set(p.categoryId, (counts.get(p.categoryId) || 0) + 1);
    }
    return counts;
  }, [snapshot.products]);

  const activeCategory = useMemo(
    () =>
      snapshot.categories.find((c) => c.id === selectedCategoryId) ||
      snapshot.categories[0] ||
      null,
    [snapshot.categories, selectedCategoryId]
  );

  const categoryProducts = useMemo(
    () =>
      activeCategory
        ? snapshot.products.filter((p) => p.categoryId === activeCategory.id)
        : [],
    [snapshot.products, activeCategory]
  );

  const otherProducts = useMemo(
    () =>
      activeCategory
        ? snapshot.products.filter((p) => p.categoryId !== activeCategory.id)
        : [],
    [snapshot.products, activeCategory]
  );

  if (!canOpenModule('categories')) {
    return <AccessDeniedState moduleTitle="Gestão de Categorias" />;
  }

  const openCreate = () => {
    setEditingCategory(null);
    setName('');
    setSlug('');
    setDescription('');
    setIsActive(true);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditingCategory(cat);
    setName(cat.name);
    setSlug(cat.slug);
    setDescription(cat.description);
    setIsActive(cat.isActive);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setFormError(null);
    setIsSubmitting(true);
    try {
      await upsertCategory({
        id: editingCategory?.id,
        name,
        slug: slug.trim() || undefined,
        description,
        isActive,
      });
      setModalOpen(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erro ao guardar categoria.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTryDelete = (cat: Category) => {
    const depCount = productCounts.get(cat.id) || 0;
    if (depCount > 0) {
      notify(
        'error',
        `Proteção de dependências: "${cat.name}" possui ${depCount} produto(s) associado(s). Reatribui os produtos ou desativa a categoria em vez de apagar.`
      );
      return;
    }
    setDeleteTarget(cat);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCategory(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Erro ao eliminar categoria.');
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-brand font-extrabold text-2xl text-[#0A0A0A] tracking-tight">
            Gestão de Categorias
          </h1>
          <p className="text-sm text-[#525252] mt-1">
            Organização de secções da tabela <span className="font-mono text-xs">categories</span> com proteção de integridade referencial
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            disabled={isMutating}
            onClick={openCreate}
            className="btn-bercali-primary min-h-[44px] sm:min-h-0 px-4 py-2.5 rounded-[10px] text-xs inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 w-full sm:w-auto disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Categoria</span>
          </button>
        )}
      </div>

      {isDataLoading && snapshot.categories.length === 0 ? (
        <LoadingBlock label="A carregar categorias do catálogo..." />
      ) : snapshot.categories.length === 0 ? (
        <EmptyDataState
          title="Ainda não existem categorias registadas"
          description="Cria pelo menos uma categoria para organizar os produtos da Bercali Store no Supabase."
          actionLabel={canWrite ? 'Criar Primeira Categoria' : undefined}
          onAction={canWrite ? openCreate : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Categories List */}
          <div className="lg:col-span-3 bg-white border border-[#E5E5E5] rounded-xl overflow-hidden">
            {/* Mobile Stacked Cards (< md) */}
            <div className="md:hidden divide-y divide-[#E5E5E5] text-xs">
              {snapshot.categories.map((cat) => {
                const count = productCounts.get(cat.id) || 0;
                const isSelected = activeCategory?.id === cat.id;
                return (
                  <div
                    key={cat.id}
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`p-4 space-y-3 cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#FFF8EB]' : 'hover:bg-[#FAFAFA]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[#0A0A0A] break-words leading-snug">
                          {cat.name}
                        </p>
                        <p className="text-[11px] text-[#525252] font-mono break-all mt-0.5">
                          /{cat.slug} · Atualizada {formatDatePt(cat.updatedAt)}
                        </p>
                      </div>
                      <span className="metric-num font-bold text-[#0A0A0A] shrink-0">
                        {count} prod.
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#F4F4F4]">
                      {cat.isActive ? (
                        <span className="inline-flex items-center gap-1.5 text-[#15803D] font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Ativa</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[#525252] font-medium">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Inativa</span>
                        </span>
                      )}

                      <div onClick={(e) => e.stopPropagation()}>
                        {canWrite ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isMutating}
                              onClick={() => openEdit(cat)}
                              aria-label={`Editar categoria ${cat.name}`}
                              className="min-h-[44px] min-w-[44px] rounded-lg border border-[#E5E5E5] bg-white hover:bg-[#F4F4F4] inline-flex items-center justify-center disabled:opacity-40"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              disabled={isMutating}
                              onClick={() =>
                                void toggleCategoryActive(cat.id, !cat.isActive).catch((err) =>
                                  notify(
                                    'error',
                                    err instanceof Error ? err.message : 'Erro ao atualizar categoria.'
                                  )
                                )
                              }
                              aria-label={
                                cat.isActive
                                  ? `Desativar categoria ${cat.name}`
                                  : `Ativar categoria ${cat.name}`
                              }
                              className="min-h-[44px] min-w-[44px] rounded-lg border border-[#E5E5E5] bg-white hover:bg-[#F4F4F4] inline-flex items-center justify-center disabled:opacity-40"
                            >
                              <Power className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              disabled={isMutating}
                              onClick={() => handleTryDelete(cat)}
                              aria-label={`Eliminar categoria ${cat.name}`}
                              className="min-h-[44px] min-w-[44px] rounded-lg border border-[#E5E5E5] bg-white text-[#525252] hover:text-[#B91C1C] hover:bg-[#FEF2F2] inline-flex items-center justify-center disabled:opacity-40"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#737373]">Só leitura</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table (md+) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5E5E5] bg-[#FAFAFA] text-[11px] font-semibold text-[#525252]">
                    <th className="py-3 px-4">Categoria</th>
                    <th className="py-3 px-4 text-right">Produtos</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5E5] text-xs">
                  {snapshot.categories.map((cat) => {
                    const count = productCounts.get(cat.id) || 0;
                    const isSelected = activeCategory?.id === cat.id;
                    return (
                      <tr
                        key={cat.id}
                        onClick={() => setSelectedCategoryId(cat.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#FFF8EB]' : 'hover:bg-[#FAFAFA]'
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-[#0A0A0A]">{cat.name}</p>
                          <p className="text-[11px] text-[#525252] font-mono">
                            /{cat.slug} · Atualizada {formatDatePt(cat.updatedAt)}
                          </p>
                        </td>
                        <td className="py-3.5 px-4 text-right metric-num font-bold text-[#0A0A0A]">
                          {count}
                        </td>
                        <td className="py-3.5 px-4">
                          {cat.isActive ? (
                            <span className="inline-flex items-center gap-1.5 text-[#15803D] font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Ativa</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-[#525252] font-medium">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Inativa</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          {canWrite ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={isMutating}
                                onClick={() => openEdit(cat)}
                                aria-label={`Editar categoria ${cat.name}`}
                                className="p-1.5 rounded-lg border border-[#E5E5E5] hover:bg-white disabled:opacity-40"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={isMutating}
                                onClick={() =>
                                  void toggleCategoryActive(cat.id, !cat.isActive).catch((err) =>
                                    notify(
                                      'error',
                                      err instanceof Error ? err.message : 'Erro ao atualizar categoria.'
                                    )
                                  )
                                }
                                aria-label={
                                  cat.isActive
                                    ? `Desativar categoria ${cat.name}`
                                    : `Ativar categoria ${cat.name}`
                                }
                                className="p-1.5 rounded-lg border border-[#E5E5E5] hover:bg-white disabled:opacity-40"
                              >
                                <Power className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={isMutating}
                                onClick={() => handleTryDelete(cat)}
                                aria-label={`Eliminar categoria ${cat.name}`}
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
          </div>

          {/* Category Detail & Product Association */}
          <div className="lg:col-span-2 bg-white border border-[#E5E5E5] rounded-xl p-4 sm:p-5 space-y-4">
            {activeCategory && (
              <>
                <div className="pb-3 border-b border-[#E5E5E5]">
                  <div className="flex items-center gap-2 text-[#FF8A00] mb-1">
                    <FolderTree className="w-4 h-4 shrink-0" />
                    <span className="text-xs font-semibold text-[#525252]">
                      Produtos na categoria
                    </span>
                  </div>
                  <h2 className="font-brand font-bold text-lg text-[#0A0A0A] break-words">
                    {activeCategory.name}
                  </h2>
                  <p className="text-xs text-[#525252] mt-1 leading-relaxed break-words">
                    {activeCategory.description || 'Sem descrição adicional.'}
                  </p>
                </div>

                {canWrite && otherProducts.length > 0 && (
                  <div className="space-y-2">
                    <label
                      htmlFor="assign-prod-select"
                      className="block text-xs font-medium text-[#0A0A0A]"
                    >
                      Associar produto existente a esta categoria
                    </label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select
                        id="assign-prod-select"
                        value={productToAssign}
                        onChange={(e) => setProductToAssign(e.target.value)}
                        className="flex-1 min-h-[44px] sm:min-h-0 px-3 py-2 text-xs border border-[#D4D4D4] rounded-lg bg-white min-w-0"
                      >
                        <option value="">Selecionar produto...</option>
                        {otherProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!productToAssign || isMutating}
                        onClick={() => {
                          if (productToAssign) {
                            void assignProductToCategory(productToAssign, activeCategory.id)
                              .then(() => setProductToAssign(''))
                              .catch((err) =>
                                notify(
                                  'error',
                                  err instanceof Error ? err.message : 'Erro ao reatribuir produto.'
                                )
                              );
                          }
                        }}
                        className="min-h-[44px] sm:min-h-0 px-3 py-2 text-xs font-semibold bg-[#0A0A0A] text-white rounded-lg disabled:opacity-40 whitespace-nowrap"
                      >
                        Associar
                      </button>
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <p className="text-xs font-semibold text-[#525252] mb-2">
                    Artigos associados ({categoryProducts.length})
                  </p>
                  {categoryProducts.length === 0 ? (
                    <p className="text-xs text-[#737373] py-4">
                      Esta categoria não tem produtos associados neste momento.
                    </p>
                  ) : (
                    <div className="divide-y divide-[#E5E5E5] text-xs">
                      {categoryProducts.map((p) => (
                        <div key={p.id} className="py-2.5 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-[#0A0A0A] truncate">{p.name}</p>
                            <p className="font-mono text-[11px] text-[#737373]">{p.sku}</p>
                          </div>
                          <span className="metric-num font-bold text-[#0A0A0A] shrink-0">
                            {formatKwanza(p.promoPriceKz ?? p.priceKz)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Create / Edit Category Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-4 pt-safe pb-safe"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cat-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmitting) {
              setModalOpen(false);
            }
          }}
        >
          <div className="bg-white rounded-xl border border-[#E5E5E5] max-w-md w-full max-h-[90dvh] flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-[#E5E5E5]">
              <h2 id="cat-modal-title" className="font-brand font-bold text-base sm:text-lg text-[#0A0A0A]">
                {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
              </h2>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setModalOpen(false)}
                aria-label="Fechar janela"
                className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 p-2 rounded-lg hover:bg-[#F4F4F4] inline-flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => void handleSave(e)}
              noValidate
              className="flex flex-col flex-1 min-h-0 text-xs"
            >
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-4">
                <div>
                  <label htmlFor="cat-name" className="block font-medium text-[#0A0A0A] mb-1">
                    Nome da categoria *
                  </label>
                  <input
                    id="cat-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Acessórios e Cabos"
                    className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 border border-[#D4D4D4] rounded-[10px] focus:border-[#FF8A00] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="cat-slug" className="block font-medium text-[#0A0A0A] mb-1">
                    Slug URL (opcional — gerado automaticamente)
                  </label>
                  <input
                    id="cat-slug"
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="Ex.: acessorios-e-cabos"
                    className="w-full min-h-[44px] sm:min-h-0 px-3 py-2 font-mono border border-[#D4D4D4] rounded-[10px] focus:border-[#FF8A00] focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="cat-desc" className="block font-medium text-[#0A0A0A] mb-1">
                    Descrição
                  </label>
                  <textarea
                    id="cat-desc"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Breve descrição da secção..."
                    className="w-full px-3 py-2 border border-[#D4D4D4] rounded-[10px] focus:border-[#FF8A00] focus:outline-none"
                  />
                </div>

                <label className="min-h-[36px] inline-flex items-center gap-2 font-medium text-[#0A0A0A] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                  />
                  <span>Categoria ativa na loja</span>
                </label>

                {formError && (
                  <div role="alert" className="p-3 rounded-[10px] bg-[#FEF2F2] border border-[#FECACA] text-[#B91C1C] break-words">
                    {formError}
                  </div>
                )}
              </div>

              <div className="shrink-0 px-4 sm:px-6 py-3.5 border-t border-[#E5E5E5] bg-[#FAFAFA] flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setModalOpen(false)}
                  className="min-h-[44px] sm:min-h-0 px-4 py-2 bg-white border border-[#D4D4D4] rounded-[10px] font-medium hover:bg-[#F4F4F4] disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-bercali-primary min-h-[44px] sm:min-h-0 px-4 py-2 rounded-[10px] disabled:opacity-50"
                >
                  {isSubmitting
                    ? 'A guardar...'
                    : editingCategory
                      ? 'Guardar alterações'
                      : 'Criar Categoria'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Eliminar categoria vazia?"
        description={
          deleteTarget
            ? `A categoria "${deleteTarget.name}" não tem produtos associados e será eliminada definitivamente da tabela categories.`
            : ''
        }
        confirmLabel="Eliminar categoria"
        destructive
        isBusy={isMutating}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

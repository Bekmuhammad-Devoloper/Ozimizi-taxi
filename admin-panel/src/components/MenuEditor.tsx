'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  FolderPlus,
  ImageIcon,
  Pencil,
  Plus,
  Search,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Field, IconBtn, Modal } from '@/components/ui';
import { PhotoUpload } from '@/components/PhotoUpload';
import {
  MENU_KIND_LABEL,
  MENU_KIND_TONE,
  apiError,
  resolveMediaUrl,
  som,
  type MenuCategory,
  type MenuItem,
  type MenuItemKind,
  type MenuResponse,
} from '@/lib/food';

/** "Xom ashyo" / "Yarim tayyor mahsulot" tag (plain dishes get none unless `showDish`). */
export function ItemKindBadge({ kind, showDish = false }: { kind?: MenuItemKind | null; showDish?: boolean }) {
  const k: MenuItemKind = kind === 'raw' || kind === 'semi' ? kind : 'dish';
  if (k === 'dish' && !showDish) return null;
  return (
    <span
      className={
        'inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase tracking-wider whitespace-nowrap ' +
        MENU_KIND_TONE[k]
      }
    >
      {MENU_KIND_LABEL[k]}
    </span>
  );
}

/** Menu of one kitchen. `base` = `/admin/food/kitchens/<id>` or `/kitchen`. */
export function useKitchenMenu(base: string) {
  return useQuery({
    queryKey: ['food-menu', base],
    queryFn: async () => (await api.get<MenuResponse>(`${base}/menu`)).data,
  });
}

interface Group {
  cat: MenuCategory | null;
  items: MenuItem[];
}

/**
 * Menu editor shared by the admin (/kitchens/[id]) and the kitchen panel
 * (/kitchen/menu): categories (add / rename / delete / reorder) and dishes
 * grouped by category (photo, price, availability, reorder).
 */
export function MenuEditor({ base, uploadPath }: { base: string; uploadPath?: string }) {
  const upload = uploadPath ?? `${base}/upload`;
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useKitchenMenu(base);
  const [q, setQ] = useState('');
  const [editingCat, setEditingCat] = useState<MenuCategory | 'new' | null>(null);
  const [editingItem, setEditingItem] = useState<{ item: MenuItem | null; categoryId: string | null } | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const invalidate = () => qc.invalidateQueries({ queryKey: ['food-menu', base] });

  /** Runs a request with a per-row spinner and refreshes the menu. */
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setPending((s) => ({ ...s, [key]: true }));
    try {
      await fn();
    } catch (e) {
      alert(apiError(e));
    } finally {
      setPending((s) => {
        const n = { ...s };
        delete n[key];
        return n;
      });
      await invalidate();
    }
  };

  const categories = data?.categories ?? [];
  const items = data?.items ?? [];

  const groups: Group[] = useMemo(() => {
    const ids = new Set(categories.map((c) => c.id));
    const needle = q.trim().toLowerCase();
    const match = (i: MenuItem) =>
      !needle ||
      i.name.toLowerCase().includes(needle) ||
      (i.description ?? '').toLowerCase().includes(needle);
    const out: Group[] = categories.map((c) => ({
      cat: c,
      items: items.filter((i) => i.categoryId === c.id && match(i)),
    }));
    const orphans = items.filter((i) => (!i.categoryId || !ids.has(i.categoryId)) && match(i));
    if (orphans.length || (!categories.length && items.length)) out.push({ cat: null, items: orphans });
    return out;
  }, [categories, items, q]);

  const availableCount = items.filter((i) => i.isAvailable).length;

  const moveCategory = (idx: number, dir: -1 | 1) => {
    const list = [...categories];
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j], list[idx]];
    void run(`cat-${list[j].id}`, () =>
      Promise.all(
        list.map((c, i) =>
          c.sort !== i * 10
            ? api.post(`${base}/categories`, { id: c.id, name: c.name, sort: i * 10 })
            : Promise.resolve(null),
        ),
      ),
    );
  };

  const moveItem = (group: MenuItem[], idx: number, dir: -1 | 1) => {
    const list = [...group];
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j], list[idx]];
    void run(`item-${list[j].id}`, () =>
      Promise.all(
        list.map((it, i) =>
          it.sort !== i * 10
            ? api.post(`${base}/items`, { id: it.id, sort: i * 10 })
            : Promise.resolve(null),
        ),
      ),
    );
  };

  const toggleAvailable = (it: MenuItem) =>
    void run(`avail-${it.id}`, () => api.post(`${base}/items`, { id: it.id, isAvailable: !it.isAvailable }));

  const removeItem = (it: MenuItem) => {
    if (!confirm(`“${it.name}” menyudan o‘chirilsinmi?`)) return;
    void run(`item-${it.id}`, () => api.delete(`${base}/items/${it.id}`));
  };

  const removeCategory = (c: MenuCategory, count: number) => {
    const extra = count ? `\nUndagi ${count} ta taom “Bo‘limsiz” bo‘lib qoladi (o‘chmaydi).` : '';
    if (!confirm(`“${c.name}” bo‘limi o‘chirilsinmi?${extra}`)) return;
    void run(`cat-${c.id}`, () => api.delete(`${base}/categories/${c.id}`));
  };

  if (isLoading) return <p className="text-sm text-neutral-500">Yuklanmoqda…</p>;
  if (isError)
    return (
      <div className="card p-6 text-sm text-red-600">
        Menyuni yuklab bo‘lmadi: {apiError(error)}
      </div>
    );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="card p-3 sm:p-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] h-10 px-3 rounded-lg border border-line bg-white">
          <Search size={15} className="text-neutral-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Taom qidirish…"
            className="flex-1 outline-none text-sm bg-transparent min-w-0"
          />
        </div>
        <p className="text-xs text-neutral-500 px-1">
          {categories.length} ta bo‘lim · {items.length} ta taom ·{' '}
          <span className="text-emerald-700 font-semibold">{availableCount} ta mavjud</span>
        </p>
        <div className="flex gap-2 ml-auto">
          <button type="button" onClick={() => setEditingCat('new')} className="btn-secondary">
            <FolderPlus size={16} /> Bo‘lim
          </button>
          <button
            type="button"
            onClick={() => setEditingItem({ item: null, categoryId: categories[0]?.id ?? null })}
            className="btn-primary"
          >
            <Plus size={16} /> Taom qo‘shish
          </button>
        </div>
      </div>

      {!categories.length && !items.length && (
        <div className="card p-8 text-center text-sm text-neutral-500">
          <UtensilsCrossed size={28} className="mx-auto mb-2 text-neutral-300" />
          Menyu hali bo‘sh.
          <br />
          Avval bo‘lim qo‘shing (masalan: “Birinchi taomlar”, “Ichimliklar”), so‘ng taomlarni kiriting.
        </div>
      )}

      {groups.map((g, gi) => {
        const catIdx = g.cat ? categories.findIndex((c) => c.id === g.cat!.id) : -1;
        const total = g.cat ? items.filter((i) => i.categoryId === g.cat!.id).length : g.items.length;
        return (
          <section key={g.cat?.id ?? `none-${gi}`} className="card overflow-hidden">
            <header className="px-4 py-3 flex items-center gap-2 flex-wrap border-b border-line bg-neutral-50/60">
              <div className="flex-1 min-w-[140px]">
                <h3 className="font-bold">
                  {g.cat ? g.cat.name : 'Bo‘limsiz'}
                  <span className="ml-2 text-xs font-medium text-neutral-500">{total} ta</span>
                </h3>
                {!g.cat && (
                  <p className="text-[11px] text-neutral-500">
                    Bo‘limga biriktirilmagan taomlar — mijozga ro‘yxat oxirida ko‘rinadi
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {g.cat && (
                  <>
                    <IconBtn title="Yuqoriga" onClick={() => moveCategory(catIdx, -1)}>
                      <ArrowUp size={15} className={catIdx <= 0 ? 'opacity-30' : ''} />
                    </IconBtn>
                    <IconBtn title="Pastga" onClick={() => moveCategory(catIdx, 1)}>
                      <ArrowDown
                        size={15}
                        className={catIdx >= categories.length - 1 ? 'opacity-30' : ''}
                      />
                    </IconBtn>
                    <IconBtn title="Nomini o‘zgartirish" onClick={() => setEditingCat(g.cat)}>
                      <Pencil size={15} />
                    </IconBtn>
                    <IconBtn title="Bo‘limni o‘chirish" tone="red" onClick={() => removeCategory(g.cat!, total)}>
                      <Trash2 size={15} />
                    </IconBtn>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setEditingItem({ item: null, categoryId: g.cat?.id ?? null })}
                  className="h-9 px-3 rounded-lg bg-ink text-gold text-xs font-bold inline-flex items-center gap-1"
                >
                  <Plus size={14} /> Taom
                </button>
              </div>
            </header>

            {!g.items.length ? (
              <p className="px-4 py-5 text-xs text-neutral-500">
                {q.trim() ? 'Qidiruvga mos taom yo‘q' : 'Bu bo‘limda hali taom yo‘q'}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {g.items.map((it, idx) => (
                  <li
                    key={it.id}
                    className={
                      'px-3 sm:px-4 py-3 flex items-start sm:items-center gap-3 flex-wrap sm:flex-nowrap ' +
                      (pending[`item-${it.id}`] ? 'opacity-50' : '')
                    }
                  >
                    <Thumb url={it.photoUrl} dim={!it.isAvailable} />
                    <div className="flex-1 min-w-[160px]">
                      <p className="leading-tight flex items-center gap-1.5 flex-wrap">
                        <span className={'font-semibold ' + (it.isAvailable ? '' : 'text-neutral-400 line-through')}>
                          {it.name}
                        </span>
                        <ItemKindBadge kind={it.kind} />
                      </p>
                      {it.description && (
                        <p className="text-xs text-neutral-500 line-clamp-2 mt-0.5">{it.description}</p>
                      )}
                      <p className="text-sm font-bold tabular-nums mt-1">
                        {som(it.price)} <span className="text-[10px] font-normal text-neutral-500">so‘m</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
                      <button
                        type="button"
                        disabled={!!pending[`avail-${it.id}`]}
                        onClick={() => toggleAvailable(it)}
                        title="Bosib holatini almashtiring"
                        className={
                          'h-9 px-3 rounded-lg text-xs font-bold border inline-flex items-center gap-1.5 min-w-[96px] justify-center disabled:opacity-50 ' +
                          (it.isAvailable
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-red-50 text-red-700 border-red-200')
                        }
                      >
                        <span
                          className={'w-2 h-2 rounded-full ' + (it.isAvailable ? 'bg-emerald-500' : 'bg-red-500')}
                        />
                        {it.isAvailable ? 'Mavjud' : 'Tugagan'}
                      </button>
                      <IconBtn title="Yuqoriga" onClick={() => moveItem(g.items, idx, -1)}>
                        <ArrowUp size={15} className={idx === 0 ? 'opacity-30' : ''} />
                      </IconBtn>
                      <IconBtn title="Pastga" onClick={() => moveItem(g.items, idx, 1)}>
                        <ArrowDown size={15} className={idx === g.items.length - 1 ? 'opacity-30' : ''} />
                      </IconBtn>
                      <IconBtn title="Tahrirlash" onClick={() => setEditingItem({ item: it, categoryId: it.categoryId })}>
                        <Pencil size={15} />
                      </IconBtn>
                      <IconBtn title="O‘chirish" tone="red" onClick={() => removeItem(it)}>
                        <Trash2 size={15} />
                      </IconBtn>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {editingCat && (
        <CategoryForm
          base={base}
          initial={editingCat === 'new' ? null : editingCat}
          nextSort={categories.reduce((m, c) => Math.max(m, c.sort), 0) + 10}
          onClose={() => setEditingCat(null)}
          onSaved={invalidate}
        />
      )}
      {editingItem && (
        <ItemForm
          base={base}
          uploadPath={upload}
          initial={editingItem.item}
          defaultCategoryId={editingItem.categoryId}
          categories={categories}
          items={items}
          onClose={() => setEditingItem(null)}
          onSaved={invalidate}
        />
      )}
    </div>
  );
}

function Thumb({ url, dim }: { url: string | null; dim?: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <span
      className={
        'w-14 h-14 rounded-xl overflow-hidden bg-neutral-100 border border-line flex items-center justify-center shrink-0 text-neutral-300 ' +
        (dim ? 'opacity-50 grayscale' : '')
      }
    >
      {url && !broken ? (
        <img src={resolveMediaUrl(url)} alt="" onError={() => setBroken(true)} className="w-full h-full object-cover" />
      ) : (
        <ImageIcon size={20} />
      )}
    </span>
  );
}

function CategoryForm({
  base,
  initial,
  nextSort,
  onClose,
  onSaved,
}: {
  base: string;
  initial: MenuCategory | null;
  nextSort: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [sort, setSort] = useState(initial ? String(initial.sort ?? 0) : '');
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Bo‘lim nomini kiriting');
      return (
        await api.post(`${base}/categories`, {
          ...(initial ? { id: initial.id } : {}),
          name: name.trim(),
          sort: sort.trim() === '' ? (initial ? initial.sort : nextSort) : Number(sort) || 0,
        })
      ).data;
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (e) => setErr(apiError(e)),
  });

  return (
    <Modal title={initial ? 'Bo‘limni tahrirlash' : 'Yangi bo‘lim'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          save.mutate();
        }}
        className="space-y-3"
      >
        <Field label="Bo‘lim nomi">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Masalan: Milliy taomlar"
            className="input"
          />
        </Field>
        <Field label="Tartib raqami (kichigi yuqorida)">
          <input
            value={sort}
            onChange={(e) => setSort(e.target.value.replace(/[^\d-]/g, ''))}
            inputMode="numeric"
            placeholder="avtomatik"
            className="input tabular-nums"
          />
        </Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} className="btn-secondary">
            Bekor qilish
          </button>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ItemForm({
  base,
  uploadPath,
  initial,
  defaultCategoryId,
  categories,
  items,
  onClose,
  onSaved,
}: {
  base: string;
  uploadPath: string;
  initial: MenuItem | null;
  defaultCategoryId: string | null;
  categories: MenuCategory[];
  items: MenuItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [price, setPrice] = useState(initial ? String(Math.round(Number(initial.price))) : '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(initial?.photoUrl ?? null);
  const [categoryId, setCategoryId] = useState<string>(
    (initial ? initial.categoryId : defaultCategoryId) ?? '',
  );
  const [isAvailable, setIsAvailable] = useState(initial?.isAvailable ?? true);
  const [kind, setKind] = useState<MenuItemKind>(
    initial?.kind === 'raw' || initial?.kind === 'semi' ? initial.kind : 'dish',
  );
  const [sort, setSort] = useState(initial ? String(initial.sort ?? 0) : '');
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (name.trim().length < 2) throw new Error('Taom nomini kiriting');
      const p = Number(price);
      if (!Number.isFinite(p) || p <= 0) throw new Error('Narx musbat son bo‘lsin');
      // New dishes go to the end of their category unless a number is given.
      const autoSort =
        items
          .filter((i) => (i.categoryId ?? '') === categoryId)
          .reduce((m, i) => Math.max(m, i.sort), 0) + 10;
      return (
        await api.post(`${base}/items`, {
          ...(initial ? { id: initial.id } : {}),
          name: name.trim(),
          description: description.trim() || null,
          price: p,
          photoUrl,
          categoryId: categoryId || null,
          isAvailable,
          kind,
          sort: sort.trim() === '' ? (initial ? initial.sort : autoSort) : Number(sort) || 0,
        })
      ).data;
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onError: (e) => setErr(apiError(e)),
  });

  return (
    <Modal title={initial ? 'Taomni tahrirlash' : 'Yangi taom'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          save.mutate();
        }}
        className="space-y-3"
      >
        <div>
          <span className="label">Rasm</span>
          <div className="mt-1">
            <PhotoUpload value={photoUrl} onChange={setPhotoUrl} uploadPath={uploadPath} />
          </div>
        </div>
        <Field label="Nomi">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="Masalan: Osh (1 porsiya)"
            className="input"
          />
        </Field>
        <Field label="Tavsif (ixtiyoriy)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Tarkibi, og‘irligi…"
            className="input h-auto py-2 min-h-[72px]"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Narxi (so‘m)">
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric"
              placeholder="35000"
              className="input tabular-nums"
            />
          </Field>
          <Field label="Tartib raqami">
            <input
              value={sort}
              onChange={(e) => setSort(e.target.value.replace(/[^\d-]/g, ''))}
              inputMode="numeric"
              placeholder="avtomatik"
              className="input tabular-nums"
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Bo‘lim">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input">
              <option value="">— Bo‘limsiz —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Turi">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as MenuItemKind)}
              className="input"
            >
              {(Object.keys(MENU_KIND_LABEL) as MenuItemKind[]).map((k) => (
                <option key={k} value={k}>
                  {MENU_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex gap-2">
          {[true, false].map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => setIsAvailable(v)}
              className={
                'flex-1 h-10 rounded-lg text-sm font-bold border ' +
                (isAvailable === v
                  ? v
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-red-600 text-white border-red-600'
                  : 'bg-white text-neutral-500 border-line')
              }
            >
              {v ? 'Mavjud' : 'Tugagan'}
            </button>
          ))}
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} className="btn-secondary">
            Bekor qilish
          </button>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

import { useState } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  useListShoppingList,
  getListShoppingListQueryKey,
  useAddToShoppingList,
  useUpdateShoppingListItem,
  useDeleteShoppingListItem,
  useClearCheckedShoppingList,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ShoppingCart, Plus, Trash2, Loader2, X, Package, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ShoppingListPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState("");
  const [addQty, setAddQty] = useState(1);
  const [addNote, setAddNote] = useState("");

  const { data: items = [], isLoading } = useListShoppingList({
    query: { queryKey: getListShoppingListQueryKey() },
  });

  const add = useAddToShoppingList();
  const update = useUpdateShoppingListItem();
  const remove = useDeleteShoppingListItem();
  const clearChecked = useClearCheckedShoppingList();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListShoppingListQueryKey() });

  const handleAdd = () => {
    if (!addName.trim()) return;
    add.mutate(
      { data: { name: addName.trim(), quantity: addQty, note: addNote || undefined } },
      {
        onSuccess: () => {
          invalidate();
          setAddName("");
          setAddQty(1);
          setAddNote("");
          setShowAddForm(false);
        },
        onError: () => toast({ title: t("shopping.addFailed"), variant: "destructive" }),
      }
    );
  };

  const handleToggle = (id: number, checked: boolean) => {
    update.mutate(
      { id, data: { checked } },
      { onSuccess: invalidate }
    );
  };

  const handleDelete = (id: number) => {
    remove.mutate(
      { id },
      {
        onSuccess: invalidate,
        onError: () => toast({ title: t("shopping.deleteFailed"), variant: "destructive" }),
      }
    );
  };

  const handleClearChecked = () => {
    clearChecked.mutate(undefined, { onSuccess: invalidate });
  };

  const handleClearAll = () => {
    if (!confirm(t("shopping.confirmClearAll"))) return;
    Promise.all(items.map((item) => remove.mutateAsync({ id: item.id }))).then(invalidate);
  };

  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          <div className="mx-auto max-w-2xl space-y-6">

            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("shopping.title")}</h1>
                <p className="text-muted-foreground mt-1">{t("shopping.subtitle")}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {checked.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearChecked}
                    disabled={clearChecked.isPending}
                    className="text-muted-foreground"
                  >
                    <CheckSquare className="w-4 h-4 mr-2" />
                    {t("shopping.clearChecked")}
                  </Button>
                )}
                <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
                  <Plus className="w-4 h-4 mr-2" />
                  {t("shopping.addManual")}
                </Button>
              </div>
            </div>

            {/* Add form */}
            {showAddForm && (
              <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("shopping.addManual")}
                </div>
                <div className="flex gap-3">
                  <Input
                    placeholder={t("shopping.namePlaceholder")}
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                    autoFocus
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min={1}
                    value={addQty}
                    onChange={(e) => setAddQty(Math.max(1, Number(e.target.value)))}
                    className="w-20 shrink-0"
                    placeholder={t("shopping.quantity")}
                  />
                </div>
                <Input
                  placeholder={t("shopping.notePlaceholder")}
                  value={addNote}
                  onChange={(e) => setAddNote(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)}>
                    <X className="w-4 h-4 mr-2" />
                    {t("shopping.cancel")}
                  </Button>
                  <Button size="sm" onClick={handleAdd} disabled={!addName.trim() || add.isPending}>
                    {add.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                    {t("shopping.add")}
                  </Button>
                </div>
              </div>
            )}

            {/* List */}
            {isLoading ? (
              <div className="flex justify-center p-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <div className="bg-card border border-border rounded-xl p-12 text-center space-y-3">
                <ShoppingCart className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                <div className="font-medium text-muted-foreground">{t("shopping.emptyList")}</div>
                <div className="text-sm text-muted-foreground/60">{t("shopping.emptyHint")}</div>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
                {/* Unchecked items */}
                {unchecked.map((item) => (
                  <ShoppingRow
                    key={item.id}
                    item={item}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                    onNoteChange={(id, note) =>
                      update.mutate({ id, data: { note } }, { onSuccess: invalidate })
                    }
                  />
                ))}

                {/* Checked items section */}
                {checked.length > 0 && (
                  <>
                    {unchecked.length > 0 && (
                      <div className="px-4 py-2 bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                        {t("shopping.clearChecked")} ({checked.length})
                      </div>
                    )}
                    {checked.map((item) => (
                      <ShoppingRow
                        key={item.id}
                        item={item}
                        onToggle={handleToggle}
                        onDelete={handleDelete}
                        onNoteChange={(id, note) =>
                          update.mutate({ id, data: { note } }, { onSuccess: invalidate })
                        }
                      />
                    ))}
                  </>
                )}
              </div>
            )}

            {/* Clear all */}
            {items.length > 0 && (
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAll}
                  className="text-destructive/60 hover:text-destructive text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  {t("shopping.clearAll")}
                </Button>
              </div>
            )}

          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

type SLItem = {
  id: number;
  itemId?: number | null;
  name: string;
  quantity: number;
  unit?: string | null;
  note?: string | null;
  checked: boolean;
};

function ShoppingRow({
  item,
  onToggle,
  onDelete,
  onNoteChange,
}: {
  item: SLItem;
  onToggle: (id: number, checked: boolean) => void;
  onDelete: (id: number) => void;
  onNoteChange: (id: number, note: string | null) => void;
}) {
  const [editingNote, setEditingNote] = useState(false);
  const [noteVal, setNoteVal] = useState(item.note ?? "");

  const saveNote = () => {
    setEditingNote(false);
    onNoteChange(item.id, noteVal || null);
  };

  return (
    <div
      className={cn(
        "group px-4 py-3 flex items-start gap-3 transition-colors hover:bg-muted/10",
        item.checked && "opacity-50"
      )}
    >
      <Checkbox
        checked={item.checked}
        onCheckedChange={(v) => onToggle(item.id, !!v)}
        className="mt-0.5 shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className={cn("font-medium leading-tight", item.checked && "line-through text-muted-foreground")}>
          {item.name}
          {item.unit && (
            <span className="ml-2 text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {item.quantity} {item.unit}
            </span>
          )}
          {!item.unit && item.quantity > 1 && (
            <span className="ml-2 text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {item.quantity}
            </span>
          )}
          {item.itemId && (
            <span className="ml-2 text-xs text-muted-foreground/50 inline-flex items-center gap-1">
              <Package className="w-3 h-3" />
            </span>
          )}
        </div>
        {editingNote ? (
          <div className="mt-1.5 flex gap-2">
            <Input
              value={noteVal}
              onChange={(e) => setNoteVal(e.target.value)}
              onBlur={saveNote}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveNote();
                if (e.key === "Escape") setEditingNote(false);
              }}
              className="h-7 text-xs py-0"
              autoFocus
            />
          </div>
        ) : item.note ? (
          <div
            className="mt-0.5 text-xs text-muted-foreground cursor-text hover:text-foreground"
            onClick={() => setEditingNote(true)}
          >
            {item.note}
          </div>
        ) : (
          <div
            className="mt-0.5 text-xs text-muted-foreground/40 cursor-text hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => setEditingNote(true)}
          >
            + заметка
          </div>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
        onClick={() => onDelete(item.id)}
      >
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

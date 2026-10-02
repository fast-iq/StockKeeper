import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  useListCategories,
  getListCategoriesQueryKey,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from "@workspace/api-client-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FolderTree,
  Plus,
  Edit2,
  Trash2,
  Loader2,
  Save,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { CategoryNode } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type EditingState =
  | { type: "editing"; id: number }
  | { type: "creating"; parentId: number | null }
  | null;

function computeSubtreeCount(node: CategoryNode): number {
  return (
    node.itemCount +
    (node.children || []).reduce(
      (sum, child) => sum + computeSubtreeCount(child),
      0,
    )
  );
}

function flattenTree(
  nodes: CategoryNode[],
  result: CategoryNode[] = [],
  level = 0,
): CategoryNode[] {
  nodes.forEach((node) => {
    result.push({ ...node, name: `${"—".repeat(level)} ${node.name}` });
    if (node.children) flattenTree(node.children, result, level + 1);
  });
  return result;
}

export default function CategoriesPage() {
  const { t } = useTranslation();
  const { data: categories, isLoading } = useListCategories({
    query: { queryKey: getListCategoriesQueryKey() },
  });
  const [editing, setEditing] = useState<EditingState>(null);

  const flatCategories = categories ? flattenTree(categories) : [];

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  {t("categories.title")}
                </h1>
                <p className="text-muted-foreground mt-1">
                  {t("categories.subtitle")}
                </p>
              </div>
              <Button
                onClick={() => setEditing({ type: "creating", parentId: null })}
                disabled={
                  editing?.type === "creating" && editing.parentId === null
                }
                className="w-full sm:w-auto"
              >
                <Plus className="w-4 h-4 mr-2" /> {t("categories.newCategory")}
              </Button>
            </div>

            <div className="bg-card rounded-xl border border-border overflow-hidden">
              {isLoading ? (
                <div className="p-8 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {editing?.type === "creating" &&
                    editing.parentId === null && (
                      <CategoryForm
                        category={null}
                        defaultParentId={null}
                        allCategories={flatCategories}
                        onClose={() => setEditing(null)}
                        level={0}
                      />
                    )}
                  {categories?.length === 0 &&
                    !(
                      editing?.type === "creating" && editing.parentId === null
                    ) && (
                      <div className="p-8 text-center text-muted-foreground">
                        {t("categories.noCategories")}
                      </div>
                    )}
                  {categories?.map((cat) => (
                    <CategoryTreeRow
                      key={cat.id}
                      node={cat}
                      level={0}
                      editing={editing}
                      setEditing={setEditing}
                      allCategories={flatCategories}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

function CategoryTreeRow({
  node,
  level,
  editing,
  setEditing,
  allCategories,
}: {
  node: CategoryNode;
  level: number;
  editing: EditingState;
  setEditing: (s: EditingState) => void;
  allCategories: CategoryNode[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const deleteCategory = useDeleteCategory();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(true);

  const isEditing = editing?.type === "editing" && editing.id === node.id;
  const hasChildren = node.children && node.children.length > 0;
  const subtreeCount = computeSubtreeCount(node);

  const handleDelete = () => {
    if (confirm(t("categories.confirmDelete", { name: node.name }))) {
      deleteCategory.mutate(
        { id: node.id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: getListCategoriesQueryKey(),
            });
            toast({ title: t("categories.categoryDeleted") });
          },
          onError: () =>
            toast({
              title: t("categories.failedToDelete"),
              variant: "destructive",
            }),
        },
      );
    }
  };

  if (isEditing) {
    return (
      <>
        <CategoryForm
          category={node}
          defaultParentId={node.parentId ?? null}
          allCategories={allCategories}
          onClose={() => setEditing(null)}
          level={level}
        />
        {expanded &&
          node.children?.map((child) => (
            <CategoryTreeRow
              key={child.id}
              node={child as CategoryNode}
              level={level + 1}
              editing={editing}
              setEditing={setEditing}
              allCategories={allCategories}
            />
          ))}
      </>
    );
  }

  return (
    <>
      <div
        className="group flex items-center justify-between hover:bg-muted/20 transition-colors"
        style={{ paddingLeft: `${level * 20}px` }}
      >
        {/* Expand/collapse toggle */}
        <div className="flex items-center gap-2 flex-1 min-w-0 p-3">
          <button
            className={cn(
              "w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0",
              !hasChildren && "opacity-0 pointer-events-none",
            )}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Color dot + icon */}
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center border border-border shrink-0 text-sm"
            style={{ backgroundColor: node.color || undefined }}
          >
            {node.icon ? (
              <span>{node.icon}</span>
            ) : (
              <FolderTree className="w-3.5 h-3.5 text-foreground/50" />
            )}
          </div>

          {/* Name + description */}
          <div className="flex-1 min-w-0">
            <div className="font-medium leading-tight truncate">
              {node.name}
            </div>
            {node.description && (
              <div className="text-xs text-muted-foreground truncate">
                {node.description}
              </div>
            )}
          </div>

          {/* Item count badge */}
          <div className="flex items-center gap-1.5 shrink-0">
            {subtreeCount > 0 && subtreeCount !== node.itemCount && (
              <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                {subtreeCount}
              </span>
            )}
            <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
              {node.itemCount}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 pr-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-primary"
            title="Добавить подкатегорию"
            onClick={() =>
              setEditing(
                editing?.type === "creating" && editing.parentId === node.id
                  ? null
                  : { type: "creating", parentId: node.id },
              )
            }
            disabled={
              editing !== null &&
              !(editing.type === "creating" && editing.parentId === node.id)
            }
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setEditing({ type: "editing", id: node.id })}
            disabled={editing !== null}
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:text-destructive"
            onClick={handleDelete}
            disabled={editing !== null}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Children */}
      {expanded && (
        <>
          {/* Inline "new child" form */}
          {editing?.type === "creating" && editing.parentId === node.id && (
            <CategoryForm
              category={null}
              defaultParentId={node.id}
              allCategories={allCategories}
              onClose={() => setEditing(null)}
              level={level + 1}
            />
          )}
          {node.children?.map((child) => (
            <CategoryTreeRow
              key={child.id}
              node={child as CategoryNode}
              level={level + 1}
              editing={editing}
              setEditing={setEditing}
              allCategories={allCategories}
            />
          ))}
        </>
      )}
    </>
  );
}

function CategoryForm({
  category,
  defaultParentId,
  onClose,
  allCategories,
  level = 0,
}: {
  category: CategoryNode | null;
  defaultParentId: number | null;
  onClose: () => void;
  allCategories: CategoryNode[];
  level?: number;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const { toast } = useToast();

  const isNew = !category;
  const isPending = createCategory.isPending || updateCategory.isPending;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const parentIdRaw = formData.get("parentId") as string;
    const parsedParentId =
      parentIdRaw && parentIdRaw !== "none" ? Number(parentIdRaw) : null;

    const data = {
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      parentId: isNaN(parsedParentId as number) ? null : parsedParentId,
      color: (formData.get("color") as string) || null,
      icon: (formData.get("icon") as string) || null,
    };

    if (isNew) {
      createCategory.mutate(
        { data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: getListCategoriesQueryKey(),
            });
            toast({ title: t("categories.categoryCreated") });
            onClose();
          },
          onError: () =>
            toast({
              title: t("categories.errorCreating"),
              variant: "destructive",
            }),
        },
      );
    } else {
      updateCategory.mutate(
        { id: category.id, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: getListCategoriesQueryKey(),
            });
            toast({ title: t("categories.categoryUpdated") });
            onClose();
          },
          onError: () =>
            toast({
              title: t("categories.errorUpdating"),
              variant: "destructive",
            }),
        },
      );
    }
  };

  const parentDefault =
    defaultParentId != null ? String(defaultParentId) : "none";

  return (
    <div
      className="bg-muted/20 border-b border-border"
      style={{ paddingLeft: `${level * 20 + 12}px` }}
    >
      <form
        onSubmit={handleSubmit}
        className="p-4 bg-card m-3 rounded-lg border border-border shadow-sm space-y-4"
      >
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isNew
            ? defaultParentId != null
              ? "Новая подкатегория"
              : t("categories.newCategory")
            : "Редактировать категорию"}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              {t("categories.categoryName")}{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              name="name"
              defaultValue={category?.name}
              required
              placeholder={t("categories.namePlaceholder")}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="parentId">{t("categories.parentCategory")}</Label>
            <Select name="parentId" defaultValue={parentDefault}>
              <SelectTrigger>
                <SelectValue placeholder={t("categories.noneRootLevel")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  {t("categories.noneRootLevel")}
                </SelectItem>
                {allCategories
                  .filter((c) => c.id !== category?.id)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="color">{t("categories.colorHex")}</Label>
            <div className="flex gap-2">
              <Input
                type="color"
                id="color-picker"
                defaultValue={category?.color || "#e2e8f0"}
                className="w-12 p-1 cursor-pointer"
                onChange={(e) => {
                  const inp = e.currentTarget
                    .closest("form")
                    ?.querySelector<HTMLInputElement>('input[name="color"]');
                  if (inp) inp.value = e.target.value;
                }}
              />
              <Input
                id="color"
                name="color"
                defaultValue={category?.color || ""}
                placeholder="#e2e8f0"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="icon">{t("categories.iconIdentifier")}</Label>
            <Input
              id="icon"
              name="icon"
              defaultValue={category?.icon || ""}
              placeholder={t("categories.iconPlaceholder")}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">{t("categories.description")}</Label>
          <Textarea
            id="description"
            name="description"
            defaultValue={category?.description || ""}
            rows={2}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
          >
            <X className="w-4 h-4 mr-2" /> {t("categories.cancel")}
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {isNew ? t("categories.createNode") : t("categories.saveChanges")}
          </Button>
        </div>
      </form>
    </div>
  );
}

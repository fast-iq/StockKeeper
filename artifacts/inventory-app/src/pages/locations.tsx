import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Plus, Edit2, Trash2, Loader2, Save, X, Home, Warehouse, Car, Building2, Package, Archive } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type StorageLocation = {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  itemCount: number;
};

const ICON_OPTIONS = [
  { value: "home", label: "Дом", Icon: Home },
  { value: "warehouse", label: "Склад", Icon: Warehouse },
  { value: "car", label: "Гараж", Icon: Car },
  { value: "building2", label: "Здание", Icon: Building2 },
  { value: "package", label: "Коробка", Icon: Package },
  { value: "archive", label: "Архив", Icon: Archive },
];

function getIconComponent(iconName: string | null) {
  const found = ICON_OPTIONS.find((i) => i.value === iconName);
  return found?.Icon ?? Warehouse;
}

function useLocations() {
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = () => {
    setIsLoading(true);
    fetch(`${BASE}/api/locations`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setLocations(data); })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  };

  useEffect(() => { load(); }, []);
  return { locations, isLoading, reload: load };
}

function LocationForm({
  location,
  onClose,
  onSaved,
}: {
  location: StorageLocation | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(location?.name ?? "");
  const [description, setDescription] = useState(location?.description ?? "");
  const [icon, setIcon] = useState(location?.icon ?? "warehouse");

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const method = location ? "PATCH" : "POST";
      const url = location ? `${BASE}/api/locations/${location.id}` : `${BASE}/api/locations`;
      const r = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, icon }),
      });
      if (!r.ok) throw new Error("Ошибка сохранения");
      toast({ title: location ? "Место обновлено" : "Место создано" });
      onSaved();
      onClose();
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 bg-muted/30 border-b border-border space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label>Название <span className="text-destructive">*</span></Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Дом, Гараж, Склад..."
            className="bg-background"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label>Иконка</Label>
          <Select value={icon} onValueChange={setIcon}>
            <SelectTrigger className="bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ICON_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="flex items-center gap-2">
                    <opt.Icon className="w-4 h-4" /> {opt.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Описание</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Необязательное описание"
            className="bg-background min-h-[38px] h-[38px] resize-none"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {location ? "Сохранить" : "Создать"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}><X className="w-4 h-4 mr-1" /> Отмена</Button>
      </div>
    </div>
  );
}

function LocationRow({
  loc,
  editingId,
  setEditingId,
  onReload,
}: {
  loc: StorageLocation;
  editingId: number | "new" | null;
  setEditingId: (v: number | "new" | null) => void;
  onReload: () => void;
}) {
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);
  const IconComp = getIconComponent(loc.icon);

  const handleDelete = async () => {
    if (!confirm(`Удалить место хранения «${loc.name}»? Товары не удалятся, но потеряют привязку к нему.`)) return;
    setDeleting(true);
    try {
      await fetch(`${BASE}/api/locations/${loc.id}`, { method: "DELETE", credentials: "include" });
      toast({ title: "Место удалено" });
      onReload();
    } catch {
      toast({ title: "Ошибка удаления", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  if (editingId === loc.id) {
    return (
      <div>
        <LocationForm location={loc} onClose={() => setEditingId(null)} onSaved={onReload} />
      </div>
    );
  }

  return (
    <div className="px-4 py-3 flex items-center gap-4 hover:bg-muted/20 transition-colors group">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <IconComp className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium">{loc.name}</div>
        {loc.description && (
          <div className="text-sm text-muted-foreground truncate">{loc.description}</div>
        )}
      </div>
      <div className="text-sm text-muted-foreground font-mono shrink-0">
        {loc.itemCount} {loc.itemCount === 1 ? "товар" : loc.itemCount >= 2 && loc.itemCount <= 4 ? "товара" : "товаров"}
      </div>
      <div className={cn("flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity", "shrink-0")}>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(loc.id)} disabled={editingId !== null}>
          <Edit2 className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={handleDelete} disabled={deleting}>
          {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </Button>
      </div>
    </div>
  );
}

export default function LocationsPage() {
  const { locations, isLoading, reload } = useLocations();
  const [editingId, setEditingId] = useState<number | "new" | null>(null);

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="max-w-4xl mx-auto space-y-6">

            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight">Места хранения</h1>
                <p className="text-muted-foreground mt-1">Управление физическими местами хранения товаров</p>
              </div>
              <Button onClick={() => setEditingId("new")} disabled={editingId === "new"}>
                <Plus className="w-4 h-4 mr-2" /> Добавить место
              </Button>
            </div>

            <div className="bg-card rounded-xl border border-border overflow-hidden">
              {isLoading ? (
                <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="divide-y divide-border">
                  {editingId === "new" && (
                    <LocationForm location={null} onClose={() => setEditingId(null)} onSaved={reload} />
                  )}
                  {locations.length === 0 && editingId !== "new" && (
                    <div className="p-8 text-center text-muted-foreground">
                      <MapPin className="w-8 h-8 mx-auto mb-3 opacity-30" />
                      <p>Места хранения не созданы</p>
                      <p className="text-sm mt-1">Добавьте место, чтобы привязывать товары к нему</p>
                    </div>
                  )}
                  {locations.map((loc) => (
                    <LocationRow
                      key={loc.id}
                      loc={loc}
                      editingId={editingId}
                      setEditingId={setEditingId}
                      onReload={reload}
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

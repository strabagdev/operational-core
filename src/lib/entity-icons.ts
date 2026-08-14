import {
  Boxes,
  Building,
  Calendar,
  ChartNoAxesColumn,
  CircleDollarSign,
  Clipboard,
  ClipboardCheck,
  Clock,
  Construction,
  Database,
  Factory,
  FileText,
  Folder,
  HardHat,
  Map as MapIcon,
  MapPin,
  Package,
  Pickaxe,
  Ruler,
  Settings,
  Shield,
  Tag,
  TriangleAlert,
  Truck,
  UserRound,
  Users,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export const entityIconOptions = [
  { key: "warehouse", label: "Bodega", icon: Warehouse },
  { key: "package", label: "Paquete", icon: Package },
  { key: "boxes", label: "Cajas", icon: Boxes },
  { key: "truck", label: "Transporte", icon: Truck },
  { key: "hard-hat", label: "Casco", icon: HardHat },
  { key: "construction", label: "Construcción", icon: Construction },
  { key: "wrench", label: "Herramienta", icon: Wrench },
  { key: "users", label: "Personas", icon: Users },
  { key: "user-round", label: "Persona", icon: UserRound },
  { key: "clipboard", label: "Portapapeles", icon: Clipboard },
  { key: "clipboard-check", label: "Checklist", icon: ClipboardCheck },
  { key: "file-text", label: "Documento", icon: FileText },
  { key: "folder", label: "Carpeta", icon: Folder },
  { key: "map", label: "Mapa", icon: MapIcon },
  { key: "map-pin", label: "Ubicación", icon: MapPin },
  { key: "ruler", label: "Regla", icon: Ruler },
  { key: "pickaxe", label: "Faena", icon: Pickaxe },
  { key: "factory", label: "Planta", icon: Factory },
  { key: "building", label: "Edificio", icon: Building },
  { key: "calendar", label: "Calendario", icon: Calendar },
  { key: "clock", label: "Hora", icon: Clock },
  { key: "shield", label: "Seguridad", icon: Shield },
  { key: "triangle-alert", label: "Alerta", icon: TriangleAlert },
  { key: "circle-dollar-sign", label: "Costo", icon: CircleDollarSign },
  { key: "chart-no-axes-column", label: "Indicador", icon: ChartNoAxesColumn },
  { key: "database", label: "Datos", icon: Database },
  { key: "tag", label: "Etiqueta", icon: Tag },
  { key: "settings", label: "Configuración", icon: Settings },
] as const satisfies Array<{ key: string; label: string; icon: LucideIcon }>;

export type EntityIconKey = (typeof entityIconOptions)[number]["key"];

const entityIconsByKey: Map<string, (typeof entityIconOptions)[number]> = new Map(
  entityIconOptions.map((option) => [option.key, option]),
);

export function isEntityIconKey(value: string): value is EntityIconKey {
  return entityIconsByKey.has(value);
}

export function normalizeEntityIcon(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized && isEntityIconKey(normalized) ? normalized : null;
}

export function getEntityIconOption(key: string | null | undefined) {
  if (!key) {
    return null;
  }

  return entityIconsByKey.get(key) ?? null;
}

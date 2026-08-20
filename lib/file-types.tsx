import {
  FileText,
  FileSpreadsheet,
  Presentation,
  Image as ImageIcon,
  File as FileIcon,
} from "lucide-react";

/* The file vocabulary, shared by the Files page and the task editor.
 *
 * Kept in one place so a given kind of file carries the same icon and colour
 * wherever it is shown — a spreadsheet that looks like a deck in one view and
 * a spreadsheet in another costs the reader more than the duplication saves. */

export const FILE_TYPES = ["doc", "pdf", "excel", "image", "slides"] as const;
export type FileType = (typeof FILE_TYPES)[number];

export const TYPE_META: Record<
  FileType,
  { label: string; color: string; icon: typeof FileText }
> = {
  image: { label: "Image", color: "pink", icon: ImageIcon },
  pdf: { label: "PDF", color: "red", icon: FileText },
  excel: { label: "Excel", color: "green", icon: FileSpreadsheet },
  slides: { label: "Slides", color: "amber", icon: Presentation },
  doc: { label: "Doc", color: "blue", icon: FileIcon },
};

export function typeMeta(type: string) {
  return TYPE_META[type as FileType] ?? TYPE_META.doc;
}

/** Best-effort type inference from a URL's extension — used when a link is
 *  dropped/pasted so the picker can default to something sensible. */
export function inferType(url: string): FileType {
  // Hosted documents carry the kind in the path rather than an extension —
  // a Sheets link has no ".xlsx" to read, so the extension check alone
  // filed every Drive link as a plain doc.
  const lower = url.toLowerCase();
  if (lower.includes("/spreadsheets/") || lower.includes("sheets.google.com")) return "excel";
  if (lower.includes("/presentation/") || lower.includes("slides.google.com")) return "slides";
  if (lower.includes("/document/") || lower.includes("docs.google.com")) return "doc";

  const ext = url.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (["xls", "xlsx", "csv"].includes(ext)) return "excel";
  if (["ppt", "pptx", "key"].includes(ext)) return "slides";
  return "doc";
}

/** The icon for a file's type, at the size the lists use. */
export function FileTypeIcon({ type, className }: { type: string; className?: string }) {
  const Icon = typeMeta(type).icon;
  return <Icon className={className ?? "text-muted-foreground size-3.5 shrink-0"} />;
}

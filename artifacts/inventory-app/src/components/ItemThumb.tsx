import { Package } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// Photos are always served through the API image proxy: catalogues
// hotlink-protect their images (403 for foreign Referer) and some links are
// plain http, which an https page would refuse to load.
export function photoSrc(url?: string | null): string | null {
  const trimmed = url?.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null;
  return `${BASE}/api/data-sources/photo?url=${encodeURIComponent(trimmed)}`;
}

// Debounced proxy URL for edit forms: avoids one upstream image request per
// typed keystroke while the user is still entering the URL.
export function usePhotoPreview(url: string): string | null {
  const [settled, setSettled] = useState(url);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(url), 400);
    return () => clearTimeout(timer);
  }, [url]);
  return photoSrc(settled);
}

type ItemThumbProps = {
  src?: string | null;
  alt: string;
  className?: string;
  iconClassName?: string;
};

export function ItemThumb({
  src,
  alt,
  className,
  iconClassName,
}: ItemThumbProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const url = photoSrc(src);

  if (!url || failedSrc === url) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground",
          className,
        )}
      >
        <Package className={cn("h-4 w-4", iconClassName)} />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      onError={() => setFailedSrc(url)}
      className={cn(
        "shrink-0 rounded-md border border-border bg-muted object-contain",
        className,
      )}
    />
  );
}

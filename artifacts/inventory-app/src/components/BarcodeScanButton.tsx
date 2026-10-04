import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { Camera, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cameraErrorKey } from "@/lib/barcode-camera";

export function BarcodeScanButton({
  onScan,
}: {
  onScan: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0"
          title={t("barcodeScanner.scan")}
          aria-label={t("barcodeScanner.scan")}
        >
          <Camera className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%_-_2rem)] max-h-[90dvh] overflow-y-auto rounded-xl p-4 sm:p-6">
        <DialogHeader className="pr-6">
          <DialogTitle>{t("barcodeScanner.title")}</DialogTitle>
          <DialogDescription>{t("barcodeScanner.hint")}</DialogDescription>
        </DialogHeader>
        <CameraSession
          active={open}
          onScan={(value) => {
            setOpen(false);
            onScan(value);
          }}
          onClose={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function CameraSession({
  active,
  onScan,
  onClose,
}: {
  active: boolean;
  onScan: (value: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  onScanRef.current = onScan;
  onCloseRef.current = onClose;
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!active) return;
    let disposed = false;
    let stream: MediaStream | undefined;
    let controls: IScannerControls | undefined;
    const video = videoRef.current;
    const stop = () => {
      disposed = true;
      controls?.stop();
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
    const hidden = () => {
      if (document.hidden) {
        stop();
        onCloseRef.current();
      }
    };
    document.addEventListener("visibilitychange", hidden);
    setStarting(true);
    setError(null);

    const start = async () => {
      if (!window.isSecureContext) {
        setError("barcodeScanner.httpsRequired");
        setStarting(false);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia || !video) {
        setError("barcodeScanner.unsupported");
        setStarting(false);
        return;
      }
      try {
        // Lazy loading keeps the decoder out of the normal inventory bundle.
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (disposed) return;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        // A permission prompt can resolve after the dialog was already closed.
        if (disposed) {
          stop();
          return;
        }
        for (const track of stream.getVideoTracks()) {
          track.addEventListener("ended", () => {
            if (!disposed) {
              stop();
              setError("barcodeScanner.failed");
              setStarting(false);
            }
          });
        }
        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 200,
          delayBetweenScanSuccess: 1000,
        });
        controls = await reader.decodeFromStream(
          stream,
          video,
          (result, _error, scanControls) => {
            if (disposed || !result) return;
            const value = result.getText();
            if (!value) return;
            scanControls.stop();
            stop();
            onScanRef.current(value);
          },
        );
        if (disposed) controls.stop();
        else setStarting(false);
      } catch (cause) {
        if (!disposed) {
          stop();
          setError(cameraErrorKey(cause));
          setStarting(false);
        }
      }
    };
    void start();
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      stop();
    };
  }, [active, attempt]);

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          aria-label={t("barcodeScanner.preview")}
          className="h-full w-full object-contain"
        />
        {!error && (
          <div className="pointer-events-none absolute inset-x-5 top-1/2 h-28 -translate-y-1/2 rounded-lg border-2 border-white/70" />
        )}
        {starting && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            <span role="status">{t("barcodeScanner.starting")}</span>
          </div>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          {t("barcodeScanner.scanning")}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {t("barcodeScanner.privacy")}
      </p>
      <div className="flex flex-wrap gap-2">
        {error && (
          <Button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {t("barcodeScanner.retry")}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onClose}>
          {t("barcodeScanner.manual")}
        </Button>
      </div>
    </div>
  );
}

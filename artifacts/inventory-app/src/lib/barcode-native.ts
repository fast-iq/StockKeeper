import {
  BarcodeScanner,
  GoogleBarcodeScannerModuleInstallState,
} from "@capacitor-mlkit/barcode-scanning";

/** The native scanner UI was closed without a recognized barcode. */
export class ScanCanceledError extends Error {}

/** A camera/module failure with an existing `barcodeScanner.*` translation key. */
export class NativeScanError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(key);
    this.key = key;
  }
}

const INSTALL_TIMEOUT_MS = 120_000;

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Maps Google Barcode Scanner module reject messages to i18n keys. */
function errorKey(message: string): string {
  if (message.includes("Google Barcode Scanner Module is not available"))
    return "barcodeScanner.nativeUnavailable";
  if (message.includes("User denied access to camera."))
    return "barcodeScanner.permissionDenied";
  return "barcodeScanner.failed";
}

function withTimeout(promise: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    void promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (cause) => {
        clearTimeout(timer);
        reject(cause);
      },
    );
  });
}

async function ensureModule(
  onInstalling: ((progress: number | null) => void) | undefined,
): Promise<void> {
  const { available } =
    await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
  if (available) return;
  const handle = await BarcodeScanner.addListener(
    "googleBarcodeScannerModuleInstallProgress",
    (event) => {
      if (event.state === GoogleBarcodeScannerModuleInstallState.FAILED) return;
      onInstalling?.(
        typeof event.progress === "number" ? event.progress : null,
      );
    },
  );
  try {
    await withTimeout(
      BarcodeScanner.installGoogleBarcodeScannerModule(),
      INSTALL_TIMEOUT_MS,
    );
  } catch (cause) {
    const message = messageOf(cause);
    if (message.includes("already installed")) return;
    throw new NativeScanError(
      message === "timeout"
        ? "barcodeScanner.nativeUnavailable"
        : errorKey(message),
    );
  } finally {
    await handle.remove();
  }
}

/**
 * Runs the ready-to-use native scanner UI (Android only) and returns the
 * first recognized barcode value. Recognition happens on-device via the
 * Google Barcode Scanner module; nothing is sent to a server.
 */
export async function scanNatively(
  onInstalling?: (progress: number | null) => void,
  isDismissed?: () => boolean,
): Promise<string> {
  const { supported } = await BarcodeScanner.isSupported();
  if (!supported) throw new NativeScanError("barcodeScanner.noCamera");
  await ensureModule(onInstalling);
  if (isDismissed?.()) throw new ScanCanceledError();
  let result;
  try {
    result = await BarcodeScanner.scan();
  } catch (cause) {
    const message = messageOf(cause);
    if (message.includes("scan canceled.")) throw new ScanCanceledError();
    throw new NativeScanError(errorKey(message));
  }
  const value = result.barcodes
    .map((barcode) => barcode.rawValue ?? barcode.displayValue)
    .find((candidate) => candidate);
  if (!value) throw new ScanCanceledError();
  return value;
}

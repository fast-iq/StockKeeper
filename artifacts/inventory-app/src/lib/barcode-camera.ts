/** Camera failures are actionable; failed barcode decodes are normal scan attempts. */
export function cameraErrorKey(error: unknown): string {
  const name =
    error instanceof Error ||
    (typeof DOMException !== "undefined" && error instanceof DOMException)
      ? error.name
      : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "barcodeScanner.permissionDenied";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "barcodeScanner.noCamera";
  if (name === "NotReadableError" || name === "AbortError")
    return "barcodeScanner.cameraBusy";
  return "barcodeScanner.failed";
}

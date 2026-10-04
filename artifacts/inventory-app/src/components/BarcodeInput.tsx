import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { BarcodeScanButton } from "@/components/BarcodeScanButton";

export function BarcodeInput({ defaultValue = "" }: { defaultValue?: string }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(defaultValue);
  useEffect(() => setValue(defaultValue), [defaultValue]);
  return (
    <div className="flex items-center gap-2">
      <Input
        id="barcode"
        name="barcode"
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t("itemNew.barcodePlaceholder")}
        autoComplete="off"
        spellCheck={false}
        className="h-11 min-w-0 bg-background font-mono"
      />
      <BarcodeScanButton onScan={setValue} />
    </div>
  );
}

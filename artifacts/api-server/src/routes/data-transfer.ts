import { Router } from "express";
import {
  ExportDataQueryParams,
  PreviewDataImportBody,
  PreviewDataImportResponse,
  ImportDataBody,
  ImportDataResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { rateLimit } from "../middlewares/rate-limit";
import { exportAccount, importAccount } from "../services/transfer-data";
import { readExcel, writeExcel } from "../services/transfer-excel";
import {
  counts,
  TransferError,
  validateBundle,
} from "../services/transfer-validation";

const router = Router();
const limit = rateLimit({
  name: "data-transfer",
  windowMs: 60_000,
  max: 20,
  key: (req) => String(req.session.userId),
});

router.get(
  "/data/export",
  requireAuth,
  limit,
  async (req, res): Promise<void> => {
    const query = ExportDataQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "Укажите format=json или format=xlsx." });
      return;
    }
    const data = await exportAccount(req.session.userId!);
    const format = query.data.format;
    const file =
      format === "json"
        ? Buffer.from(JSON.stringify(data, null, 2), "utf8")
        : await writeExcel(data);
    res
      .set({
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="stockkeeper-${new Date().toISOString().slice(0, 10)}.${format}"`,
        "Cache-Control": "no-store",
      })
      .send(file);
  },
);

router.post(
  "/data/preview",
  requireAuth,
  limit,
  async (req, res): Promise<void> => {
    const parsed = PreviewDataImportBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Некорректный файл или размер больше 5 МБ." });
      return;
    }
    try {
      const { content, fileName } = parsed.data;
      if (
        !content ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(content) ||
        content.length % 4 !== 0
      ) {
        throw new TransferError("Некорректное содержимое файла.");
      }
      const file = Buffer.from(content, "base64");
      if (file.length > 5 * 1024 * 1024)
        throw new TransferError("Файл больше 5 МБ.");
      let preview;
      if (/\.xlsx$/i.test(fileName)) {
        preview = await readExcel(file);
      } else if (/\.json$/i.test(fileName)) {
        let json: unknown;
        try {
          json = JSON.parse(file.toString("utf8").replace(/^\uFEFF/, ""));
        } catch {
          throw new TransferError("Не удалось прочитать JSON.");
        }
        preview = {
          data: validateBundle(json),
          warnings: [
            "Импорт не удаляет и не перезаписывает существующие данные.",
            "Фотографии сохраняются как ссылки; файлы изображений не входят в копию.",
          ],
        };
      } else throw new TransferError("Поддерживаются только .xlsx и .json.");
      res.json(
        PreviewDataImportResponse.parse({
          ...preview,
          counts: counts(preview.data),
        }),
      );
    } catch (error) {
      if (!(error instanceof TransferError)) throw error;
      res.status(400).json({ error: error.message });
    }
  },
);

router.post(
  "/data/import",
  requireAuth,
  limit,
  async (req, res): Promise<void> => {
    const parsed = ImportDataBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Некорректные данные импорта." });
      return;
    }
    try {
      const result = await importAccount(
        req.session.userId!,
        parsed.data.data,
        parsed.data.mode,
      );
      res.json(ImportDataResponse.parse(result));
    } catch (error) {
      if (!(error instanceof TransferError)) throw error;
      res.status(400).json({ error: error.message });
    }
  },
);

export default router;

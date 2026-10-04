import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import categoriesRouter from "./categories";
import itemsRouter from "./items";
import locationsRouter from "./locations";
import dashboardRouter from "./dashboard";
import adminRouter from "./admin";
import unitsRouter from "./units";
import shoppingListRouter from "./shopping-list";
import dataTransferRouter from "./data-transfer";
import pricesRouter from "./prices";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(categoriesRouter);
router.use(itemsRouter);
router.use(locationsRouter);
router.use(unitsRouter);
router.use(dashboardRouter);
router.use(adminRouter);
router.use(shoppingListRouter);
router.use(dataTransferRouter);
router.use(pricesRouter);

export default router;

import { create } from "zustand";
import { engine } from "@/bridge/commands";
import type { ProductionCatalog } from "@/bridge/types";

type CatalogStatus = "idle" | "loading" | "ready" | "error";

interface ProductionCatalogState {
  catalog: ProductionCatalog | null;
  status: CatalogStatus;
  error: string | null;
}

export const useProductionCatalogStore = create<ProductionCatalogState>()(() => ({
  catalog: null,
  status: "idle",
  error: null,
}));

export const productionCatalogActions = {
  ensureLoaded: async () => {
    const current = useProductionCatalogStore.getState();
    if (current.status === "loading" || current.status === "ready") return current.catalog;
    useProductionCatalogStore.setState({ status: "loading", error: null });
    try {
      const catalog = await engine.getProductionCatalog();
      useProductionCatalogStore.setState({ catalog, status: "ready", error: null });
      return catalog;
    } catch (error) {
      useProductionCatalogStore.setState({
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },
  setCatalog: (catalog: ProductionCatalog | null) =>
    useProductionCatalogStore.setState({
      catalog,
      status: catalog ? "ready" : "idle",
      error: null,
    }),
  reset: () => useProductionCatalogStore.setState({ catalog: null, status: "idle", error: null }),
};

export const productionCatalogSelectors = {
  catalog: (state: ProductionCatalogState) => state.catalog,
  status: (state: ProductionCatalogState) => state.status,
  error: (state: ProductionCatalogState) => state.error,
};

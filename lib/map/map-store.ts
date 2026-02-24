/**
 * Non-visual map state — powered by Zustand.
 *
 * Manages nearby search context and province cache.
 * Accessed imperatively (no React hook needed) via mapState helpers.
 */

import { create } from 'zustand';
import type { Province } from './gtel-api';

interface MapStateData {
  provinces: Province[];
}

interface MapStateActions {
  setProvinces: (provinces: Province[]) => void;
}

const useMapStateStore = create<MapStateData & MapStateActions>((set) => ({
  provinces: [],
  setProvinces: (provinces) => set({ provinces }),
}));

/**
 * Imperative accessor — use in non-React code (tools.ts, gtel-api.ts).
 *
 * Read:  mapState.provinces
 * Write: mapState.setProvinces(ctx)
 */
export const mapState = {
  get provinces() {
    return useMapStateStore.getState().provinces;
  },
  setProvinces: (provinces: Province[]) =>
    useMapStateStore.getState().setProvinces(provinces),
};

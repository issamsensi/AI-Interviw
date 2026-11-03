import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

// Deterministic in-memory localStorage regardless of jsdom quirks.
const store = new Map<string, string>();
const storageStub: Storage = {
  get length() {
    return store.size;
  },
  clear: () => {
    store.clear();
  },
  getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
  key: (index: number) => Array.from(store.keys())[index] ?? null,
  removeItem: (key: string) => {
    store.delete(key);
  },
  setItem: (key: string, value: string) => {
    store.set(key, String(value));
  },
};

Object.defineProperty(window, "localStorage", { value: storageStub, configurable: true });

beforeEach(() => {
  store.clear();
  vi.unstubAllGlobals();
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { ApiError, api, getAnonymousId, ANON_STORAGE_KEY } from "@/lib/api";

function mockFetchOnce(status: number, body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  global.fetch = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, text: () => Promise.resolve(text) });
}

describe("anonymous identity", () => {
  beforeEach(() => window.localStorage.clear());
  it("persists one UUID across calls and sends it as header", async () => {
    mockFetchOnce(200, { resume_id: "r", raw_text: "t", filename: "cv.pdf" });
    const first = getAnonymousId();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(getAnonymousId()).toBe(first);
    expect(window.localStorage.getItem(ANON_STORAGE_KEY)).toBe(first);
    await api.uploadResume(new File(["x"], "cv.pdf", { type: "application/pdf" }));
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const sent = init.headers instanceof Headers
      ? init.headers.get("X-Anonymous-User-ID")
      : (init.headers as Record<string, string>)["X-Anonymous-User-ID"];
    expect(sent).toBe(first);
  });
  it("does not mint a new identity per request", async () => {
    mockFetchOnce(200, { status: "ok" });
    const first = getAnonymousId();
    await api.checkHealth();
    await api.checkHealth();
    expect(getAnonymousId()).toBe(first);
  });
});

describe("error handling", () => {
  it("maps provider 502 to a French retry message", async () => {
    mockFetchOnce(502, {});
    await expect(api.checkHealth()).rejects.toMatchObject({ status: 502 });
    const err = await api.checkHealth().then(
      () => { throw new Error("should have rejected"); },
      (error: unknown) => error as ApiError,
    );
    expect(err.message).toContain("retry");
  });
  it("shows backend detail verbatim when present", async () => {
    mockFetchOnce(422, { detail: "Server says no." });
    const err = await api.checkHealth().then(
      () => { throw new Error("should have rejected"); },
      (error: unknown) => error as ApiError,
    );
    expect(err.message).toBe("Server says no.");
  });
  it("maps timeouts and network failures without leaking internals", async () => {
    global.fetch = vi.fn().mockRejectedValue(new DOMException("abort", "AbortError"));
    const err = await api.checkHealth().then(
      () => { throw new Error("should have rejected"); },
      (error: unknown) => error as ApiError,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).not.toContain("AbortError");
    global.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const err2 = await api.checkHealth().then(
      () => { throw new Error("should have rejected"); },
      (error: unknown) => error as ApiError,
    );
    expect(err2.status).toBe(0);
    expect(err2.message).toContain("server");
  });
});

describe("resume upload", () => {
  it("posts multipart with the file field and returns identifiers", async () => {
    mockFetchOnce(200, { resume_id: "r1", raw_text: "t", filename: "cv.pdf" });
    const file = new File(["x"], "cv.pdf", { type: "application/pdf" });
    const result = await api.uploadResume(file);
    expect(result.resume_id).toBe("r1");
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/upload-resume");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBeTruthy();
  });
  it("surfaces upload failure for retry", async () => {
    mockFetchOnce(413, { detail: "too big" });
    const file = new File(["x"], "cv.pdf", { type: "application/pdf" });
    await expect(api.uploadResume(file)).rejects.toMatchObject({ status: 413 });
  });
});

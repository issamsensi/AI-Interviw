import { describe, expect, it, vi } from "vitest";
import {
  audioConversionSupported,
  encodeWavPcm16,
  mediaRecorderSupported,
  microphoneSupported,
  requestMicrophone,
} from "@/lib/audio";
import { validateResumeFile, validateSetup } from "@/lib/validation";

describe("WAV encoder", () => {
  it("writes a valid 16-bit mono WAV header", () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const blob = encodeWavPcm16(samples, 16000);
    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(44 + samples.length * 2);
    return blob.arrayBuffer().then((buffer) => {
      const view = new DataView(buffer);
      const ascii = (offset: number, length: number) =>
        String.fromCharCode(...new Uint8Array(buffer.slice(offset, offset + length)));
      expect(ascii(0, 4)).toBe("RIFF");
      expect(ascii(8, 4)).toBe("WAVE");
      expect(ascii(12, 4)).toBe("fmt ");
      expect(view.getUint16(20, true)).toBe(1);
      expect(view.getUint16(22, true)).toBe(1);
      expect(view.getUint32(24, true)).toBe(16000);
      expect(view.getUint16(34, true)).toBe(16);
      expect(ascii(36, 4)).toBe("data");
      expect(view.getInt16(44 + 3 * 2, true)).toBe(0x7fff);
      expect(view.getInt16(44 + 4 * 2, true)).toBe(-0x8000);
    });
  });
  it("clamps out-of-range samples", () => {
    const blob = encodeWavPcm16(new Float32Array([2, -2]), 24000);
    return blob.arrayBuffer().then((buffer) => {
      const view = new DataView(buffer);
      expect(view.getInt16(44, true)).toBe(0x7fff);
      expect(view.getInt16(46, true)).toBe(-0x8000);
    });
  });
});

describe("camera capability", () => {
  it("maps camera denial to a visible state", async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
    const { requestCamera } = await import("@/lib/audio");
    const result = await requestCamera();
    expect(result.state).toBe("denied");
    expect(result.stream).toBeNull();
  });
  it("reports camera unavailable without media devices", async () => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    const { cameraSupported, requestCamera } = await import("@/lib/audio");
    expect(cameraSupported()).toBe(false);
    expect((await requestCamera()).state).toBe("unavailable");
  });
});

describe("microphone capability detection", () => {
  it("reports unavailable without media devices", () => {
    expect(microphoneSupported()).toBe(false);
    expect(mediaRecorderSupported()).toBe(false);
    expect(audioConversionSupported()).toBe(false);
  });
  it("maps permission denial to a visible state", async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
    const result = await requestMicrophone();
    expect(result.state).toBe("denied");
  });
  it("maps missing devices to unavailable", async () => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
    const result = await requestMicrophone();
    expect(result.state).toBe("unavailable");
  });
});

describe("resume file validation", () => {
  const pdf = { name: "cv.pdf", type: "application/pdf", size: 1024 };
  it("accepts a valid PDF", () => expect(validateResumeFile(pdf)).toBeNull());
  it("rejects unsupported extensions", () => {
    expect(validateResumeFile({ name: "cv.txt", type: "text/plain", size: 10 })).toContain("Unsupported format");
  });
  it("rejects mismatched content type", () => {
    expect(validateResumeFile({ name: "cv.pdf", type: "image/png", size: 10 })).toContain("match");
  });
  it("rejects empty and oversized files", () => {
    expect(validateResumeFile({ ...pdf, size: 0 })).toContain("empty");
    expect(validateResumeFile({ ...pdf, size: 6 * 1024 * 1024 })).toContain("too large");
  });
});

describe("interview setup validation", () => {
  it("requires a role and a duration within backend bounds", () => {
    expect(validateSetup({ role: "  ", duration: 10 }).role).toBeTruthy();
    expect(validateSetup({ role: "Dev", duration: 1 }).duration).toBeTruthy();
    expect(validateSetup({ role: "Dev", duration: 21 }).duration).toBeTruthy();
    expect(validateSetup({ role: "Dev", duration: 10 })).toEqual({});
  });
});

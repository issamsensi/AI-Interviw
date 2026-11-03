/**
 * Browser recording → backend-compatible WAV.
 *
 * The backend STT accepts 16-bit mono PCM WAV at 16 or 24 kHz. Browser
 * MediaRecorder output (usually WebM/Opus) is decoded with Web Audio,
 * resampled to 16 kHz mono, and re-encoded as WAV entirely client-side.
 */

export const BACKEND_SAMPLE_RATES = [16000, 24000] as const;
export const TARGET_SAMPLE_RATE = 16000;
export const MAX_RECORD_SECONDS = 300;

export function pickRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      /* ignore and try next */
    }
  }
  return undefined;
}

export function microphoneSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export function mediaRecorderSupported(): boolean {
  return typeof MediaRecorder !== "undefined";
}

/** Encode mono float samples as 16-bit PCM WAV. Pure function, unit-tested. */
export function encodeWavPcm16(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function getAudioContextClass(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return ctor ?? null;
}

export function audioConversionSupported(): boolean {
  const Ctx = getAudioContextClass();
  return !!Ctx && typeof OfflineAudioContext !== "undefined";
}

/** Decode any browser recording and convert it to backend-ready WAV. */
export async function convertToBackendWav(source: Blob): Promise<Blob> {
  const Ctx = getAudioContextClass();
  if (!Ctx) throw new Error("Audio conversion is not supported by this browser.");
  const raw = await source.arrayBuffer();
  const ctx = new Ctx();
  try {
    let decoded: AudioBuffer;
    try {
      decoded = await ctx.decodeAudioData(raw.slice(0));
    } catch {
      throw new Error("The recording could not be decoded. Try again with another browser.");
    }
    if (!decoded.duration || decoded.duration < 0.2) {
      throw new Error("The recording is too short or empty.");
    }
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE), TARGET_SAMPLE_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();
    const mono = rendered.getChannelData(0);
    if (mono.length === 0) throw new Error("Conversion produced an empty file.");
    return encodeWavPcm16(mono, TARGET_SAMPLE_RATE);
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

export type MicPermissionState = "unknown" | "granted" | "denied" | "unavailable";

export async function requestMicrophone(): Promise<{ stream: MediaStream; state: MicPermissionState }> {
  if (!microphoneSupported()) return { stream: null as unknown as MediaStream, state: "unavailable" };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return { stream, state: "granted" };
  } catch (error) {
    if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
      return { stream: null as unknown as MediaStream, state: "denied" };
    }
    if (error instanceof DOMException && error.name === "NotFoundError") {
      return { stream: null as unknown as MediaStream, state: "unavailable" };
    }
    throw error;
  }
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export type CameraPermissionState = "off" | "requesting" | "on" | "denied" | "unavailable";

export function cameraSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

/** Request a video-only stream for the local self-view preview.
 *  The stream is never uploaded: it stays in the browser, like a real
 *  video-call self view. */
export async function requestCamera(): Promise<{ stream: MediaStream | null; state: CameraPermissionState }> {
  if (!cameraSupported()) return { stream: null, state: "unavailable" };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    return { stream, state: "on" };
  } catch (error) {
    if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError")) {
      return { stream: null, state: "denied" };
    }
    return { stream: null, state: "unavailable" };
  }
}

/**
 * Voice-activity helpers for hands-free answering.
 *
 * The pure SilenceDetector state machine is separated from Web Audio so
 * it is unit-testable without a microphone: feed it levels over time and
 * it reports when speech happened and when enough trailing silence has
 * passed to consider the answer finished.
 */

export type VadEvent = "none" | "speech-started" | "silence-complete" | "max-reached";

export interface SilenceOptions {
  /** Level (RMS 0..1) at or above which the signal counts as speech. */
  levelThreshold?: number;
  /** Seconds of continuous silence after speech that ends the answer. */
  silenceSeconds?: number;
  /** Minimum total speech (seconds) before silence can end the answer. */
  minSpeechSeconds?: number;
  /** Hard cap on one answer (seconds). */
  maxSeconds?: number;
}

export class SilenceDetector {
  readonly levelThreshold: number;
  readonly silenceSeconds: number;
  readonly minSpeechSeconds: number;
  readonly maxSeconds: number;
  private startedAt: number | null = null;
  private lastSpeechAt = 0;
  private speechMs = 0;
  private lastSampleAt: number | null = null;
  hasSpoken = false;

  constructor(options: SilenceOptions = {}) {
    this.levelThreshold = options.levelThreshold ?? 0.015;
    this.silenceSeconds = options.silenceSeconds ?? 2;
    this.minSpeechSeconds = options.minSpeechSeconds ?? 0.7;
    this.maxSeconds = options.maxSeconds ?? 300;
  }

  /** Feed one level sample (monotonic timestamps in ms). */
  sample(level: number, atMs: number): VadEvent {
    if (this.startedAt === null) {
      this.startedAt = atMs;
      this.lastSpeechAt = atMs;
      this.lastSampleAt = atMs;
    }
    const speaking = level >= this.levelThreshold;
    let event: VadEvent = "none";
    if (speaking) {
      if (!this.hasSpoken) {
        this.hasSpoken = true;
        event = "speech-started";
      }
      if (this.lastSampleAt !== null) {
        this.speechMs += Math.min(atMs - this.lastSampleAt, 250);
      }
      this.lastSpeechAt = atMs;
    }
    this.lastSampleAt = atMs;
    if (atMs - this.startedAt >= this.maxSeconds * 1000) return "max-reached";
    if (
      this.hasSpoken &&
      this.speechMs >= this.minSpeechSeconds * 1000 &&
      atMs - this.lastSpeechAt >= this.silenceSeconds * 1000
    ) {
      return "silence-complete";
    }
    return event;
  }
}

/** RMS level (0..1) of the current time-domain frame. */
export function frameRms(analyser: AnalyserNode, scratch: Uint8Array): number {
  analyser.getByteTimeDomainData(scratch as Uint8Array<ArrayBuffer>);
  let sum = 0;
  for (let i = 0; i < scratch.length; i += 1) {
    const v = (scratch[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / scratch.length);
}

export interface VadHandle {
  stop: () => void;
}

/**
 * Attach a SilenceDetector to a live mic stream. Calls onEvent as the
 * candidate speaks; onLevel streams the level for a meter display.
 * Returns a stop handle. Throws if Web Audio is unavailable.
 */
export function attachSilenceDetector(
  stream: MediaStream,
  handlers: {
    onEvent: (event: VadEvent) => void;
    onLevel?: (level: number) => void;
    options?: SilenceOptions;
  },
): VadHandle {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new Error("Web Audio is not available in this browser.");
  const context = new Ctor();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const scratch = new Uint8Array(analyser.fftSize);
  const detector = new SilenceDetector(handlers.options);
  const timer = window.setInterval(() => {
    const level = frameRms(analyser, scratch);
    handlers.onLevel?.(Math.min(1, level * 3));
    const event = detector.sample(level, performance.now());
    if (event !== "none") handlers.onEvent(event);
  }, 100);
  return {
    stop: () => {
      window.clearInterval(timer);
      source.disconnect();
      void context.close().catch(() => undefined);
    },
  };
}

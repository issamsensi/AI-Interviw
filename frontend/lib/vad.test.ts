import { describe, expect, it } from "vitest";
import { SilenceDetector } from "@/lib/vad";

function sampleN(detector: SilenceDetector, level: number, fromMs: number, steps: number, stepMs = 100) {
  const events: string[] = [];
  for (let i = 0; i < steps; i += 1) {
    events.push(detector.sample(level, fromMs + i * stepMs));
  }
  return events;
}

describe("SilenceDetector", () => {
  it("stays quiet without speech", () => {
    const detector = new SilenceDetector({ silenceSeconds: 2, minSpeechSeconds: 0.7 });
    const events = sampleN(detector, 0.001, 0, 50);
    expect(events).not.toContain("silence-complete");
    expect(detector.hasSpoken).toBe(false);
  });

  it("starts speech, then completes after trailing silence", () => {
    const detector = new SilenceDetector({ silenceSeconds: 2, minSpeechSeconds: 0.7, levelThreshold: 0.02 });
    const started = sampleN(detector, 0.2, 0, 10); // 1s of speech
    expect(started).toContain("speech-started");
    const tail = sampleN(detector, 0.001, 1000, 19); // 1.9s silence: not yet
    expect(tail).not.toContain("silence-complete");
    expect(detector.sample(0.001, 3000)).toBe("silence-complete");
  });

  it("ignores silence before the minimum speech time", () => {
    const detector = new SilenceDetector({ silenceSeconds: 1, minSpeechSeconds: 2, levelThreshold: 0.02 });
    sampleN(detector, 0.2, 0, 5); // 0.5s speech < 2s minimum
    const tail = sampleN(detector, 0.001, 500, 30); // 3s silence
    expect(tail).not.toContain("silence-complete");
  });

  it("caps very long answers", () => {
    const detector = new SilenceDetector({ maxSeconds: 3, levelThreshold: 0.02 });
    expect(detector.sample(0.2, 0)).toBe("speech-started");
    expect(detector.sample(0.2, 3200)).toBe("max-reached");
  });

  it("treats noise below threshold as silence", () => {
    const detector = new SilenceDetector({ levelThreshold: 0.05, silenceSeconds: 1, minSpeechSeconds: 0.5 });
    sampleN(detector, 0.2, 0, 10);
    const tail = sampleN(detector, 0.01, 1000, 15);
    expect(tail[tail.length - 1]).toBe("silence-complete");
  });
});

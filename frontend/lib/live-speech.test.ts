import { describe, expect, it } from "vitest";
import { isSendableTranscript, liveSpeechSupported, mergeLiveTranscript } from "@/lib/live-speech";

describe("mergeLiveTranscript", () => {
  it("returns interim alone before anything is final", () => {
    expect(mergeLiveTranscript("", "I worked on")).toBe("I worked on");
  });
  it("appends interim after committed words with one space", () => {
    expect(mergeLiveTranscript("I worked on", "a payment API")).toBe("I worked on a payment API");
  });
  it("returns committed text when interim is empty", () => {
    expect(mergeLiveTranscript("Done speaking.", "")).toBe("Done speaking.");
  });
  it("trims stray whitespace from both parts", () => {
    expect(mergeLiveTranscript("  hello ", " world  ")).toBe("hello world");
  });
});

describe("isSendableTranscript", () => {
  it("rejects empty and whitespace-only answers", () => {
    expect(isSendableTranscript("")).toBe(false);
    expect(isSendableTranscript("   ")).toBe(false);
  });
  it("accepts real words", () => {
    expect(isSendableTranscript(" hi ")).toBe(true);
  });
});

describe("liveSpeechSupported", () => {
  it("is false in jsdom (no SpeechRecognition)", () => {
    expect(liveSpeechSupported()).toBe(false);
  });
});

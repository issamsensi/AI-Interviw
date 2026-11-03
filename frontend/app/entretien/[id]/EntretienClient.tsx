"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Check, CheckCheck, ChevronLeft, ChevronRight, Ear, Mic, MicOff, PhoneOff, Play, RotateCcw, Send, Square, Video, VideoOff, Volume2 } from "lucide-react";
import { Alert, Button, Card, EmptyState } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { formatElapsed } from "@/lib/format";
import type { InterviewMode, QuestionAnswer } from "@/lib/types";
import { workflowStore } from "@/lib/workflow";
import {
  MAX_RECORD_SECONDS,
  cameraSupported,
  convertToBackendWav,
  mediaRecorderSupported,
  microphoneSupported,
  pickRecordingMimeType,
  requestCamera,
  requestMicrophone,
  stopStream,
  type CameraPermissionState,
  type MicPermissionState,
} from "@/lib/audio";
import { attachSilenceDetector, type VadHandle } from "@/lib/vad";
import { createLiveRecognizer, isSendableTranscript, liveSpeechSupported, type LiveRecognizer } from "@/lib/live-speech";

type Phase =
  | "loading"
  | "ready"
  | "asking"
  | "recording"
  | "recorded"
  | "converting"
  | "transcribing"
  | "review"
  | "submitting";

const INTERVIEWER_NAME = "Maya Chen";
const INTERVIEWER_ROLE = "Engineering Manager";

const STATUS_TEXT: Record<Phase, string> = {
  loading: "Connecting…",
  ready: "Your turn. Speak naturally.",
  asking: "Maya is speaking",
  recording: "Your turn. Speak naturally.",
  recorded: "Got it — listen back or transcribe",
  converting: "Preparing audio…",
  transcribing: "Transcribing…",
  review: "Check your answer",
  submitting: "Sending…",
};

function speakText(text: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (!("speechSynthesis" in window)) {
        resolve();
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
      // Safety net: never hang the flow on a stuck utterance.
      window.setTimeout(resolve, 20000);
    } catch {
      resolve();
    }
  });
}

export default function EntretienClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const interviewId = params.id;
  // Keep navigation stable so `load` (and its effect) never refires on
  // unrelated re-renders and resets local state.
  const replaceRef = useRef(router.replace);
  replaceRef.current = router.replace;

  const [questions, setQuestions] = useState<QuestionAnswer[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [micState, setMicState] = useState<MicPermissionState>("unknown");
  const [camState, setCamState] = useState<CameraPermissionState>("off");
  const [elapsed, setElapsed] = useState(0);
  const [mode, setModeState] = useState<InterviewMode>("meet");
  const isWriting = mode === "writing";
  const [handsFree, setHandsFree] = useState(true);
  // WhatsApp-style sending: on = a pause auto-sends; off = nothing is
  // sent until the candidate taps Send (for when silence detection
  // misses that they stopped — or cuts them off mid-thought).
  const [autoSend, setAutoSend] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [started, setStarted] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const micMutedRef = useRef(false);

  const [recording, setRecording] = useState<Blob | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [justSubmitted, setJustSubmitted] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  // Synchronous in-flight guard: React state updates are async, so two
  // rapid clicks can both pass a phase check before either re-renders.
  const busyRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const vadRef = useRef<VadHandle | null>(null);
  const liveRef = useRef<LiveRecognizer | null>(null);
  const autoSendTimerRef = useRef<number | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const flowRef = useRef(0);
  const speechHeardRef = useRef(false);
  const noSpeechTimerRef = useRef<number | null>(null);

  const current = questions[index] ?? null;
  // Mirrors for callbacks (timers / recognizer) that fire between renders.
  const indexRef = useRef(index);
  indexRef.current = index;
  const questionsRef = useRef(questions);
  questionsRef.current = questions;
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;
  const autoSendRef = useRef(autoSend);
  autoSendRef.current = autoSend;
  const answeredCount = questions.filter((q) => q.answer && q.answer.trim()).length;
  const flowBusy =
    phase === "asking" || phase === "recording" || phase === "converting" ||
    phase === "transcribing" || phase === "submitting";

  const load = useCallback(async () => {
    setLoadError(null);
    setPhase("loading");
    try {
      const report = await api.getReport(interviewId);
      if (report.evaluation) {
        replaceRef.current(`/rapport/${interviewId}`);
        return;
      }
      if (report.qa_pairs.length === 0) {
        setLoadError("This interview has no questions. Please redo the setup.");
        return;
      }
      setQuestions(report.qa_pairs);
      const firstOpen = report.qa_pairs.findIndex((q) => !q.answer || !q.answer.trim());
      setIndex(firstOpen === -1 ? report.qa_pairs.length - 1 : firstOpen);
      setPhase("ready");
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : "Could not load.");
    }
  }, [interviewId]);

  useEffect(() => {
    workflowStore.interviewId = interviewId;
    const storedMode = workflowStore.interviewMode;
    // Mount read: legitimate external synchronization, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModeState(storedMode);
    if (storedMode === "writing") setHandsFree(false);
    void load();
    return () => {
      flowRef.current += 1;
      liveRef.current?.abort();
      liveRef.current = null;
      if (autoSendTimerRef.current) window.clearTimeout(autoSendTimerRef.current);
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
    };
  }, [interviewId, load]);

  // Keep the newest chat bubble in view, WhatsApp-style.
  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [questions, index, transcript, isLive, phase]);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      stopStream(streamRef.current);
      stopStream(camStreamRef.current);
      vadRef.current?.stop();
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    };
  }, [recordingUrl]);

  function resetAnswerState() {
    setRecording(null);
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    setRecordingUrl(null);
    setTranscript("");
    setRecordSeconds(0);
    setJustSubmitted(false);
    setActionError(null);
    setMicLevel(0);
  }

  const startCamera = useCallback(async () => {
    if (camState === "requesting" || camState === "on") return;
    if (!cameraSupported()) {
      setCamState("unavailable");
      return;
    }
    setCamState("requesting");
    const { stream, state } = await requestCamera();
    if (state === "on" && stream) {
      camStreamRef.current = stream;
      setCamState("on");
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
    } else {
      setCamState(state);
    }
  }, [camState]);

  function stopCamera() {
    stopStream(camStreamRef.current);
    camStreamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setCamState("off");
  }

  function stopVad() {
    vadRef.current?.stop();
    vadRef.current = null;
    if (noSpeechTimerRef.current) window.clearTimeout(noSpeechTimerRef.current);
    noSpeechTimerRef.current = null;
    setMicLevel(0);
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  function clearAutoSendTimer() {
    if (autoSendTimerRef.current) window.clearTimeout(autoSendTimerRef.current);
    autoSendTimerRef.current = null;
  }

  function stopLiveListening() {
    clearAutoSendTimer();
    liveRef.current?.abort();
    liveRef.current = null;
    setIsLive(false);
  }

  /** Send whatever has been heard so far — the manual escape hatch when
   *  silence detection never notices the candidate stopped speaking. */
  async function sendNow(): Promise<void> {
    const text = transcriptRef.current;
    const wasLive = liveRef.current !== null;
    stopLiveListening();
    if (phase === "recording" && !wasLive) {
      // Recorder path: stopping triggers transcribe -> auto-submit.
      stopRecording();
      return;
    }
    if (!isSendableTranscript(text)) {
      setActionError("Nothing to send yet — say or type your answer first.");
      setPhase("ready");
      return;
    }
    await submitAndFinish(true, text);
  }

  function scheduleAutoSend() {
    clearAutoSendTimer();
    if (!autoSendRef.current) return;
    autoSendTimerRef.current = window.setTimeout(() => {
      if (!autoSendRef.current || !isSendableTranscript(transcriptRef.current)) return;
      void sendNow();
    }, 2000);
  }

  /** Live conversation: words stream into the chat bubble as they are
   *  spoken. Falls back to the recorder + silence detector when the
   *  browser has no streaming recognition. */
  async function startLiveListening(): Promise<boolean> {
    if (mode === "writing" || micMutedRef.current) return false;
    if (!liveSpeechSupported()) return startRecording(true);
    setActionError(null);
    setTranscript("");
    transcriptRef.current = "";
    const recognizer = createLiveRecognizer({
      onUpdate: (text) => {
        setTranscript(text);
        transcriptRef.current = text;
        scheduleAutoSend();
      },
      onError: (error) => {
        if (error === "not-allowed" || error === "service-not-allowed") {
          setMicState("denied");
          stopLiveListening();
          setPhase("ready");
        }
      },
      onEnd: () => {
        // Browser ended the session on its own: keep the words, let the
        // candidate tap Send — never lose a live answer silently.
        liveRef.current = null;
        setIsLive(false);
        setPhase((prev) => (prev === "recording" ? "review" : prev));
      },
    });
    if (!recognizer) return startRecording(true);
    liveRef.current = recognizer;
    setIsLive(true);
    setPhase("recording");
    return true;
  }

  const startRecording = useCallback(async (auto: boolean): Promise<boolean> => {
    if (micMutedRef.current) return false;
    setActionError(null);
    if (!microphoneSupported() || !mediaRecorderSupported()) {
      setMicState("unavailable");
      return false;
    }
    try {
      const { stream, state } = await requestMicrophone();
      setMicState(state);
      if (state !== "granted") return false;
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, pickRecordingMimeType() ? { mimeType: pickRecordingMimeType() } : undefined);
      recorderRef.current = recorder;
      speechHeardRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stopVad();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stopStream(streamRef.current);
        streamRef.current = null;
        if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
        setRecording(blob);
        setRecordingUrl(URL.createObjectURL(blob));
        if (auto && speechHeardRef.current) {
          // Pass the blob explicitly: React state is not yet updated here.
          // Auto-send off: transcribe into the composer only, send on tap.
          void handleTranscribe(autoSendRef.current, blob);
        } else {
          setPhase("recorded");
          if (auto) {
            setPhase("ready");
            setActionError("I didn't hear anything. Tap Record and try again, or type your answer.");
          }
        }
      };
      recorder.start();
      setPhase("recording");
      setRecordSeconds(0);
      const startedAt = Date.now();
      recordTimerRef.current = window.setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAt) / 1000);
        setRecordSeconds(seconds);
        if (seconds >= MAX_RECORD_SECONDS) stopRecording();
      }, 500);
      if (auto) {
        try {
          vadRef.current = attachSilenceDetector(stream, {
            onLevel: setMicLevel,
            onEvent: (event) => {
              if (event === "speech-started") speechHeardRef.current = true;
              if (event === "silence-complete" || event === "max-reached") stopRecording();
            },
            options: { silenceSeconds: 2, minSpeechSeconds: 0.7, maxSeconds: MAX_RECORD_SECONDS },
          });
        } catch {
          /* VAD unavailable (no Web Audio): user stops manually. */
        }
        noSpeechTimerRef.current = window.setTimeout(() => {
          if (!speechHeardRef.current) stopRecording();
        }, 25000);
      }
      return true;
    } catch {
      setActionError("Microphone unavailable. Check permission and retry, or type your answer.");
      return false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cancelRecording() {
    flowRef.current += 1;
    stopLiveListening();
    stopRecording();
    stopStream(streamRef.current);
    streamRef.current = null;
    stopVad();
    resetAnswerState();
    setPhase("ready");
  }

  async function handleTranscribe(auto = false, source?: Blob): Promise<boolean> {
    const audio = source ?? recording;
    if (!audio || busyRef.current) return false;
    busyRef.current = true;
    setActionError(null);
    try {
      setPhase("converting");
      const wav = await convertToBackendWav(audio);
      setPhase("transcribing");
      const response = await api.transcribeAnswer(wav);
      if (!response.text.trim()) {
        setActionError("Empty transcription: the recording sounds silent. Re-record or type your answer.");
        setPhase("recorded");
        return false;
      }
      const text = response.text.trim();
      setTranscript(text);
      setPhase("review");
      if (auto) {
        // Chain with the text explicitly: state is not yet committed.
        busyRef.current = false;
        return await submitAndFinish(true, text);
      }
      return true;
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : "Transcription failed.");
      setPhase("recorded");
      return false;
    } finally {
      busyRef.current = false;
    }
  }

  async function handleSubmit(auto = false, textOverride?: string): Promise<boolean> {
    void auto;
    if (!current || busyRef.current) return false;
    const text = (textOverride ?? transcript).trim();
    if (!text) {
      setActionError("Write or transcribe your answer before sending it.");
      return false;
    }
    busyRef.current = true;
    setActionError(null);
    setPhase("submitting");
    try {
      await api.submitAnswer({ interview_id: interviewId, question_id: current.question_id, text });
      setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, answer: text } : q)));
      setJustSubmitted(true);
      setPhase("ready");
      return true;
    } catch (error) {
      // The recording and transcript are kept so you can retry.
      setActionError(error instanceof ApiError ? error.message : "Sending failed. Retry: nothing is lost.");
      setPhase("review");
      return false;
    } finally {
      busyRef.current = false;
    }
  }

  /** Evaluate and go to the report. Shared by Leave (with answers) and by
   * the automatic finish after the final answer. */
  async function finishInterview(): Promise<void> {
    if (finishing || busyRef.current) return;
    busyRef.current = true;
    setFinishing(true);
    setJustSubmitted(false);
    setActionError(null);
    try {
      await api.endInterview(interviewId);
      router.push(`/rapport/${interviewId}`);
    } catch (error) {
      setPhase("ready");
      setActionError(error instanceof ApiError ? error.message : "Could not finish. Your answers are saved — try leaving again.");
    } finally {
      busyRef.current = false;
      setFinishing(false);
    }
  }

  /** Submit, then finish automatically once every question is answered.
   *  In live mode (auto) the conversation keeps flowing: Maya asks the
   *  next question out loud and listening resumes, like a real call. */
  async function submitAndFinish(auto = false, textOverride?: string): Promise<boolean> {
    const submitted = await handleSubmit(auto, textOverride);
    if (!submitted) return false;
    const allAnswered = questionsRef.current.every((q, i) => {
      const answer = i === indexRef.current ? (textOverride ?? transcriptRef.current) : q.answer;
      return Boolean(answer && answer.trim());
    });
    if (allAnswered) {
      await finishInterview();
      return true;
    }
    if (auto) {
      const next = indexRef.current + 1;
      if (next < questionsRef.current.length) {
        goToQuestion(next);
        await askQuestionAt(next);
      }
    }
    return true;
  }

  async function askQuestionAt(questionIndex: number) {
    const question = questionsRef.current[questionIndex];
    if (!question || mode === "writing") { setPhase("ready"); return; }
    const token = flowRef.current;
    setPhase("asking");
    await speakText(question.question);
    if (token !== flowRef.current) return;
    setPhase("ready");
    await startLiveListening();
  }

  async function askCurrent(auto: boolean) {
    if (!current) return;
    if (!auto) return;
    await askQuestionAt(indexRef.current);
  }

  function setInterviewMode(next: InterviewMode) {
    setModeState(next);
    workflowStore.interviewMode = next;
    if (next === "writing") {
      // No talking in writing mode: stop voice, mic and camera prompts.
      flowRef.current += 1;
      stopLiveListening();
      stopVad();
      try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
      setHandsFree(false);
      setPhase((prev) => (prev === "recording" || prev === "asking" ? "ready" : prev));
    } else {
      setHandsFree(true);
    }
  }

  async function beginInterview() {
    if (started) return;
    setStarted(true);
    if (isWriting) {
      setPhase("ready");
      return;
    }
    void startCamera();
    if (handsFree) {
      await askCurrent(true);
    } else {
      setPhase("ready");
    }
  }

  function goToQuestion(next: number) {
    flowRef.current += 1;
    stopLiveListening();
    stopVad();
    resetAnswerState();
    setIndex(next);
    setPhase("ready");
  }

  async function handleEnd() {
    if (finishing) return;
    // Nothing answered: the backend cannot evaluate (422), so just leave
    // the room — like hanging up a Meet call before speaking.
    if (answeredCount === 0) {
      flowRef.current += 1;
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
      if (recorderRef.current) recorderRef.current.onstop = null;
      stopRecording();
      stopVad();
      stopStream(streamRef.current);
      streamRef.current = null;
      stopCamera();
      router.push("/");
      return;
    }
    await finishInterview();
  }

  const canRecord = phase === "ready" || phase === "review";
  const isBusy = flowBusy || finishing;
  const isSpeaking = phase === "asking";
{}
  function toggleMute() {
    const next = !micMuted;
    micMutedRef.current = next;
    setMicMuted(next);
    if (next && phase === "recording") cancelRecording();
  }

  function toggleCamera() {
    if (camState === "on") stopCamera();
    else void startCamera();
  }

  const dockBtn =
    "inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-full bg-[#213D52] px-3.5 text-sm font-medium text-white transition-colors hover:bg-[#35536B] focus-visible:outline-[#C99B68] disabled:cursor-not-allowed disabled:opacity-40 sm:px-4";
  const dockLabel = "hidden xl:inline";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#172B3A] text-white">
      {/* Header — Meet keeps this minimal: title left, clock / progress right */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 px-4 text-sm sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#213D52]">
            <Video className="h-4.5 w-4.5 text-[#C99B68]" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate font-medium">AI Interview</p>
            <p aria-live="polite" className="truncate text-xs text-[#AEC0B6]">
              {phase === "recording" && <span aria-hidden="true" className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-[#ea4335] align-middle" />}
              {finishing ? "Evaluating your answers…" : STATUS_TEXT[phase]}
              {phase === "recording" ? ` · ${formatElapsed(recordSeconds)}` : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <p className="hidden text-[#E9F0EA] md:block">
            {current ? (
              <>
                Question {index + 1} of {questions.length}
                {current.category ? ` · ${current.category}` : ""}
                <span className="text-[#AEC0B6]"> · {answeredCount} answered</span>
              </>
            ) : (
              "Interview room"
            )}
          </p>
          {!isWriting && (<div role="group" aria-label="Interview mode" className="hidden rounded-full bg-[#213D52] p-0.5 sm:flex">
            <button type="button" aria-pressed={handsFree} onClick={() => setHandsFree(true)} className={`rounded-full px-3 py-1 text-xs font-medium ${handsFree ? "bg-[#C99B68] text-[#172B3A]" : "text-[#E9F0EA]"}`}>
              Live
            </button>
            <button type="button" aria-pressed={!handsFree} onClick={() => setHandsFree(false)} className={`rounded-full px-3 py-1 text-xs font-medium ${!handsFree ? "bg-[#C99B68] text-[#172B3A]" : "text-[#E9F0EA]"}`}>
              Manual
            </button>
          </div>)}
          <div role="group" aria-label="Attendance mode" className="hidden rounded-full bg-[#213D52] p-0.5 sm:flex">
            <button type="button" aria-pressed={!isWriting} onClick={() => setInterviewMode("meet")} className={`rounded-full px-3 py-1 text-xs font-medium ${!isWriting ? "bg-[#C99B68] text-[#172B3A]" : "text-[#E9F0EA]"}`}>
              Meet
            </button>
            <button type="button" aria-pressed={isWriting} onClick={() => setInterviewMode("writing")} className={`rounded-full px-3 py-1 text-xs font-medium ${isWriting ? "bg-[#C99B68] text-[#172B3A]" : "text-[#E9F0EA]"}`}>
              Writing
            </button>
          </div>
          <span className="tabular-nums text-[#E9F0EA]" aria-label="Elapsed time">{formatElapsed(elapsed)}</span>
        </div>
      </header>
      <div className="h-0.5 shrink-0 bg-white/10" role="progressbar" aria-valuenow={answeredCount} aria-valuemin={0} aria-valuemax={questions.length} aria-label="Answers submitted">
        <div className="h-full bg-[#C99B68] transition-all" style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }} />
      </div>

      {phase === "loading" && (
        <div className="grid flex-1 place-items-center p-6">
          <Card>
            <p>Connecting… loading questions.</p>
          </Card>
        </div>
      )}

      {loadError && (
        <div className="mx-auto w-full max-w-xl flex-1 p-6">
          <Alert tone="error" title="Could not load">
            <p>{loadError}</p>
            <Button variant="secondary" className="mt-3" onClick={() => void load()}>
              Retry
            </Button>
          </Alert>
        </div>
      )}

      {current && phase !== "loading" && !loadError && (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4 lg:flex-row">
            {/* Stage — one large tile, like the pinned speaker in Meet */}
            <section aria-label={`${INTERVIEWER_NAME}, ${INTERVIEWER_ROLE}`} className={`relative min-h-[38vh] flex-1 overflow-hidden rounded-2xl bg-[#213D52] lg:min-h-0 ${isWriting ? "hidden" : ""} ${isSpeaking ? "ring-2 ring-inset ring-[#C99B68]" : "ring-1 ring-inset ring-white/10"}`}>
              {/* Interviewer tile */}
              <div className="absolute inset-0 grid place-items-center px-4">
                <div className="flex flex-col items-center gap-4 text-center">
                  <div aria-hidden="true" className="relative grid h-28 w-28 place-items-center rounded-full bg-[#C99B68] text-5xl font-medium text-[#172B3A] sm:h-40 sm:w-40 sm:text-6xl">
                    {isSpeaking && <span className="absolute inset-0 animate-ping rounded-full bg-[#C99B68]/40" />}
                    <span className="relative">M</span>
                  </div>
                  {!started ? (
                    <div className="max-w-sm">
                      <p className="text-xl font-normal text-white">Ready to join?</p>
                      <p className="mt-2 text-sm leading-relaxed text-[#E9F0EA]">
                        {handsFree
                          ? "Talk like a live call: Maya asks, you just speak — your words appear in the chat as you say them. A pause sends, or tap Send now anytime."
                          : "Chat at your pace: type or record each answer, then tap send — like messaging."}
                      </p>
                      <Button className="mt-4 rounded-full bg-[#C99B68] px-6 text-[#172B3A] hover:bg-[#DDB98A]" onClick={() => void beginInterview()}>
                        <Play aria-hidden="true" className="h-4 w-4" />
                        Begin interview
                      </Button>
                      <p className="mt-3 text-xs text-[#AEC0B6]">Your video stays in this browser. Nothing is recorded or uploaded.</p>
                    </div>
                  ) : (
                    <span aria-hidden="true" className="flex h-5 items-end gap-1">
                      {[0.35, 0.7, 1, 0.55].map((h, i) => (
                        <span key={i} className={`w-1 rounded-full ${isSpeaking ? "animate-pulse bg-[#C99B68]" : "bg-[#AEC0B6]"}`} style={{ height: `${6 + h * 12}px` }} />
                      ))}
                    </span>
                  )}
                </div>
              </div>

              {/* Tile chrome — name bottom-left, status top-right, as in Meet */}
              <p className="absolute bottom-3 left-3 flex max-w-[55%] items-center gap-2 truncate rounded-md bg-black/45 px-2 py-1 text-sm font-medium text-white">
                <Mic aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{INTERVIEWER_NAME} · {INTERVIEWER_ROLE}</span>
              </p>
              <p className="absolute right-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-xs text-white">
                {isSpeaking ? "Speaking…" : phase === "recording" ? "Listening…" : "In this call"}
              </p>

              {/* Self-view — floating tile, bottom-right of the stage */}
              <div className="absolute bottom-3 right-3 aspect-video w-[min(34vw,240px)] min-w-[132px] overflow-hidden rounded-xl bg-[#172B3A] shadow-[0_2px_10px_rgba(0,0,0,.45)] ring-1 ring-white/20">
                <video
                  ref={videoRef}
                  muted
                  autoPlay
                  playsInline
                  aria-label="Live preview of your camera"
                  className={`h-full w-full -scale-x-100 object-cover ${camState === "on" ? "" : "invisible"}`}
                />
                {camState !== "on" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-[#213D52] p-3 text-center">
                    <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-full bg-[#35536B] text-base font-medium text-white">Y</span>
                    <p className="text-[11px] leading-snug text-[#E9F0EA]">
                      {camState === "requesting"
                        ? "Starting camera…"
                        : camState === "denied"
                          ? "Camera blocked — allow it in your browser to see yourself."
                          : "Camera is off"}
                    </p>
                    <Button variant="secondary" className="rounded-full border-0 bg-[#C99B68] px-3 py-1 text-[11px] text-[#172B3A] ring-0 hover:bg-[#DDB98A]" onClick={() => void startCamera()} disabled={camState === "requesting"}>
                      <Video aria-hidden="true" className="h-3.5 w-3.5" />
                      Show my video
                    </Button>
                  </div>
                )}
                <p className="absolute bottom-1.5 left-2 rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white">You</p>
                {micMuted && (
                  <p className="absolute right-1.5 top-1.5 rounded-full bg-[#ea4335] p-1.5 text-white">
                    <MicOff aria-hidden="true" className="h-3 w-3" />
                  </p>
                )}
              </div>

              {/* Captions — the current question, bottom-centre of the stage */}
              {started && (
                <div className="absolute bottom-3 left-1/2 w-[min(620px,calc(100%-280px))] min-w-[200px] -translate-x-1/2 max-lg:hidden">
                  <p className="mx-auto w-fit max-w-full rounded-lg bg-black/65 px-3.5 py-2 text-center text-[15px] leading-snug text-white">
                    <span className="mr-2 font-medium text-[#C99B68]">Maya</span>
                    <span aria-live="polite">{current.question}</span>
                  </p>
                </div>
              )}
            </section>

            {/* Chat panel — WhatsApp-style thread + composer */}
            <aside className={`flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-2xl bg-[#0B141A] ring-1 ring-white/10 ${isWriting ? "flex-1 lg:mx-auto lg:max-w-3xl" : "lg:w-[360px]"}`}>
              <div className="flex items-center gap-3 bg-[#1F2C34] px-4 py-3">
                <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#C99B68] text-sm font-medium text-[#172B3A]">M</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{INTERVIEWER_NAME} <span className="font-normal text-[#AEC0B6]">· {INTERVIEWER_ROLE}</span></p>
                  <p className="text-xs text-[#8696A0]">{isWriting ? "Writing interview — type your answers" : isLive ? "Listening — speak naturally…" : isSpeaking ? "Speaking…" : "Online"}</p>
                </div>
                {!isWriting && (<>
                <button type="button" onClick={() => void speakText(current.question)} aria-label="Listen to the question again" className="inline-flex items-center gap-1.5 rounded-full bg-[#2A3942] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#35536B]">
                  <Volume2 aria-hidden="true" className="h-3.5 w-3.5" />
                  Replay
                </button>
                <button type="button" onClick={() => void askCurrent(handsFree)} disabled={!started || isBusy} className="inline-flex items-center gap-1.5 rounded-full bg-[#2A3942] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#35536B] disabled:opacity-45">
                  <Ear aria-hidden="true" className="h-3.5 w-3.5" />
                  Ask again
                </button>
                </>)}
              </div>

              <div ref={threadRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3" aria-label="Conversation">
                {questions.slice(0, index + 1).map((q, qi) => (
                  <div key={q.question_id} className="flex flex-col gap-2">
                    <div className="max-w-[85%] self-start rounded-lg rounded-tl-none bg-[#1F2C34] px-3 py-2 shadow">
                      <p className="text-[11px] font-medium text-[#C99B68]">{INTERVIEWER_NAME}</p>
                      <p aria-live={qi === index ? "polite" : undefined} className="text-[15px] leading-relaxed text-[#E9EDEF]">{q.question}</p>
                    </div>
                    {q.answer ? (
                      <div className="max-w-[85%] self-end rounded-lg rounded-tr-none bg-[#005C4B] px-3 py-2 shadow">
                        <p className="text-[15px] leading-relaxed text-[#E9EDEF]">{q.answer}</p>
                        <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-[#8696A0]">Sent <CheckCheck aria-hidden="true" className="h-3.5 w-3.5 text-[#53bdeb]" /></p>
                      </div>
                    ) : qi === index && transcript.trim() ? (
                      <div className="max-w-[85%] self-end rounded-lg rounded-tr-none bg-[#005C4B]/70 px-3 py-2 shadow" aria-label="Your live answer">
                        <p className="text-[15px] leading-relaxed text-[#E9EDEF]">{transcript}</p>
                        <p className="mt-1 text-right text-[11px] text-[#8696A0]">{isLive ? "Listening…" : "Draft — tap send"}</p>
                      </div>
                    ) : null}
                  </div>
                ))}
                {phase === "recording" && (
                  <p aria-live="polite" className="inline-flex items-center gap-2 self-start text-sm font-medium text-[#f28b82]">
                    <span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#ea4335]" />
                    {isLive ? "Live — your words appear above as you speak" : `Recording… ${formatElapsed(recordSeconds)} — speak naturally`}
                    {!isLive && <span aria-hidden="true" className="h-1.5 w-16 overflow-hidden rounded-full bg-white/15"><span className="block h-full bg-[#C99B68]" style={{ width: `${Math.round(micLevel * 100)}%` }} /></span>}
                  </p>
                )}
                {phase === "recorded" && recordingUrl && (
                  <div className="self-start rounded-lg bg-[#1F2C34] px-3 py-2">
                    <p className="text-sm font-medium text-white">Voice message ready — listen, then transcribe</p>
                    <audio controls src={recordingUrl} className="mt-2 w-full" aria-label="Playback of your answer" />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button className="rounded-full bg-[#00A884] px-3 py-1.5 text-xs text-white hover:bg-[#06CF9C]" onClick={() => void handleTranscribe(false)}>
                        <Ear aria-hidden="true" className="h-3.5 w-3.5" />
                        Transcribe
                      </Button>
                      <Button variant="secondary" className="rounded-full bg-[#2A3942] px-3 py-1.5 text-xs text-white ring-white/20 hover:bg-[#35536B]" onClick={cancelRecording}>
                        <MicOff aria-hidden="true" className="h-3.5 w-3.5" />
                        Re-record
                      </Button>
                    </div>
                  </div>
                )}
                {(phase === "converting" || phase === "transcribing" || phase === "submitting") && (
                  <p role="status" className="self-start text-sm text-[#8696A0]">
                    {phase === "converting" ? "Converting audio…" : phase === "transcribing" ? "Transcribing…" : "Sending…"}
                  </p>
                )}
              </div>

              {(justSubmitted || micState === "denied" || micState === "unavailable" || actionError) && (
                <div className="flex flex-col gap-2 px-3 pb-2">
                  {justSubmitted && (
                    <Alert tone="success" title="Answer saved">
                      {index + 1 < questions.length ? "Next question when ready." : "All questions answered: you can finish."}
                    </Alert>
                  )}
                  {micState === "denied" && (
                    <Alert tone="error" title="Microphone blocked">
                      Allow the microphone in your browser, then reload. Meanwhile, type your answers below.
                    </Alert>
                  )}
                  {micState === "unavailable" && (
                    <Alert tone="info" title="Recording unavailable">
                      This browser cannot record audio. Type your answers instead: they are evaluated normally.
                    </Alert>
                  )}
                  {actionError && (
                    <Alert tone="error" title="Action failed">
                      {actionError}
                    </Alert>
                  )}
                </div>
              )}

              {/* Composer — WhatsApp pattern: mic when empty, send when there are words */}
              <div className="bg-[#1F2C34] px-3 py-2.5">
                {!isWriting && (<div className="mb-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoSend}
                    aria-label="Auto-send when I pause"
                    onClick={() => { const next = !autoSend; setAutoSend(next); if (!next) clearAutoSendTimer(); }}
                    className="inline-flex items-center gap-2 text-xs font-medium text-[#E9EDEF]"
                  >
                    <span aria-hidden="true" className={`relative h-5 w-9 rounded-full transition-colors ${autoSend ? "bg-[#00A884]" : "bg-[#2A3942]"}`}>
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${autoSend ? "left-[18px]" : "left-0.5"}`} />
                    </span>
                    Auto-send when I pause
                  </button>
                  <span className="text-[11px] leading-tight text-[#8696A0]">{autoSend ? "Or tap Send now anytime" : "Nothing sends until you tap send"}</span>
                </div>)}
                {isLive && (
                  <button type="button" onClick={() => void sendNow()} aria-label="Send answer now" className="mb-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#00A884] px-4 py-2 text-sm font-semibold text-white hover:bg-[#06CF9C]">
                    <Send aria-hidden="true" className="h-4 w-4" />
                    Send now — I&apos;m done talking
                  </button>
                )}
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1 rounded-3xl bg-[#2A3942] px-4 py-1">
                    <label htmlFor="answer-text" className="sr-only">
                      Your answer
                    </label>
                    <textarea
                      id="answer-text"
                      value={transcript}
                      onChange={(event) => { clearAutoSendTimer(); setTranscript(event.target.value); transcriptRef.current = event.target.value; }}
                      rows={2}
                      placeholder={isWriting ? "Type your answer here…" : isLive ? "Listening… speak now" : "Type a message or tap the mic and just talk"}
                      className="block max-h-32 w-full resize-none bg-transparent py-1.5 text-[15px] text-white placeholder:text-[#8696A0] focus:outline-none"
                    />
                  </div>
                  {transcript.trim() && phase !== "submitting" && phase !== "converting" && phase !== "transcribing" ? (
                    <button
                      type="button"
                      onClick={() => void (isLive || phase === "recording" ? sendNow() : submitAndFinish(false))}
                      disabled={isBusy && !isLive}
                      aria-label="Submit answer"
                      title="Send answer"
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#00A884] text-white transition-colors hover:bg-[#06CF9C] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Send aria-hidden="true" className="h-5 w-5" />
                    </button>
                  ) : isWriting ? null : (
                    <button
                      type="button"
                      onClick={() => void (handsFree ? startLiveListening() : startRecording(false))}
                      disabled={isBusy || micMuted}
                      aria-label={handsFree ? "Start live voice answer" : "Record my answer"}
                      title={handsFree ? "Talk live" : "Record"}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#00A884] text-white transition-colors hover:bg-[#06CF9C] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Mic aria-hidden="true" className="h-5 w-5" />
                    </button>
                  )}
                </div>
                {recording && phase !== "recorded" && (
                  <button type="button" onClick={() => void handleTranscribe(false)} disabled={isBusy} className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#2A3942] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#35536B] disabled:opacity-45">
                    <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                    Re-transcribe
                  </button>
                )}
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-[#8696A0]">
                  <Check aria-hidden="true" className="h-3 w-3" />
                  {isWriting ? "Writing mode — no mic or camera needed. Typed answers are scored the same as spoken ones." : liveSpeechSupported() ? "Live words appear as you speak." : "Live text unavailable here — voice is transcribed on stop."} {isWriting ? "" : "You can always type instead."}
                </p>
              </div>
            </aside>
          </div>

          {/* Control bar — Meet: time/title left, round controls centre, actions right */}
          <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 pb-2 pt-1 sm:px-4">
            <p className="hidden min-w-0 truncate text-sm text-[#E9F0EA] sm:block">
              {formatElapsed(elapsed)} <span className="text-[#AEC0B6]">| AI Interview</span>
            </p>
            <span aria-hidden="true" className="sm:hidden" />
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button type="button" onClick={toggleMute} aria-pressed={micMuted} aria-label={micMuted ? "Unmute" : "Mute"} title={micMuted ? "Unmute" : "Mute"} className={`${dockBtn} ${isWriting ? "hidden" : ""} ${micMuted ? "bg-[#ea4335] hover:bg-[#d93025]" : ""}`}>
                {micMuted ? <MicOff aria-hidden="true" className="h-5 w-5" /> : <Mic aria-hidden="true" className="h-5 w-5" />}
                <span className={dockLabel}>{micMuted ? "Unmute" : "Mute"}</span>
              </button>
              <button type="button" onClick={toggleCamera} aria-pressed={camState === "on"} aria-label={camState === "on" ? "Camera off" : "Camera on"} title={camState === "on" ? "Camera off" : "Camera on"} className={`${dockBtn} ${isWriting ? "hidden" : ""} ${camState !== "on" ? "bg-[#ea4335] hover:bg-[#d93025]" : ""}`}>
                {camState === "on" ? <Video aria-hidden="true" className="h-5 w-5" /> : <VideoOff aria-hidden="true" className="h-5 w-5" />}
                <span className={dockLabel}>{camState === "on" ? "Camera off" : "Camera on"}</span>
              </button>
              {isLive ? (
                <button type="button" onClick={() => void sendNow()} aria-label="Send answer now" className={`${dockBtn} bg-[#00A884] font-semibold text-white hover:bg-[#06CF9C]`}>
                  <Send aria-hidden="true" className="h-4 w-4" />
                  Send now
                </button>
              ) : phase === "recording" ? (
                <button type="button" onClick={stopRecording} className={`${dockBtn} bg-[#C99B68] font-semibold text-[#172B3A] hover:bg-[#DDB98A]`}>
                  <Square aria-hidden="true" className="h-4 w-4" />
                  Stop &amp; send
                </button>
              ) : canRecord && !isWriting ? (
                <button type="button" onClick={() => void (handsFree ? startLiveListening() : startRecording(false))} disabled={isBusy || micMuted} className={`${dockBtn} bg-[#C99B68] font-semibold text-[#172B3A] hover:bg-[#DDB98A]`}>
                  <Mic aria-hidden="true" className="h-4 w-4" />
                  {handsFree ? "Talk live" : "Record my answer"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void handleEnd()}
                disabled={finishing}
                aria-label={finishing ? "Leaving…" : "Leave interview"}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#ea4335] px-5 text-sm font-medium text-white transition-colors hover:bg-[#d93025] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <PhoneOff aria-hidden="true" className="h-5 w-5 -scale-x-100" />
                <span>{finishing ? "Leaving…" : "Leave"}</span>
              </button>
            </div>
            <div className="flex items-center justify-end gap-1.5">
              <button type="button" onClick={() => goToQuestion(index - 1)} disabled={index === 0 || isBusy} aria-label="Previous question" title="Previous question" className={`${dockBtn} px-3`}>
                <ChevronLeft aria-hidden="true" className="h-5 w-5" />
                <span className={dockLabel}>Previous</span>
              </button>
              <button type="button" onClick={() => goToQuestion(index + 1)} disabled={index + 1 >= questions.length || isBusy} aria-label="Next question" title="Next question" className={`${dockBtn} px-3`}>
                <span className={dockLabel}>Next</span>
                <ChevronRight aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
          </div>
          <p className="shrink-0 px-4 pb-2.5 text-center text-[11px] text-[#AEC0B6]">
            Video is preview only and never leaves your browser. Audio answers are transcribed by the backend.
          </p>
        </>
      )}

      {!current && phase !== "loading" && !loadError && (
        <div className="grid flex-1 place-items-center p-6">
          <EmptyState title="Interview not found">
            <p>Check the link or restart from setup.</p>
          </EmptyState>
        </div>
      )}
    </div>
  );
}

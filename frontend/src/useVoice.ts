import { useCallback, useEffect, useRef, useState } from "react";
import { checked } from "./api";
import type { CoreState, Preferences } from "./types";

type SinkContext = AudioContext & {
  setSinkId?: (deviceId: string) => Promise<void>;
};
interface WakeRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult:
    | ((event: {
        results: {
          [index: number]: {
            [index: number]: { transcript: string };
            isFinal: boolean;
          };
          length: number;
        };
        resultIndex: number;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type WakeWindow = Window & {
  SpeechRecognition?: new () => WakeRecognition;
  webkitSpeechRecognition?: new () => WakeRecognition;
};

export function useVoice(
  prefs: Preferences | null,
  onText: (text: string) => Promise<void>,
  setState: (state: CoreState) => void,
  onError: (message: string) => void,
  sttProvider: "browser" | "groq",
) {
  const [recording, setRecording] = useState(false);
  const [wakeListening, setWakeListening] = useState(false);
  const amplitude = useRef(0);
  const context = useRef<SinkContext | null>(null);
  const analyzer = useRef<AnalyserNode | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const micSource = useRef<MediaStreamAudioSourceNode | null>(null);
  const player = useRef<AudioBufferSourceNode | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const request = useRef<AbortController | null>(null);
  const raf = useRef(0);
  const epoch = useRef(0);
  const discard = useRef(false);
  const native = useRef<WakeRecognition | null>(null);
  const nativeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wake = useRef<WakeRecognition | null>(null);
  const latest = useRef({ prefs, onText, setState, onError, sttProvider });
  latest.current = { prefs, onText, setState, onError, sttProvider };

  const releaseMic = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    micSource.current?.disconnect();
    micSource.current = null;
    cancelAnimationFrame(raf.current);
    amplitude.current = 0;
    setRecording(false);
  }, []);

  const prepare = useCallback(async () => {
    if (!context.current || context.current.state === "closed")
      context.current = new AudioContext();
    if (context.current.state === "suspended") await context.current.resume();
    const output = latest.current.prefs?.output_device;
    if (output && context.current.setSinkId)
      await context.current.setSinkId(output);
    return context.current;
  }, []);

  const stop = useCallback(() => {
    epoch.current++;
    request.current?.abort();
    request.current = null;
    if (player.current) {
      player.current.onended = null;
      try {
        player.current.stop();
      } catch {
        /* already ended */
      }
      player.current.disconnect();
      player.current = null;
    }
    discard.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
    if (nativeTimer.current) clearTimeout(nativeTimer.current);
    native.current?.abort();
    native.current = null;
    releaseMic();
    wake.current?.abort();
    wake.current = null;
    setWakeListening(false);
    latest.current.setState("idle");
  }, [releaseMic]);

  const speak = useCallback(
    async (text: string) => {
      stop();
      const ticket = epoch.current;
      const abort = new AbortController();
      request.current = abort;
      try {
        const ctx = await prepare();
        latest.current.setState("generating");
        const response = await checked(
          await fetch("/api/speech", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
            signal: abort.signal,
          }),
        );
        const data = await response.arrayBuffer();
        if (ticket !== epoch.current) return;
        const audio = await ctx.decodeAudioData(data);
        if (ticket !== epoch.current) return;
        const source = ctx.createBufferSource();
        source.buffer = audio;
        const node = ctx.createAnalyser();
        node.fftSize = 256;
        source.connect(node);
        node.connect(ctx.destination);
        player.current = source;
        analyzer.current = node;
        const samples = new Uint8Array(node.frequencyBinCount);
        const animate = () => {
          node.getByteFrequencyData(samples);
          amplitude.current =
            samples.reduce((a, b) => a + b, 0) / samples.length / 255;
          raf.current = requestAnimationFrame(animate);
        };
        source.onended = () => {
          source.disconnect();
          node.disconnect();
          player.current = null;
          cancelAnimationFrame(raf.current);
          amplitude.current = 0;
          latest.current.setState("idle");
        };
        latest.current.setState("speaking");
        animate();
        source.start();
      } catch (error) {
        if (
          (error as Error).name !== "AbortError" &&
          ticket === epoch.current
        ) {
          latest.current.onError(
            `Voz indisponível: ${(error as Error).message}. A resposta em texto continua disponível.`,
          );
          latest.current.setState("error");
        }
      }
    },
    [stop, prepare],
  );

  const finishRecording = useCallback(() => {
    native.current?.stop();
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const startRecording = useCallback(async () => {
    stop();
    const ticket = epoch.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia || (latest.current.sttProvider === "groq" && !window.MediaRecorder))
        throw new Error(
          "O microfone exige HTTPS ou localhost e um navegador compatível.",
        );
      const ctx = await prepare();
      const input = latest.current.sttProvider === "groq" ? latest.current.prefs?.input_device : "";
      const inputStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(input ? { deviceId: { exact: input } } : {}),
        },
      });
      if (ticket !== epoch.current) {
        inputStream.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = inputStream;
      const node = ctx.createAnalyser();
      node.fftSize = 512;
      const source = ctx.createMediaStreamSource(inputStream);
      source.connect(node); // Intentionally no destination: microphone is never played through speakers.
      micSource.current = source;
      if (latest.current.sttProvider === "browser") {
        const ctor = (window as WakeWindow).SpeechRecognition || (window as WakeWindow).webkitSpeechRecognition;
        if (!ctor) throw new Error("Reconhecimento de fala indisponível. Use Chrome/Edge ou digite a mensagem.");
        const recognition = new ctor();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = latest.current.prefs?.language === "auto" ? navigator.language : (latest.current.prefs?.language || "pt-BR");
        let text = "";
        let failed = false;
        recognition.onresult = (event) => {
          text = Array.from({length: event.results.length}, (_, i) => event.results[i][0].transcript).join(" ").trim();
        };
        recognition.onerror = (event) => {
          if (ticket !== epoch.current) return;
          failed = true;
          latest.current.onError(`Reconhecimento de fala interrompido (${event.error}). Confira a permissão e a conexão do navegador ou digite sua mensagem.`);
          latest.current.setState("error");
        };
        recognition.onend = () => {
          if (ticket !== epoch.current) return;
          native.current = null;
          if (nativeTimer.current) clearTimeout(nativeTimer.current);
          releaseMic();
          node.disconnect();
          if (failed) return;
          latest.current.setState("idle");
          if (text) void latest.current.onText(text);
          else latest.current.onError("Nenhuma fala foi identificada. Tente novamente ou digite sua mensagem.");
        };
        native.current = recognition;
        recognition.start();
        setRecording(true);
        latest.current.setState("listening");
        const samples = new Float32Array(node.fftSize);
        const analyze = () => {
          if (ticket !== epoch.current || native.current !== recognition) return;
          node.getFloatTimeDomainData(samples);
          amplitude.current = Math.min(1, Math.sqrt(samples.reduce((n, v) => n + v * v, 0) / samples.length) * 8);
          raf.current = requestAnimationFrame(analyze);
        };
        analyze();
        nativeTimer.current = setTimeout(() => recognition.stop(), 30000);
        return;
      }
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const capture = new MediaRecorder(
        inputStream,
        mimeType ? { mimeType } : undefined,
      );
      recorder.current = capture;
      const chunks: Blob[] = [];
      discard.current = false;
      capture.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      capture.onstop = async () => {
        if (recorder.current === capture) releaseMic();
        else {
          inputStream.getTracks().forEach((track) => track.stop());
          source.disconnect();
        }
        node.disconnect();
        if (discard.current || ticket !== epoch.current) return;
        const audio = new Blob(chunks, { type: capture.mimeType });
        if (!audio.size) {
          latest.current.setState("idle");
          return;
        }
        const abort = new AbortController();
        request.current = abort;
        try {
          latest.current.setState("processing");
          const form = new FormData();
          form.append("file", audio, "recording.webm");
          const response = await checked(
            await fetch("/api/transcribe", {
              method: "POST",
              body: form,
              signal: abort.signal,
            }),
          );
          const { text } = await response.json();
          if (ticket === epoch.current) await latest.current.onText(text);
        } catch (error) {
          if (
            (error as Error).name !== "AbortError" &&
            ticket === epoch.current
          ) {
            latest.current.onError((error as Error).message);
            latest.current.setState("error");
          }
        }
      };
      capture.start(250);
      setRecording(true);
      latest.current.setState("listening");
      const samples = new Float32Array(node.fftSize);
      const started = performance.now();
      let lastSpeech = started;
      let heardSpeech = false;
      const analyze = () => {
        node.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(
          samples.reduce((total, sample) => total + sample * sample, 0) /
            samples.length,
        );
        amplitude.current = Math.min(1, rms * 8);
        const now = performance.now();
        if (rms > 0.018) {
          heardSpeech = true;
          lastSpeech = now;
        }
        if (
          (heardSpeech && now - lastSpeech > 1600 && now - started > 1200) ||
          now - started > 30000
        ) {
          finishRecording();
          return;
        }
        raf.current = requestAnimationFrame(analyze);
      };
      analyze();
    } catch (error) {
      native.current?.abort();
      native.current = null;
      releaseMic();
      latest.current.onError(
        (error as Error).name === "NotAllowedError"
          ? "Acesso ao microfone recusado. Autorize o microfone nas permissões do navegador."
          : (error as Error).message,
      );
      latest.current.setState("error");
    }
  }, [stop, prepare, releaseMic, finishRecording]);

  const startWake = useCallback(() => {
    stop();
    const ctor =
      (window as WakeWindow).SpeechRecognition ||
      (window as WakeWindow).webkitSpeechRecognition;
    if (!ctor) {
      latest.current.onError(
        "Ativação por frase não é compatível com este navegador. Use o botão do microfone.",
      );
      return;
    }
    const recognition = new ctor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang =
      latest.current.prefs?.language === "en-US" ? "en-US" : "pt-BR";
    let triggered = false;
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (
          event.results[i].isFinal &&
          event.results[i][0].transcript
            .toLowerCase()
            .includes(
              (latest.current.prefs?.wake_phrase || "Hey Jarvis").toLowerCase(),
            )
        ) {
          triggered = true;
          recognition.stop();
          break;
        }
      }
    };
    recognition.onerror = (event) => {
      latest.current.onError(
        `Ativação por frase interrompida (${event.error}).`,
      );
      setWakeListening(false);
    };
    recognition.onend = () => {
      wake.current = null;
      setWakeListening(false);
      if (triggered) void startRecording();
    };
    wake.current = recognition;
    try {
      recognition.start();
      setWakeListening(true);
    } catch {
      latest.current.onError("Não foi possível iniciar a escuta da frase.");
    }
  }, [stop, startRecording]);

  useEffect(
    () => () => {
      epoch.current++;
      request.current?.abort();
      player.current?.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
      wake.current?.abort();
      native.current?.abort();
      if (nativeTimer.current) clearTimeout(nativeTimer.current);
      cancelAnimationFrame(raf.current);
      void context.current?.close();
    },
    [],
  );

  return {
    recording,
    wakeListening,
    amplitude,
    prepare,
    speak,
    stop,
    startRecording,
    finishRecording,
    startWake,
  };
}

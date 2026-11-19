"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noopSubscribe = () => () => {};

/**
 * Browser speech-to-text. `supported` is false during SSR and in browsers
 * without the Web Speech API, so the mic button only renders where it works.
 */
export function useDictation(onText: (text: string) => void) {
  const supported = useSyncExternalStore(noopSubscribe, () => recognitionConstructor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);

  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Constructor = recognitionConstructor();
    if (!Constructor) return;

    const recognition = new Constructor();
    recognition.lang = navigator.language || "zh-TW";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) text += event.results[i][0].transcript;
      }
      if (text) onTextRef.current(text);
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.onerror = recognition.onend;

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }, []);

  useEffect(() => stop, [stop]);

  return { supported, listening, toggle: listening ? stop : start };
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Lock, Maximize, MapPin, Send, Share2, Sparkles, X, MessageCircle, Linkedin, Mail, Link2, Mic, Square, Volume2, Loader2, Box } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SplatViewer } from "@/components/spaces/splat-viewer";

interface Space {
  id: string;
  name: string;
  kind: string;
  order: number;
}
interface Hotspot {
  id: string;
  spaceId: string;
  type: string;
  title: string;
  description: string | null;
  targetSpaceId: string | null;
  externalUrl: string | null;
}
interface Connection {
  id: string;
  fromSpaceId: string;
  toSpaceId: string;
}
interface Asset {
  id: string;
  spaceId: string | null;
  kind: string;
  url: string;
}
interface Reconstruction {
  id: string;
  spaceId: string;
  method: string;
  outputUri: string | null;
}
interface ExperienceData {
  experience: { id: string; name: string; slug: string; requiresPassword: boolean };
  project: { id: string; name: string; type: string };
  spaces: Space[];
  hotspots: Hotspot[];
  connections: Connection[];
  assets: Asset[];
  reconstructions: Reconstruction[];
}

function useSessionId() {
  return useMemo(() => {
    if (typeof window === "undefined") return "server";
    const key = "spatial_session_id";
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(key, id);
    }
    return id;
  }, []);
}

export function ExperienceViewer({ slug }: { slug: string }) {
  const sessionId = useSessionId();
  const [data, setData] = useState<ExperienceData | null>(null);
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [currentSpaceId, setCurrentSpaceId] = useState<string | null>(null);
  const [show3D, setShow3D] = useState(true);
  const [aiOpen, setAiOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiMessages, setAiMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  async function load(withPassword?: string) {
    const url = new URL(`/api/experience/${slug}`, window.location.origin);
    if (withPassword) url.searchParams.set("password", withPassword);
    const res = await fetch(url.toString());
    const body = await res.json();
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    if (res.status === 401 && body.locked) {
      setLocked(true);
      if (withPassword) setPasswordError("Incorrect password.");
      return;
    }
    setLocked(false);
    setData(body);
    setCurrentSpaceId((prev) => prev ?? body.spaces[0]?.id ?? null);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    if (data) {
      void fetch(`/api/experience/${slug}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "experience_opened", sessionId }),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data === null]);

  useEffect(() => {
    if (data && currentSpaceId) {
      void fetch(`/api/experience/${slug}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "space_viewed", sessionId, spaceId: currentSpaceId }),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSpaceId]);

  // Default to the real 3D splat when this space has one — that's the
  // whole point of training it — but let each newly-entered space start
  // fresh rather than carrying over a "show photos instead" choice made
  // in a previous space that may not even have a splat.
  useEffect(() => {
    setShow3D(true);
  }, [currentSpaceId]);

  const shareTitle = data ? `${data.experience.name} — ${data.project.name}` : "Spatial experience";

  /** Native share sheet on mobile (§91); a small menu of direct share targets as the desktop fallback. */
  async function share() {
    const url = window.location.href;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: shareTitle, url });
      } catch {
        // user cancelled the native share sheet — not an error
      }
      return;
    }
    setShareOpen((v) => !v);
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 1500);
  }

  function trackHotspot(hotspotId: string) {
    void fetch(`/api/experience/${slug}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "hotspot_clicked", sessionId, spaceId: currentSpaceId ?? undefined, hotspotId }),
    });
  }

  async function askAi(e: React.FormEvent) {
    e.preventDefault();
    if (!aiQuestion.trim()) return;
    const question = aiQuestion;
    setAiMessages((prev) => [...prev, { role: "user", text: question }]);
    setAiQuestion("");
    const res = await fetch(`/api/experience/${slug}/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-session-id": sessionId },
      body: JSON.stringify({ question }),
    });
    const turn = await res.json();
    const texts: string[] = [];
    for (const action of turn.actions ?? []) {
      if (action.action === "answer") texts.push(action.text);
      if (action.action === "no_action") texts.push(action.reason);
      if (action.action === "navigate") {
        setCurrentSpaceId(action.targetSpaceId);
      }
    }
    setAiMessages((prev) => [...prev, { role: "assistant", text: texts.join(" ") || "…" }]);
  }

  /**
   * Push-to-talk mic input (free-tier roadmap step A3): records with the
   * browser's own MediaRecorder, sends the real audio to a real speech-to-
   * text model, and fills the question box with the real transcript — the
   * visitor still hits Send themselves rather than this auto-submitting,
   * so a bad transcription is easy to see and correct before it's asked.
   */
  async function toggleRecording() {
    setVoiceError(null);
    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        setTranscribing(true);
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType });
          const form = new FormData();
          form.append("audio", blob, "recording.webm");
          const res = await fetch(`/api/experience/${slug}/voice/transcribe`, { method: "POST", body: form });
          const body = await res.json();
          if (body.text) setAiQuestion(body.text);
          else setVoiceError("Couldn't make that out — try again or type your question.");
        } catch {
          setVoiceError("Couldn't make that out — try again or type your question.");
        } finally {
          setTranscribing(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setVoiceError("Microphone access is unavailable — check your browser permissions.");
    }
  }

  /** Real text-to-speech playback of one concierge answer (free-tier roadmap step A3). */
  async function speakAnswer(text: string, index: number) {
    setSpeakingIndex(index);
    try {
      const res = await fetch(`/api/experience/${slug}/voice/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        setSpeakingIndex(null);
        return;
      }
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audio.onended = () => setSpeakingIndex(null);
      audio.onerror = () => setSpeakingIndex(null);
      await audio.play();
    } catch {
      setSpeakingIndex(null);
    }
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] text-center">
        <p className="text-[var(--fg-muted)]">This experience doesn&apos;t exist or hasn&apos;t been published.</p>
      </div>
    );
  }

  if (locked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-6">
        <div className="w-full max-w-sm text-center">
          <Lock className="mx-auto mb-4 h-6 w-6 text-[var(--fg-muted)]" />
          <h1 className="text-lg font-semibold">This experience is password protected</h1>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              load(password);
            }}
            className="mt-6 flex gap-2"
          >
            <Input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            <Button type="submit">Enter</Button>
          </form>
          {passwordError && <p className="mt-2 text-sm text-[var(--color-danger)]">{passwordError}</p>}
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]" />;
  }

  const currentSpace = data.spaces.find((s) => s.id === currentSpaceId) ?? data.spaces[0] ?? null;
  const currentAssets = data.assets.filter((a) => a.spaceId === currentSpace?.id && a.kind === "PHOTO");
  const heroAsset = currentAssets[0];
  const currentHotspots = data.hotspots.filter((h) => h.spaceId === currentSpace?.id);
  const splatReconstruction = data.reconstructions.find(
    (r) => r.spaceId === currentSpace?.id && r.method === "GAUSSIAN_SPLATTING" && r.outputUri
  );
  const showingSplat = Boolean(splatReconstruction) && show3D;
  const reachable = data.connections
    .filter((c) => c.fromSpaceId === currentSpace?.id)
    .map((c) => data.spaces.find((s) => s.id === c.toSpaceId))
    .filter((s): s is Space => Boolean(s));

  return (
    <div ref={containerRef} className="relative min-h-screen bg-black text-white">
      {/* Hero */}
      <div className="relative h-screen w-full overflow-hidden">
        {showingSplat && splatReconstruction?.outputUri ? (
          <SplatViewer key={splatReconstruction.id} url={splatReconstruction.outputUri} controls="walk" height="100%" />
        ) : heroAsset ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroAsset.url} alt={currentSpace?.name ?? ""} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-neutral-900 text-neutral-500">
            No media captured for this space yet.
          </div>
        )}
        {!showingSplat && <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/40" />}

        {/* Top bar */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-5">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/70">{data.project.name}</p>
            <h1 className="text-lg font-semibold">{currentSpace?.name}</h1>
          </div>
          <div className="relative flex gap-2">
            {splatReconstruction && (
              <button
                onClick={() => setShow3D((v) => !v)}
                className="focus-ring flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2.5 text-sm font-medium backdrop-blur hover:bg-white/20"
                aria-pressed={showingSplat}
              >
                <Box className="h-4 w-4" />
                {showingSplat ? "Photos" : "Walk in 3D"}
              </button>
            )}
            <button
              onClick={share}
              className="focus-ring rounded-full bg-white/10 p-2.5 backdrop-blur hover:bg-white/20"
              aria-label="Share"
              aria-expanded={shareOpen}
            >
              <Share2 className="h-4 w-4" />
            </button>
            {shareOpen && (
              <div className="absolute right-0 top-12 z-20 w-52 overflow-hidden rounded-[var(--radius-md)] border border-white/10 bg-neutral-900/95 py-1.5 text-sm text-white shadow-xl backdrop-blur">
                <button
                  onClick={copyLink}
                  className="focus-ring flex w-full items-center gap-2.5 px-3.5 py-2 text-left hover:bg-white/10"
                >
                  <Link2 className="h-4 w-4" />
                  {linkCopied ? "Copied!" : "Copy link"}
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`${shareTitle} ${window.location.href}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="focus-ring flex items-center gap-2.5 px-3.5 py-2 hover:bg-white/10"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </a>
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="focus-ring flex items-center gap-2.5 px-3.5 py-2 hover:bg-white/10"
                >
                  <Linkedin className="h-4 w-4" />
                  LinkedIn
                </a>
                <a
                  href={`mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(window.location.href)}`}
                  className="focus-ring flex items-center gap-2.5 px-3.5 py-2 hover:bg-white/10"
                >
                  <Mail className="h-4 w-4" />
                  Email
                </a>
              </div>
            )}
            <button
              onClick={() => containerRef.current?.requestFullscreen()}
              className="focus-ring rounded-full bg-white/10 p-2.5 backdrop-blur hover:bg-white/20"
              aria-label="Fullscreen"
            >
              <Maximize className="h-4 w-4" />
            </button>
            <button
              onClick={() => setAiOpen((v) => !v)}
              className="focus-ring flex items-center gap-1.5 rounded-full bg-white text-black px-3.5 py-2.5 text-sm font-medium"
            >
              <Sparkles className="h-4 w-4" />
              Ask AI
            </button>
          </div>
        </div>

        {/* Hotspots */}
        <div className="absolute bottom-40 left-5 flex flex-col gap-2">
          {currentHotspots.map((h) => (
            <button
              key={h.id}
              onClick={() => {
                trackHotspot(h.id);
                if (h.targetSpaceId) setCurrentSpaceId(h.targetSpaceId);
                else if (h.externalUrl) window.open(h.externalUrl, "_blank");
              }}
              className="focus-ring flex max-w-xs items-start gap-2 rounded-[var(--radius-md)] bg-black/50 px-3 py-2 text-left text-sm backdrop-blur hover:bg-black/70"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-accent)]" />
              <span>
                <span className="block font-medium">{h.title}</span>
                {h.description && <span className="block text-xs text-white/70">{h.description}</span>}
              </span>
            </button>
          ))}
        </div>

        {/* Space navigation strip */}
        <div className="absolute inset-x-0 bottom-0 overflow-x-auto p-5">
          <div className="flex gap-2">
            {data.spaces.map((s) => (
              <button
                key={s.id}
                onClick={() => setCurrentSpaceId(s.id)}
                className={`focus-ring shrink-0 rounded-full px-4 py-2 text-sm font-medium backdrop-blur transition-colors ${
                  s.id === currentSpace?.id ? "bg-white text-black" : "bg-white/10 text-white hover:bg-white/20"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
          {reachable.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-white/60">
              Connected to:
              {reachable.map((s) => (
                <span key={s.id} className="flex items-center gap-1">
                  <ArrowRight className="h-3 w-3" />
                  {s.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AI concierge drawer */}
      {aiOpen && (
        <div className="fixed inset-y-0 right-0 z-10 flex w-full max-w-sm flex-col bg-[var(--bg)] text-[var(--fg)] shadow-[var(--shadow-lift)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-[var(--color-accent)]" />
              Ask the AI
            </p>
            <button onClick={() => setAiOpen(false)} className="focus-ring text-[var(--fg-muted)]">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {aiMessages.length === 0 && (
              <p className="text-sm text-[var(--fg-muted)]">What would you like to explore?</p>
            )}
            {aiMessages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-right" : "flex items-end gap-1.5"}>
                <span
                  className={`inline-block max-w-[85%] rounded-[var(--radius-md)] px-3 py-2 text-sm ${
                    m.role === "user" ? "bg-[var(--fg)] text-[var(--bg)]" : "bg-[var(--bg-muted)]"
                  }`}
                >
                  {m.text}
                </span>
                {m.role === "assistant" && (
                  <button
                    onClick={() => speakAnswer(m.text, i)}
                    disabled={speakingIndex !== null}
                    className="focus-ring text-[var(--fg-muted)] disabled:opacity-40"
                    aria-label="Play this answer aloud"
                  >
                    {speakingIndex === i ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Volume2 className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            ))}
          </div>
          {voiceError && <p className="px-4 text-xs text-[var(--color-danger)]">{voiceError}</p>}
          <form onSubmit={askAi} className="flex gap-2 border-t border-[var(--line)] p-4">
            <Input
              placeholder="Show me rooms with a balcony…"
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={toggleRecording}
              disabled={transcribing}
              aria-label={recording ? "Stop recording" : "Ask by voice"}
            >
              {transcribing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : recording ? (
                <Square className="h-4 w-4 text-[var(--color-danger)]" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
            <Button type="submit" disabled={!aiQuestion.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

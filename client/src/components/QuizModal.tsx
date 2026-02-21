import { useState, useEffect } from "react";
import { X, Zap, Brain, Code2, CheckCircle2, XCircle, Loader2, Lightbulb, Flame } from "lucide-react";
import { trpc } from "@/lib/trpc";
import Editor from "@monaco-editor/react";

type Difficulty = "easy" | "medium" | "hard";

interface QuizModalProps {
  onClose: () => void;
  onRefuel: (amount: number) => void;
  currentFuel: number;
}

const DIFFICULTY_CONFIG = {
  easy: {
    label: "Easy",
    icon: "🌍",
    color: "#22c55e",
    borderColor: "rgba(34,197,94,0.4)",
    bg: "rgba(34,197,94,0.08)",
    description: "Geography & space trivia",
    reward: "+25% fuel",
    rewardPct: 25,
  },
  medium: {
    label: "Medium",
    icon: "🧠",
    color: "#eab308",
    borderColor: "rgba(234,179,8,0.4)",
    bg: "rgba(234,179,8,0.08)",
    description: "Programming concepts",
    reward: "+40% fuel",
    rewardPct: 40,
  },
  hard: {
    label: "Hard",
    icon: "⚡",
    color: "#a855f7",
    borderColor: "rgba(168,85,247,0.4)",
    bg: "rgba(168,85,247,0.08)",
    description: "Random LeetCode problem",
    reward: "+60% fuel",
    rewardPct: 60,
  },
};

type Phase = "select" | "question" | "grading" | "result";

export default function QuizModal({ onClose, onRefuel, currentFuel }: QuizModalProps) {
  const [phase, setPhase] = useState<Phase>("select");
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [answer, setAnswer] = useState("");
  const [code, setCode] = useState("// Write your solution here\nfunction solution() {\n  \n}\n");
  const [question, setQuestion] = useState<{
    question: string; hint: string; type: "text" | "code";
    leetcodeId?: number; language?: string;
  } | null>(null);
  const [result, setResult] = useState<{
    passed: boolean; score: number; feedback: string; fuelReward: number;
  } | null>(null);

  const generateQuiz = trpc.quiz.generate.useMutation();
  const gradeAnswer = trpc.quiz.grade.useMutation();

  const handleSelectDifficulty = async (d: Difficulty) => {
    setDifficulty(d);
    setPhase("question");
    setShowHint(false);
    setAnswer("");
    setCode("// Write your solution here\nfunction solution() {\n  \n}\n");
    const q = await generateQuiz.mutateAsync({ difficulty: d });
    setQuestion(q);
  };

  const handleSubmit = async () => {
    if (!difficulty || !question) return;
    setPhase("grading");
    const res = await gradeAnswer.mutateAsync({
      difficulty,
      question: question.question,
      answer: question.type === "code" ? "" : answer,
      code: question.type === "code" ? code : undefined,
    });
    setResult(res);
    setPhase("result");
    if (res.passed) {
      onRefuel(res.fuelReward);
    }
  };

  const handleRetry = () => {
    setPhase("select");
    setDifficulty(null);
    setQuestion(null);
    setResult(null);
    setShowHint(false);
    setAnswer("");
  };

  const cfg = difficulty ? DIFFICULTY_CONFIG[difficulty] : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(5,10,20,0.92)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="relative w-full rounded-xl border overflow-hidden flex flex-col"
        style={{
          background: "oklch(0.10 0.03 240)",
          borderColor: cfg ? cfg.borderColor : "rgba(239,68,68,0.5)",
          boxShadow: cfg
            ? `0 0 40px ${cfg.bg}, 0 0 80px ${cfg.bg}`
            : "0 0 40px rgba(239,68,68,0.2)",
          maxWidth: phase === "question" && question?.type === "code" ? "900px" : "560px",
          maxHeight: "92vh",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0"
          style={{
            borderColor: cfg ? cfg.borderColor : "rgba(239,68,68,0.3)",
            background: cfg ? cfg.bg : "rgba(239,68,68,0.06)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{
                background: cfg ? `${cfg.bg}` : "rgba(239,68,68,0.15)",
                border: `1.5px solid ${cfg ? cfg.borderColor : "rgba(239,68,68,0.4)"}`,
              }}
            >
              <Flame size={14} style={{ color: cfg ? cfg.color : "#ef4444" }} />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-wide text-foreground">
                FUEL REFILL CHALLENGE
              </h2>
              <p className="text-xs text-muted-foreground/60">
                Current fuel: <span style={{ color: currentFuel < 10 ? "#ef4444" : "#f97316" }}>{Math.round(currentFuel)}%</span>
                {cfg && <span> · {cfg.label} · {cfg.reward}</span>}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 min-h-0">

          {/* ── Phase: Select Difficulty ── */}
          {phase === "select" && (
            <div className="flex flex-col gap-4">
              <div className="text-center mb-2">
                <p className="text-sm text-muted-foreground">
                  Answer a question to refuel your astronaut. Choose your difficulty:
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {(["easy", "medium", "hard"] as Difficulty[]).map((d) => {
                  const c = DIFFICULTY_CONFIG[d];
                  return (
                    <button
                      key={d}
                      onClick={() => handleSelectDifficulty(d)}
                      className="flex items-center gap-4 p-4 rounded-xl border text-left transition-all hover:scale-[1.01] active:scale-[0.99]"
                      style={{
                        borderColor: c.borderColor,
                        background: c.bg,
                      }}
                    >
                      <span className="text-2xl">{c.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm" style={{ color: c.color }}>{c.label}</span>
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ background: `${c.color}22`, color: c.color }}
                          >
                            {c.reward}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
                      </div>
                      <div className="text-muted-foreground/40 text-lg">›</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Phase: Question (loading) ── */}
          {phase === "question" && generateQuiz.isPending && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={28} className="animate-spin" style={{ color: cfg?.color }} />
              <p className="text-sm text-muted-foreground">Generating your question with Gemini AI...</p>
            </div>
          )}

          {/* ── Phase: Question (ready) ── */}
          {phase === "question" && !generateQuiz.isPending && question && (
            <div className="flex flex-col gap-4">
              {/* Difficulty badge */}
              <div className="flex items-center gap-2">
                <span className="text-lg">{cfg?.icon}</span>
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: cfg?.color }}>
                  {cfg?.label} Challenge
                </span>
                {question.leetcodeId && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(168,85,247,0.15)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.3)" }}
                  >
                    LeetCode #{question.leetcodeId}
                  </span>
                )}
              </div>

              {/* Question */}
              <div
                className="rounded-lg p-4 text-sm leading-relaxed"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div className="flex items-start gap-2">
                  <Brain size={14} className="mt-0.5 flex-shrink-0" style={{ color: cfg?.color }} />
                  <p className="text-foreground whitespace-pre-wrap">{question.question}</p>
                </div>
              </div>

              {/* Hint toggle */}
              <button
                onClick={() => setShowHint(!showHint)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              >
                <Lightbulb size={11} />
                {showHint ? "Hide hint" : "Show hint"}
              </button>
              {showHint && (
                <div
                  className="rounded-lg px-3 py-2 text-xs"
                  style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.2)", color: "rgba(234,179,8,0.9)" }}
                >
                  💡 {question.hint}
                </div>
              )}

              {/* Answer input */}
              {question.type === "text" ? (
                <div className="flex flex-col gap-2">
                  <label className="text-xs text-muted-foreground uppercase tracking-wider">Your Answer</label>
                  <textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Type your answer here..."
                    rows={4}
                    className="w-full rounded-lg p-3 text-sm resize-none outline-none focus:ring-1"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: `1px solid ${cfg?.borderColor ?? "rgba(255,255,255,0.1)"}`,
                      color: "white",
                    }}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5">
                    <Code2 size={11} style={{ color: cfg?.color }} />
                    <label className="text-xs text-muted-foreground uppercase tracking-wider">
                      Code Editor · {question.language ?? "javascript"}
                    </label>
                  </div>
                  <div
                    className="rounded-lg overflow-hidden"
                    style={{ border: `1px solid ${cfg?.borderColor ?? "rgba(255,255,255,0.1)"}`, height: "320px" }}
                  >
                    <Editor
                      height="320px"
                      language={question.language ?? "javascript"}
                      value={code}
                      onChange={(v) => setCode(v ?? "")}
                      theme="vs-dark"
                      options={{
                        fontSize: 13,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        lineNumbers: "on",
                        tabSize: 2,
                        wordWrap: "on",
                        padding: { top: 8, bottom: 8 },
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={question.type === "text" ? answer.trim().length < 3 : code.trim().length < 10}
                className="w-full py-2.5 rounded-lg font-bold text-sm uppercase tracking-wider transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: `linear-gradient(135deg, ${cfg?.color}cc, ${cfg?.color})`,
                  color: "white",
                  boxShadow: `0 0 16px ${cfg?.bg}`,
                }}
              >
                Submit Answer
              </button>
            </div>
          )}

          {/* ── Phase: Grading ── */}
          {phase === "grading" && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={28} className="animate-spin text-purple-400" />
              <p className="text-sm text-muted-foreground">Gemini AI is evaluating your answer...</p>
            </div>
          )}

          {/* ── Phase: Result ── */}
          {phase === "result" && result && (
            <div className="flex flex-col items-center gap-5 py-4">
              {result.passed ? (
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle2 size={48} className="text-green-400" />
                  <h3 className="text-lg font-bold text-green-400">Mission Accomplished!</h3>
                  <p className="text-sm text-muted-foreground text-center">
                    Score: <span className="font-bold text-foreground">{result.score}/100</span>
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <XCircle size={48} className="text-red-400" />
                  <h3 className="text-lg font-bold text-red-400">Not Quite Right</h3>
                  <p className="text-sm text-muted-foreground text-center">
                    Score: <span className="font-bold text-foreground">{result.score}/100</span>
                  </p>
                </div>
              )}

              {/* Feedback */}
              <div
                className="w-full rounded-lg p-4 text-sm leading-relaxed"
                style={{
                  background: result.passed ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                  border: `1px solid ${result.passed ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
                  color: result.passed ? "rgba(134,239,172,0.9)" : "rgba(252,165,165,0.9)",
                }}
              >
                {result.feedback}
              </div>

              {/* Fuel reward */}
              {result.passed && (
                <div
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold"
                  style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e" }}
                >
                  <Flame size={14} />
                  +{result.fuelReward}% fuel added!
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 w-full">
                {!result.passed && (
                  <button
                    onClick={handleRetry}
                    className="flex-1 py-2 rounded-lg border text-sm font-medium transition-colors hover:bg-secondary"
                    style={{ borderColor: "rgba(255,255,255,0.15)" }}
                  >
                    Try Again
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="flex-1 py-2 rounded-lg text-sm font-bold transition-all hover:opacity-90"
                  style={{
                    background: result.passed
                      ? "linear-gradient(135deg, #22c55e, #16a34a)"
                      : "linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))",
                    color: result.passed ? "white" : "rgba(255,255,255,0.6)",
                  }}
                >
                  {result.passed ? "Continue Journey 🚀" : "Close"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  QuestionMarkCircleIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import type { AskQuestionsInput } from '@/lib/chat/tools';

interface QuestionCardProps {
  toolCallId: string;
  input: AskQuestionsInput;
  state: string;
  output?: unknown;
  addToolResult: (args: { tool: string; toolCallId: string; output: unknown }) => void;
}

type Selections = Record<string, Set<string>>;

interface PersistedAnswer {
  question_id: string;
  selected_option_ids: string[];
  additional_text?: string;
}

interface PersistedResult {
  answers: PersistedAnswer[];
  skipped: boolean;
}

function parsePersistedResult(output: unknown): PersistedResult | null {
  if (!output) return null;
  try {
    const parsed = typeof output === 'string' ? JSON.parse(output) : output;
    if (parsed && Array.isArray(parsed.answers)) return parsed as PersistedResult;
  } catch {}
  return null;
}

export default function QuestionCard({ toolCallId, input, state, output, addToolResult }: QuestionCardProps) {
  const { title, questions } = input;
  const persisted = useMemo(() => parsePersistedResult(output), [output]);
  const alreadyAnswered = state === 'output-available' && persisted !== null;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selections, setSelections] = useState<Selections>(() => {
    const init: Selections = {};
    for (const q of questions) {
      const answer = persisted?.answers.find((a) => a.question_id === q.id);
      init[q.id] = new Set(answer?.selected_option_ids ?? []);
    }
    return init;
  });
  const [additionalText, setAdditionalText] = useState(() => {
    return persisted?.answers[0]?.additional_text ?? '';
  });
  const [submitted, setSubmitted] = useState(alreadyAnswered);

  const question = questions[currentIndex];
  const totalQuestions = questions.length;
  const isLastQuestion = currentIndex === totalQuestions - 1;

  const currentQuestionHasSelection = useMemo(
    () => (selections[question?.id]?.size ?? 0) > 0,
    [selections, question?.id],
  );

  const toggleOption = useCallback(
    (questionId: string, optionId: string, allowMultiple: boolean) => {
      setSelections((prev) => {
        const next = { ...prev };
        const set = new Set(prev[questionId]);
        if (set.has(optionId)) {
          set.delete(optionId);
        } else {
          if (!allowMultiple) set.clear();
          set.add(optionId);
        }
        next[questionId] = set;
        return next;
      });
    },
    [],
  );

  const handleContinue = useCallback(() => {
    if (submitted || !currentQuestionHasSelection) return;
    if (!isLastQuestion) {
      setCurrentIndex((i) => i + 1);
      return;
    }
    setSubmitted(true);
    const answers = questions.map((q) => ({
      question_id: q.id,
      selected_option_ids: Array.from(selections[q.id] || []),
      additional_text: additionalText.trim() || undefined,
    }));
    addToolResult({
      tool: 'ask_questions',
      toolCallId,
      output: JSON.stringify({ answers, skipped: false }),
    });
  }, [submitted, currentQuestionHasSelection, isLastQuestion, questions, selections, additionalText, addToolResult, toolCallId]);

  const handleSkip = useCallback(() => {
    if (submitted) return;
    setSubmitted(true);
    addToolResult({
      tool: 'ask_questions',
      toolCallId,
      output: JSON.stringify({ answers: [], skipped: true }),
    });
  }, [submitted, addToolResult, toolCallId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (submitted) return;
      if (e.key === 'Escape') handleSkip();
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && currentQuestionHasSelection) handleContinue();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [submitted, handleSkip, handleContinue, currentQuestionHasSelection]);

  if (submitted) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="w-full rounded-xl border border-blue-500 bg-gray-100 shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-gray-200/60">
        <div className="flex items-center gap-2">
          <QuestionMarkCircleIcon className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">
            {title || 'Questions'}
          </span>
        </div>
        {totalQuestions > 1 && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <button
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              disabled={currentIndex === 0}
              className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronUpIcon className="w-3.5 h-3.5" />
            </button>
            <span>{currentIndex + 1} of {totalQuestions}</span>
            <button
              onClick={() => setCurrentIndex((i) => Math.min(totalQuestions - 1, i + 1))}
              disabled={currentIndex === totalQuestions - 1}
              className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronDownIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Question body */}
      <div className="px-4 py-3 max-h-72 overflow-y-auto">
        <div className="mb-3">
          <p className="text-sm font-semibold text-gray-900 leading-relaxed">
            {totalQuestions > 1 && (
              <span className="text-gray-400 mr-1.5">{currentIndex + 1}.</span>
            )}
            {question.prompt}
          </p>
        </div>

        {/* Options */}
        <div className="space-y-1">
          {question.options.map((option) => {
            const isSelected = selections[question.id]?.has(option.id);
            const isMulti = question.allow_multiple ?? false;
            return (
              <button
                key={option.id}
                onClick={() => toggleOption(question.id, option.id, isMulti)}
                className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
                  isSelected
                    ? 'bg-blue-50 border border-blue-200'
                    : 'hover:bg-gray-50 border border-transparent'
                }`}
              >
                <span
                  className={`flex-shrink-0 mt-0.5 w-4 h-4 ${isMulti ? 'rounded' : 'rounded-full'} border-2 flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {isSelected && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className={`text-sm leading-relaxed ${isSelected ? 'text-gray-900' : 'text-gray-600'}`}>
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer: optional text + actions */}
      <div className="border-t border-gray-200">
        <div className="px-4 py-2">
          <input
            type="text"
            value={additionalText}
            onChange={(e) => setAdditionalText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && currentQuestionHasSelection) {
                e.preventDefault();
                handleContinue();
              }
            }}
            placeholder="Add more optional details"
            className="w-full bg-transparent text-sm text-gray-600 placeholder-gray-400 outline-none"
          />
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200">
          <div>
            {currentIndex > 0 && (
              <button
                onClick={() => setCurrentIndex((i) => i - 1)}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSkip}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Skip <span className="text-gray-300 text-[10px] ml-0.5">Esc</span>
            </button>
            <button
              onClick={handleContinue}
              disabled={!currentQuestionHasSelection}
              className="px-3 py-1 rounded-lg text-xs font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLastQuestion ? 'Continue' : 'Next'} <span className="text-blue-200 text-[10px] ml-0.5">&#9166;</span>
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function QuestionCardSummary({
  input,
  selections,
  additionalText,
  skipped,
}: {
  input: AskQuestionsInput;
  selections?: Selections;
  additionalText?: string;
  skipped?: boolean;
}) {
  if (skipped) {
    return (
      <div className="text-xs text-gray-400 italic py-1">
        Questions skipped
      </div>
    );
  }

  if (!selections) return null;

  const answeredQuestions = input.questions.filter(
    (q) => (selections[q.id]?.size ?? 0) > 0,
  );

  if (answeredQuestions.length === 0) {
    return (
      <div className="text-xs text-gray-400 italic py-1">
        Questions skipped
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl border border-gray-200 bg-white overflow-hidden my-1">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <QuestionMarkCircleIcon className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-medium text-gray-700">Answers</span>
      </div>

      {/* Answered questions */}
      <div className="px-4 py-3 space-y-4">
        {answeredQuestions.map((q) => {
          const selected = Array.from(selections[q.id] || []);
          const labels = selected
            .map((id) => q.options.find((o) => o.id === id)?.label)
            .filter(Boolean);
          return (
            <div key={q.id}>
              <p className="text-sm text-gray-500 leading-relaxed mb-1">
                {q.prompt}
              </p>
              <p className="text-sm font-semibold text-gray-900 leading-relaxed">
                {labels.join(', ')}
              </p>
            </div>
          );
        })}
        {additionalText && (
          <p className="text-sm text-gray-500 italic">
            &ldquo;{additionalText}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}

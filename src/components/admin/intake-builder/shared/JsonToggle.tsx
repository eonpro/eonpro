'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Check, X, Copy, RotateCcw, Save } from 'lucide-react';
import type { FormConfig } from '../state/builderTypes';

export interface JsonToggleProps {
  config: FormConfig;
  onApply: (config: FormConfig) => void;
}

export default function JsonToggle({ config, onApply }: JsonToggleProps) {
  const [rawJson, setRawJson] = useState(() => JSON.stringify(config, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setRawJson(JSON.stringify(config, null, 2));
  }, [config]);

  const validateJson = useCallback((text: string): { parsed: FormConfig } | { error: string } => {
    try {
      const parsed = JSON.parse(text) as FormConfig;
      if (!parsed || typeof parsed !== 'object') return { error: 'Invalid structure' };
      if (!Array.isArray(parsed.steps)) return { error: 'Missing or invalid steps array' };
      if (!parsed.startStep || typeof parsed.startStep !== 'string')
        return { error: 'Missing startStep' };
      return { parsed };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Invalid JSON' };
    }
  }, []);

  const handleChange = useCallback(
    (value: string) => {
      setRawJson(value);
      const result = validateJson(value);
      if ('error' in result) {
        setParseError(result.error);
      } else {
        setParseError(null);
      }
    },
    [validateJson]
  );

  const handleApply = useCallback(() => {
    const result = validateJson(rawJson);
    if ('parsed' in result) {
      onApply(result.parsed);
      setParseError(null);
    } else {
      setParseError(result.error);
    }
  }, [rawJson, validateJson, onApply]);

  const handleReset = useCallback(() => {
    setRawJson(JSON.stringify(config, null, 2));
    setParseError(null);
  }, [config]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(rawJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [rawJson]);

  const validationResult = validateJson(rawJson);
  const isValid = 'parsed' in validationResult;
  const lineCount = rawJson.split('\n').length;

  return (
    <div className="flex h-full flex-col">
      {/* Warning banner */}
      <div className="flex flex-shrink-0 items-start gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2">
        <span className="mt-0.5 text-amber-600">⚠</span>
        <p className="text-xs text-amber-800">
          Advanced mode — editing JSON directly may break your form if the structure is invalid.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-gray-700 bg-gray-800/50 px-3 py-2">
        <div className="flex items-center gap-2">
          {isValid ? (
            <span className="inline-flex items-center gap-1.5 rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-400">
              <Check className="h-3.5 w-3.5" />
              Valid JSON
            </span>
          ) : parseError ? (
            <span className="inline-flex max-w-[200px] items-center gap-1.5 truncate rounded bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-400">
              <X className="h-3.5 w-3.5 flex-shrink-0" />
              {parseError}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded bg-gray-500/20 px-2 py-0.5 text-xs font-medium text-gray-400">
              Editing...
            </span>
          )}
          <span className="text-xs text-gray-500">{lineCount} lines</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-200"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-400 transition-colors hover:bg-gray-700 hover:text-gray-200"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!isValid}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Save className="h-3.5 w-3.5" />
            Apply Changes
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="w-8 flex-shrink-0 select-none bg-gray-900/50 py-3 pr-2 text-right font-mono text-xs text-gray-500">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} className="leading-6">
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          value={rawJson}
          onChange={(e) => handleChange(e.target.value)}
          spellCheck={false}
          className="h-full min-w-0 flex-1 resize-none border-0 bg-gray-900 px-3 py-3 font-mono text-sm text-green-400 focus:outline-none focus:ring-0"
          style={{ tabSize: 2 }}
        />
      </div>
    </div>
  );
}

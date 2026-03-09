'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Check, X, Copy, RotateCcw, Save } from 'lucide-react';
import type { FormConfig } from '../state/builderTypes';

export interface JsonToggleProps {
  config: FormConfig;
  onApply: (config: FormConfig) => void;
}

export default function JsonToggle({ config, onApply }: JsonToggleProps) {
  const [rawJson, setRawJson] = useState(() =>
    JSON.stringify(config, null, 2),
  );
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
      if (!parsed.startStep || typeof parsed.startStep !== 'string') return { error: 'Missing startStep' };
      return { parsed };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Invalid JSON' };
    }
  }, []);

  const handleChange = useCallback((value: string) => {
    setRawJson(value);
    const result = validateJson(value);
    if ('error' in result) {
      setParseError(result.error);
    } else {
      setParseError(null);
    }
  }, [validateJson]);

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
    <div className="flex flex-col h-full">
      {/* Warning banner */}
      <div className="flex-shrink-0 flex items-start gap-2 px-3 py-2 bg-amber-50 border-b border-amber-200">
        <span className="text-amber-600 mt-0.5">⚠</span>
        <p className="text-xs text-amber-800">
          Advanced mode — editing JSON directly may break your form if the structure is invalid.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-700 bg-gray-800/50">
        <div className="flex items-center gap-2">
          {isValid ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-400">
              <Check className="w-3.5 h-3.5" />
              Valid JSON
            </span>
          ) : parseError ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400 truncate max-w-[200px]">
              <X className="w-3.5 h-3.5 flex-shrink-0" />
              {parseError}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-gray-500/20 text-gray-400">
              Editing...
            </span>
          )}
          <span className="text-xs text-gray-500">{lineCount} lines</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!isValid}
            className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            Apply Changes
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div className="flex-shrink-0 w-8 py-3 pr-2 text-right text-xs text-gray-500 font-mono select-none bg-gray-900/50">
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
          className="flex-1 min-w-0 h-full px-3 py-3 text-sm font-mono text-green-400 bg-gray-900 border-0 focus:outline-none focus:ring-0 resize-none"
          style={{ tabSize: 2 }}
        />
      </div>
    </div>
  );
}

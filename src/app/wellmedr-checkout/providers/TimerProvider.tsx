"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useMemo,
  useCallback,
} from "react";

interface TimerContextType {
  timeLeft: number;
  formattedTime: string;
  isExpired: boolean;
  reset: () => void;
}

const TimerContext = createContext<TimerContextType | undefined>(undefined);

const initialTime = 15 * 60;

interface TimerProviderProps {
  children: ReactNode;
  onExpire?: () => void;
}

export function TimerProvider({ children, onExpire }: TimerProviderProps) {
  const [timeLeft, setTimeLeft] = useState(initialTime);
  const [isExpired, setIsExpired] = useState(false);

  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }, []);

  const reset = useCallback(() => {
    setTimeLeft(initialTime);
    setIsExpired(false);
  }, [initialTime]);

  const value = useMemo(
    () => ({
      timeLeft,
      formattedTime: formatTime(timeLeft),
      isExpired,
      reset,
    }),
    [timeLeft, isExpired, reset, formatTime]
  );

  useEffect(() => {
    if (timeLeft <= 0) {
      setIsExpired(true);
      onExpire?.();
      return;
    }

    const timerId = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerId);
          setIsExpired(true);
          onExpire?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerId);
  }, [timeLeft, onExpire]);

  return (
    <TimerContext.Provider value={value}>{children}</TimerContext.Provider>
  );
}

export function useTimerContext() {
  const context = useContext(TimerContext);
  if (context === undefined) {
    throw new Error("useTimerContext must be used within a TimerProvider");
  }
  return context;
}

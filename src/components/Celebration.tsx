'use client';

/**
 * Celebration Components
 * Confetti, achievement popups, and milestone celebrations
 */

import { useEffect, useState, useCallback } from 'react';
import { X, Trophy, Star, Flame, CheckCircle } from 'lucide-react';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';

interface ConfettiPiece {
  id: number;
  x: number;
  y: number;
  rotation: number;
  color: string;
  size: number;
  velocity: { x: number; y: number };
}

/**
 * Confetti Animation Component
 */
export function Confetti({
  duration = 3000,
  onComplete,
}: {
  duration?: number;
  onComplete?: () => void;
}) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);
  const [isActive, setIsActive] = useState(true);

  const colors = [
    '#FFD700',
    '#FF6B6B',
    '#4ECDC4',
    '#45B7D1',
    '#96CEB4',
    '#FFEAA7',
    '#DDA0DD',
    '#98D8C8',
  ];

  useEffect(() => {
    // Create confetti pieces
    const newPieces: ConfettiPiece[] = [];
    for (let i = 0; i < 150; i++) {
      newPieces.push({
        id: i,
        x: Math.random() * 100,
        y: -10 - Math.random() * 20,
        rotation: Math.random() * 360,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 8 + Math.random() * 8,
        velocity: {
          x: (Math.random() - 0.5) * 4,
          y: 2 + Math.random() * 3,
        },
      });
    }
    setPieces(newPieces);

    // Stop after duration
    const timer = setTimeout(() => {
      setIsActive(false);
      onComplete?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onComplete]);

  if (!isActive) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className="animate-confetti-fall absolute"
          style={{
            left: `${piece.x}%`,
            top: `${piece.y}%`,
            width: piece.size,
            height: piece.size * 0.6,
            backgroundColor: piece.color,
            transform: `rotate(${piece.rotation}deg)`,
            animation: `confetti-fall ${2 + Math.random()}s linear forwards`,
            animationDelay: `${Math.random() * 0.5}s`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Achievement Unlocked Popup
 */
interface AchievementPopupProps {
  achievement: {
    name: string;
    description: string;
    tier: string;
    points: number;
    icon?: string;
  };
  onClose: () => void;
  showConfetti?: boolean;
}

export function AchievementPopup({
  achievement,
  onClose,
  showConfetti = true,
}: AchievementPopupProps) {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const tierColors: Record<string, { bg: string; text: string }> = {
    BRONZE: { bg: 'bg-amber-100', text: 'text-amber-700' },
    SILVER: { bg: 'bg-gray-100', text: 'text-gray-700' },
    GOLD: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
    PLATINUM: { bg: 'bg-slate-100', text: 'text-slate-600' },
    DIAMOND: { bg: 'bg-cyan-100', text: 'text-cyan-700' },
  };

  const colors = tierColors[achievement.tier] || tierColors.BRONZE;

  return (
    <>
      {showConfetti && <Confetti />}
      <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-sm animate-scale-up rounded-3xl bg-white p-6 text-center">
          {/* Trophy Icon */}
          <div
            className={`mx-auto mb-4 h-20 w-20 rounded-full ${colors.bg} animate-bounce-slow flex items-center justify-center`}
          >
            <Trophy className={`h-10 w-10 ${colors.text}`} />
          </div>

          {/* Title */}
          <h2 className="mb-1 text-2xl font-bold text-gray-900">Achievement Unlocked!</h2>
          <p className="mb-4 text-gray-600">Congratulations!</p>

          {/* Achievement Card */}
          <div className={`${colors.bg} mb-4 rounded-2xl p-4`}>
            <h3 className="text-lg font-bold text-gray-900">{achievement.name}</h3>
            <p className="mt-1 text-sm text-gray-600">{achievement.description}</p>
            <div className="mt-3 flex items-center justify-center gap-3">
              <span
                className={`rounded-full bg-white px-2 py-1 text-xs font-medium ${colors.text}`}
              >
                {achievement.tier}
              </span>
              <span className="text-sm font-semibold text-purple-600">
                +{achievement.points} pts
              </span>
            </div>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-full rounded-xl py-3 font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: primaryColor }}
          >
            Awesome!
          </button>
        </div>
      </div>
      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes scale-up {
          from {
            transform: scale(0.8);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        @keyframes bounce-slow {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        .animate-scale-up {
          animation: scale-up 0.4s ease-out;
        }
        .animate-bounce-slow {
          animation: bounce-slow 2s ease-in-out infinite;
        }
      `}</style>
    </>
  );
}

/**
 * Milestone Celebration Component
 */
interface MilestoneCelebrationProps {
  title: string;
  subtitle: string;
  value: string;
  type: 'weight_loss' | 'streak' | 'goal' | 'achievement';
  onClose: () => void;
}

export function MilestoneCelebration({
  title,
  subtitle,
  value,
  type,
  onClose,
}: MilestoneCelebrationProps) {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const icons = {
    weight_loss: { icon: Star, color: 'text-yellow-500', bg: 'bg-yellow-100' },
    streak: { icon: Flame, color: 'text-orange-500', bg: 'bg-orange-100' },
    goal: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100' },
    achievement: { icon: Trophy, color: 'text-purple-500', bg: 'bg-purple-100' },
  };

  const { icon: Icon, color, bg } = icons[type];

  return (
    <>
      <Confetti />
      <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-sm animate-scale-up rounded-3xl bg-white p-6 text-center">
          {/* Icon */}
          <div
            className={`mx-auto mb-4 h-24 w-24 rounded-full ${bg} flex items-center justify-center`}
          >
            <Icon className={`h-12 w-12 ${color}`} />
          </div>

          {/* Large Value */}
          <div className="mb-2 text-5xl font-bold" style={{ color: primaryColor }}>
            {value}
          </div>

          {/* Title */}
          <h2 className="mb-1 text-xl font-bold text-gray-900">{title}</h2>
          <p className="mb-6 text-gray-600">{subtitle}</p>

          {/* Share Button (optional) */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl py-3 font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: primaryColor }}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes scale-up {
          from {
            transform: scale(0.8);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        .animate-scale-up {
          animation: scale-up 0.4s ease-out;
        }
      `}</style>
    </>
  );
}

/**
 * Toast notification for quick celebrations
 */
interface CelebrationToastProps {
  message: string;
  icon?: 'star' | 'flame' | 'trophy' | 'check';
  points?: number;
  onClose: () => void;
}

export function CelebrationToast({
  message,
  icon = 'star',
  points,
  onClose,
}: CelebrationToastProps) {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const icons = {
    star: Star,
    flame: Flame,
    trophy: Trophy,
    check: CheckCircle,
  };

  const Icon = icons[icon];

  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 animate-slide-up md:bottom-6 md:left-auto md:right-6 md:max-w-sm">
      <div
        className="flex items-center gap-3 rounded-2xl p-4 text-white shadow-lg"
        style={{ backgroundColor: primaryColor }}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="font-medium">{message}</p>
          {points && <p className="text-sm text-white/80">+{points} points</p>}
        </div>
        <button onClick={onClose} className="text-white/60 hover:text-white">
          <X className="h-5 w-5" />
        </button>
      </div>
      <style jsx>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

/**
 * Hook to manage celebration state
 */
export function useCelebration() {
  const [celebration, setCelebration] = useState<{
    type: 'achievement' | 'milestone' | 'toast';
    data: any;
  } | null>(null);

  const showAchievement = useCallback((achievement: AchievementPopupProps['achievement']) => {
    setCelebration({ type: 'achievement', data: achievement });
  }, []);

  const showMilestone = useCallback((data: Omit<MilestoneCelebrationProps, 'onClose'>) => {
    setCelebration({ type: 'milestone', data });
  }, []);

  const showToast = useCallback((data: Omit<CelebrationToastProps, 'onClose'>) => {
    setCelebration({ type: 'toast', data });
  }, []);

  const closeCelebration = useCallback(() => {
    setCelebration(null);
  }, []);

  const CelebrationComponent = () => {
    if (!celebration) return null;

    switch (celebration.type) {
      case 'achievement':
        return <AchievementPopup achievement={celebration.data} onClose={closeCelebration} />;
      case 'milestone':
        return <MilestoneCelebration {...celebration.data} onClose={closeCelebration} />;
      case 'toast':
        return <CelebrationToast {...celebration.data} onClose={closeCelebration} />;
      default:
        return null;
    }
  };

  return {
    showAchievement,
    showMilestone,
    showToast,
    closeCelebration,
    CelebrationComponent,
  };
}

'use client';

import { useState, useEffect, useRef } from 'react';

interface BMIWidgetProps {
  bmi: number;
  language: 'en' | 'es';
  accentColor?: string;
}

export default function BMIWidget({ bmi, language, accentColor }: BMIWidgetProps) {
  const accent = accentColor || '#7cb342';
  const accentDark = accentColor ? accentColor : '#558b2f';
  const [indicatorPosition, setIndicatorPosition] = useState(0);
  const [barFillWidth, setBarFillWidth] = useState(0);
  const [showIndicator, setShowIndicator] = useState(false);
  const [showLabel, setShowLabel] = useState(false);
  const lastBMI = useRef<number | null>(null);
  const isAnimating = useRef(false);

  const calculatePosition = (bmiValue: number) => {
    if (bmiValue <= 18.5) return 0;
    if (bmiValue <= 25) return ((bmiValue - 18.5) / (25 - 18.5)) * 25;
    if (bmiValue <= 30) return 25 + ((bmiValue - 25) / (30 - 25)) * 25;
    if (bmiValue <= 40) return 50 + ((bmiValue - 30) / (40 - 30)) * 25;
    if (bmiValue <= 50) return 75 + ((bmiValue - 40) / (50 - 40)) * 25;
    return 100;
  };

  const getBMICategory = (bmiValue: number) => {
    if (language === 'es') {
      if (bmiValue < 18.5) return "Bajo Peso";
      if (bmiValue < 25) return "Normal";
      if (bmiValue < 30) return "Sobrepeso";
      if (bmiValue < 35) return "Obesidad I";
      if (bmiValue < 40) return "Obesidad II";
      return "Obesidad III";
    } else {
      if (bmiValue < 18.5) return "Underweight";
      if (bmiValue < 25) return "Normal";
      if (bmiValue < 30) return "Overweight";
      if (bmiValue < 35) return "Obesity I";
      if (bmiValue < 40) return "Obesity II";
      return "Obesity III";
    }
  };

  const isApproved = bmi >= 23;

  useEffect(() => {
    if (bmi > 0 && !isAnimating.current && bmi !== lastBMI.current) {
      isAnimating.current = true;
      lastBMI.current = bmi;
      
      const position = calculatePosition(bmi);
      
      setShowIndicator(true);
      setIndicatorPosition(0);
      setBarFillWidth(0);
      
      setTimeout(() => {
        setBarFillWidth(position);
        setIndicatorPosition(position);
        
        setTimeout(() => {
          setShowLabel(true);
          isAnimating.current = false;
        }, 1200);
      }, 100);
    }
  }, [bmi]);

  const categoryLabels = language === 'es' 
    ? ['Bajo', 'Normal', 'Sobrepeso', 'Obesidad']
    : ['Under', 'Normal', 'Over', 'Obese'];

  const statusText = language === 'es'
    ? (isApproved ? 'IMC Aprobado ✓' : 'IMC No Aprobado')
    : (isApproved ? 'BMI Approved ✓' : 'BMI Not Approved');

  const getBadgeTransform = () => {
    if (indicatorPosition > 75) {
      return 'translateX(-85%)';
    } else if (indicatorPosition < 25) {
      return 'translateX(-15%)';
    }
    return 'translateX(-50%)';
  };

  const getArrowOffset = () => {
    if (indicatorPosition > 75) {
      return '75%';
    } else if (indicatorPosition < 25) {
      return '25%';
    }
    return '50%';
  };

  return (
    <div className="relative w-full max-w-[500px] mx-auto pt-10 pb-5 px-4 overflow-visible">
      {/* Floating Label */}
      <div 
        className="absolute top-0 z-20 transition-all duration-400"
        style={{ 
          left: `${indicatorPosition}%`,
          transform: getBadgeTransform(),
          opacity: showLabel ? 1 : 0,
          transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
        }}
      >
        <div 
          className="relative text-[11px] font-semibold tracking-wide px-4 py-2 rounded-full whitespace-nowrap"
          style={{
            background: accent,
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
            color: '#ffffff'
          }}
        >
          <span className="text-white">{statusText} · {getBMICategory(bmi)}</span>
          <div 
            className="absolute"
            style={{
              left: getArrowOffset(),
              transform: 'translateX(-50%)',
              bottom: '-6px',
              borderLeft: '7px solid transparent',
              borderRight: '7px solid transparent',
              borderTop: `7px solid ${accent}`
            }}
          />
        </div>
      </div>

      {/* Track Container */}
      <div className="relative">
        <div 
          className="relative h-3 w-full rounded-[20px] overflow-hidden"
          style={{
            background: '#e8e8e8',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
          }}
        >
          <div 
            className="absolute inset-y-0 left-0 rounded-[20px]"
            style={{
              width: `${barFillWidth}%`,
              background: 'linear-gradient(90deg, #ff6b6b 0%, #feca57 25%, #48dbfb 50%, #1dd1a1 75%, #feca57 100%)',
              transition: 'width 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
              backgroundSize: '400% 100%',
            }}
          />
        </div>
        
        {showIndicator && bmi > 0 && (
          <>
            <div
              className="absolute top-1/2 z-[9]"
              style={{
                left: `${indicatorPosition}%`,
                transform: 'translate(-50%, -50%)',
                width: '22px',
                height: '22px',
                border: `2px solid ${accent}99`,
                borderRadius: '50%',
                animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
                transition: 'left 1.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            />
            
            <div
              className="absolute top-1/2 z-10"
              style={{
                left: `${indicatorPosition}%`,
                transform: 'translate(-50%, -50%)',
                width: '22px',
                height: '22px',
                background: 'white',
                borderRadius: '50%',
                boxShadow: '0 2px 10px rgba(0,0,0,0.25), 0 0 0 3px rgba(255,255,255,0.5)',
                transition: 'left 1.2s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              <div 
                className="absolute top-1/2 left-1/2 w-[10px] h-[10px] rounded-full"
                style={{
                  transform: 'translate(-50%, -50%)',
                  background: `linear-gradient(135deg, ${accent}, ${accentDark})`
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* Scale Labels */}
      <div className="flex justify-between mt-2 px-0.5">
        <span className="text-[8.5px] font-medium text-[#999] tracking-wide">18.5</span>
        <span className="text-[8.5px] font-medium text-[#999] tracking-wide">25</span>
        <span className="text-[8.5px] font-medium text-[#999] tracking-wide">30</span>
        <span className="text-[8.5px] font-medium text-[#999] tracking-wide">40</span>
        <span className="text-[8.5px] font-medium text-[#999] tracking-wide">50</span>
      </div>

      {/* Category Labels */}
      <div className="flex justify-between mt-3 px-1">
        {categoryLabels.map((label, index) => (
          <span 
            key={index} 
            className="text-[8px] font-medium text-[#bbb] uppercase tracking-wider"
          >
            {label}
          </span>
        ))}
      </div>

      <style jsx>{`
        @keyframes ping {
          0% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
          }
          75%, 100% {
            transform: translate(-50%, -50%) scale(2);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}

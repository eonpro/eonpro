import React from 'react';

const BeccaAILogo: React.FC<{ className?: string }> = ({ className = "" }) => {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <svg 
        className="w-12 h-12" 
        viewBox="0 0 100 100" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="50" cy="50" r="45" fill="#10B981" />
        <text 
          x="50" 
          y="65" 
          fontSize="40" 
          fontWeight="bold" 
          fill="white" 
          textAnchor="middle"
        >
          B
        </text>
      </svg>
      <span className="ml-3 text-2xl font-bold text-gray-900">
        Becca AI
      </span>
    </div>
  );
};

export default BeccaAILogo;

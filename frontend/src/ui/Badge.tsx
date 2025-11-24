import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'error' | 'warning' | 'neutral' | 'info';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'neutral', className = '' }) => {
  const variants = {
    success: 'bg-neon-green/10 text-neon-green border-neon-green/20',
    error: 'bg-neon-red/10 text-neon-red border-neon-red/20',
    warning: 'bg-neon-amber/10 text-neon-amber border-neon-amber/20',
    info: 'bg-neon-blue/10 text-neon-blue border-neon-blue/20',
    neutral: 'bg-white/5 text-gray-400 border-white/10',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};


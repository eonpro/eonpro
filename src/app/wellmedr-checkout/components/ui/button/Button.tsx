'use client';

import ArrowRight from '../../icons/ArrowRight';
import { getButtonStyles } from './buttonStyles';

interface ButtonProps {
  onClick: (e: React.FormEvent) => void;
  className?: string;
  text?: string | React.ReactNode;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'default' | 'outline';
}

const Button = ({
  className,
  text = 'Continue',
  onClick,
  prefix,
  suffix = <ArrowRight />,
  disabled,
  type = 'button',
  variant = 'default',
}: ButtonProps) => {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled) {
      onClick(e as unknown as React.FormEvent);
    }
  };

  return (
    <button
      type={type}
      onClick={handleClick}
      disabled={disabled}
      className={getButtonStyles({ variant, disabled, className })}
    >
      <>
        {prefix ? prefix : null}
        {text}
        {suffix ? suffix : null}
      </>
    </button>
  );
};

export default Button;

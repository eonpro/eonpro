import Link from 'next/link';
import ArrowRight from '../../icons/ArrowRight';
import { getButtonStyles } from './buttonStyles';
import { HTMLAttributeAnchorTarget } from 'react';

interface LinkButtonProps {
  href: string;
  text: string | React.ReactNode;
  className?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  variant?: 'default' | 'outline';
  target?: HTMLAttributeAnchorTarget;
}

const LinkButton = ({
  href,
  className,
  text,
  prefix,
  suffix = <ArrowRight />,
  variant = 'default',
  target = '_self',
}: LinkButtonProps) => {
  return (
    <Link href={href} className={getButtonStyles({ variant, className })} target={target}>
      {prefix ? prefix : null}
      {text}
      {suffix ? suffix : null}
    </Link>
  );
};

export default LinkButton;

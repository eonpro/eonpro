import { SVGProps } from 'react';

const Star = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    fill="none"
    viewBox="0 0 16 16"
    aria-label="Star icon"
    {...props}
  >
    <path
      fill="currentColor"
      d="m6.1.848 1.417 4.36h4.585l-3.71 2.694 1.418 4.36L6.1 9.568l-3.708 2.694 1.417-4.36-3.71-2.694h4.585z"
    />
  </svg>
);

export default Star;

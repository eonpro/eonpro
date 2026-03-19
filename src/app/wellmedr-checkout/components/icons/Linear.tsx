import { SVGProps } from 'react';

const Linear = (props: SVGProps<SVGSVGElement>) => {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M21.8569 17.5713L12.4283 8.14272L8.99972 12.4284L2.14258 5.57129M21.8569 17.5713H15.8569M21.8569 17.5713V11.5713"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default Linear;

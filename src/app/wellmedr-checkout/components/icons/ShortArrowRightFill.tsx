import { SVGProps } from 'react';

const ShortArrowRightFill = (props: SVGProps<SVGSVGElement>) => {
  return (
    <svg
      width="20"
      height="21"
      viewBox="0 0 20 21"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <g clipPath="url(#clip0_short_arrow)">
        <circle cx="10" cy="10.5" r="10" fill="#351C0C" />
        <path
          d="M5.75 9.7475H12.1L9.62 7.2875C9.33 6.9875 9.33 6.5175 9.62 6.2175C9.91 5.9275 10.39 5.9275 10.68 6.2175L14.45 9.9675C14.73 10.2475 14.73 10.7475 14.45 11.0275L10.68 14.7775C10.39 15.0675 9.91 15.0675 9.62 14.7775C9.48 14.6275 9.4 14.4365 9.4 14.2475C9.4 14.0575 9.48 13.8575 9.62 13.7175L12.1 11.2475H5.75C5.33 11.2475 5 10.9175 5 10.4975C5 10.0875 5.33 9.7475 5.75 9.7475Z"
          fill="white"
        />
      </g>
      <defs>
        <clipPath id="clip0_short_arrow">
          <rect
            width="20"
            height="20"
            fill="white"
            transform="translate(0 0.5)"
          />
        </clipPath>
      </defs>
    </svg>
  );
};

export default ShortArrowRightFill;

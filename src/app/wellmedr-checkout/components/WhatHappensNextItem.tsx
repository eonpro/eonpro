import { JSX } from 'react';

const WhatHappensNextItem = ({
  stepNo,
  title,
  description,
}: {
  stepNo: number;
  title: string;
  description: string | JSX.Element;
}) => {
  return (
    <li className="flex flex-col gap-3">
      <span className="text-primary text-sm font-semibold uppercase leading-[16px] -tracking-[1%]">
        Step {stepNo}
      </span>
      <p className="text-lg font-medium sm:text-xl">{title}</p>
      <p className="text-base sm:text-lg">{description}</p>
    </li>
  );
};

export default WhatHappensNextItem;

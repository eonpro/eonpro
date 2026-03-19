import { JSX } from "react";

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
      <span className="font-semibold text-sm -tracking-[1%] leading-[16px] text-primary uppercase">
        Step {stepNo}
      </span>
      <p className="text-lg sm:text-xl font-medium">{title}</p>
      <p className="text-base sm:text-lg">{description}</p>
    </li>
  );
};

export default WhatHappensNextItem;

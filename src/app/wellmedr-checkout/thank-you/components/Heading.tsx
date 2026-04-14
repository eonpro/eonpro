export default function ThankYouHeading({ firstName = 'Amanda' }: { firstName: string | null }) {
  return (
    <h2 className="max-w-[200px] text-[1.75rem] font-normal leading-[32px] -tracking-[0.01em] sm:max-w-none md:text-[3rem] md:leading-[48px] md:-tracking-[0.04em]">
      {firstName ? (
        <span className="italic-primary text-[2rem] capitalize leading-[40px] -tracking-[0.02em] md:text-[2.75rem] md:leading-[48px]">
          {firstName},
        </span>
      ) : null}{' '}
      thanks for your order!
    </h2>
  );
}

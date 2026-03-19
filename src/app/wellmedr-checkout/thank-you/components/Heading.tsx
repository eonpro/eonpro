export default function ThankYouHeading({
  firstName = 'Amanda',
}: {
  firstName: string | null;
}) {
  return (
    <h2 className="leading-[32px] md:leading-[48px] -tracking-[0.01em] md:-tracking-[0.04em] text-[1.75rem] md:text-[3rem] font-normal max-w-[200px] sm:max-w-none">
      {firstName ? (
        <span className="italic-primary -tracking-[0.02em] leading-[40px] md:leading-[48px] text-[2rem] md:text-[2.75rem] capitalize">
          {firstName},
        </span>
      ) : null}{' '}
      thanks for your order!
    </h2>
  );
}

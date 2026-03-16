export default function FooterCTA() {
  return (
    <section className="relative overflow-hidden bg-white py-24 sm:py-32">
      {/* Gradient orbs */}
      <div className="pointer-events-none absolute -left-20 top-0 h-[400px] w-[400px] rounded-full bg-[#4fa77e]/8 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-[300px] w-[300px] rounded-full bg-[#4fa77e]/5 blur-3xl" />

      <div className="relative mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-[#1f2933] sm:text-4xl lg:text-5xl">
          Ready to transform{' '}
          <span className="bg-gradient-to-r from-[#4fa77e] to-[#3d8a65] bg-clip-text text-transparent">
            your clinic?
          </span>
        </h2>
        <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[#1f2933]/55">
          Join the growing network of clinics that trust EonPro to power their
          telehealth operations. Schedule a demo and see the platform in action.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <a
            href="mailto:contact@eonpro.io?subject=EonPro%20Demo%20Request"
            className="rounded-full bg-[#4fa77e] px-10 py-4 text-base font-semibold text-white shadow-lg shadow-[#4fa77e]/25 transition-all hover:bg-[#429b6f] hover:shadow-xl hover:shadow-[#4fa77e]/30"
          >
            Request a Demo
          </a>
          <a
            href="mailto:support@eonpro.io"
            className="rounded-full border border-[#1f2933]/15 bg-white px-10 py-4 text-base font-semibold text-[#1f2933] transition-all hover:border-[#1f2933]/25 hover:shadow-md"
          >
            Contact Support
          </a>
        </div>
        <p className="mt-8 text-sm text-[#1f2933]/35">
          Or email us directly at{' '}
          <a
            href="mailto:contact@eonpro.io"
            className="text-[#4fa77e] underline underline-offset-2 hover:text-[#429b6f]"
          >
            contact@eonpro.io
          </a>
        </p>
      </div>
    </section>
  );
}

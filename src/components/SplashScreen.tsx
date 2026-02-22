export const SplashScreen = () => (
  <div className="fixed inset-0 flex flex-col items-center justify-center bg-void z-50">
    {/* Subtle ambient glow */}
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-accent/[0.03] rounded-full blur-[140px]" />
    </div>

    {/* Diamond + wordmark */}
    <div className="flex flex-col items-center gap-4 mb-10">
      <span className="text-[40px] leading-none text-accent/80 select-none" aria-hidden>
        ◇
      </span>
      <span className="text-[15px] tracking-[0.35em] uppercase text-text-secondary font-light select-none">
        Prowl
      </span>
    </div>

    {/* Pulsing dot */}
    <span className="block w-1.5 h-1.5 rounded-full bg-accent/60 animate-pulse mb-5" />

    {/* Status line */}
    <p className="text-[12px] text-text-muted tracking-wide">
      Restoring workspace…
    </p>
  </div>
);

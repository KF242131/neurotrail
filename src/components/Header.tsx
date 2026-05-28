import { NeuroTrailLogo } from "./NeuroTrailLogo";

type Props = {
  status: string;
  statusDim?: boolean;
};

export function Header({ status, statusDim }: Props) {
  return (
    <header className="relative z-30 flex items-center justify-between px-10 pt-7 pb-3">
      <div className="flex items-center gap-3">
        <NeuroTrailLogo className="h-9 w-9 opacity-85" />
        <h1 className="nt-wordmark text-[19px] leading-none text-nt-bright/95">
          NeuroTrail
        </h1>
      </div>

      <div className="flex items-center gap-2.5 text-[10.5px] text-nt-mid tracking-[0.22em] uppercase">
        <span
          className={`inline-block h-1 w-1 rounded-full ${
            statusDim ? "bg-nt-faint" : "bg-nt-bright/70 animate-slow-blink"
          }`}
        />
        <span className={statusDim ? "text-nt-dim" : "text-nt-mid"}>
          {status}
        </span>
      </div>
    </header>
  );
}

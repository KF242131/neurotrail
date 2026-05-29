import { NeuroTrailLogo } from "./NeuroTrailLogo";
import { SUPPORTED_LOCALES } from "../lib/i18n";
import { useI18n } from "../i18nContext";

type Props = {
  status: string;
  statusDim?: boolean;
};

export function Header({ status, statusDim }: Props) {
  const { locale, setLocale, t } = useI18n();

  return (
    <header className="relative z-30 flex items-center justify-between px-10 pt-7 pb-3">
      <div className="flex items-center gap-3">
        <NeuroTrailLogo className="h-9 w-9 opacity-85" />
        <h1 className="nt-wordmark text-[19px] leading-none text-nt-bright/95">
          NeuroTrail
        </h1>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-nt-dim">
          <span>{t("language.label")}</span>
          <select
            aria-label={t("language.label")}
            value={locale}
            onChange={(event) => setLocale(event.currentTarget.value as typeof locale)}
            className="max-w-[118px] rounded-sm border border-nt-bright/[0.12] bg-black/30 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-nt-mid outline-none transition-colors hover:text-nt-bright focus:border-nt-bright/35"
          >
            {SUPPORTED_LOCALES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nativeName}
              </option>
            ))}
          </select>
        </label>

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
      </div>
    </header>
  );
}

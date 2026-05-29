import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useI18n } from "../i18nContext";

type MonitorState = "idle" | "pending" | "running" | "complete";

type Props = {
  monitorState: MonitorState;
  graphName: string;
  isLocalGraph: boolean;
  isLiveGraph: boolean;
  fileCount: number;
  onFolderSelected: (files: File[]) => void;
  onWatchAgent: () => void;
  onConfirmLoad: () => void;
  onReplay: () => void;
};

// Floating actions only; the selected folder is read through path metadata.
export function GraphControls({
  monitorState,
  graphName,
  isLocalGraph,
  isLiveGraph,
  fileCount,
  onFolderSelected,
  onWatchAgent,
  onConfirmLoad,
  onReplay,
}: Props) {
  const { t, formatNumber } = useI18n();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const show =
    monitorState === "idle" ||
    monitorState === "pending" ||
    monitorState === "complete";

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          if (files.length > 0) onFolderSelected(files);
          event.currentTarget.value = "";
        }}
        {...{ webkitdirectory: "", directory: "" }}
      />

      <AnimatePresence mode="wait">
        {show && (
          <motion.div
            key={`${monitorState}-${isLocalGraph || isLiveGraph ? graphName : "demo"}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="pointer-events-auto absolute left-1/2 bottom-8 -translate-x-1/2 z-20 text-center"
          >
            {monitorState === "idle" && (
              <div className="flex items-center justify-center gap-5">
                <button
                  type="button"
                  onClick={onWatchAgent}
                  className="nt-cta inline-block text-[10.5px] uppercase text-nt-bright hover:text-white transition-colors py-1"
                >
                  {t("graphControls.watchAgent")}
                </button>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="nt-cta inline-block text-[10.5px] uppercase text-nt-mid hover:text-nt-bright transition-colors py-1"
                >
                  {t("graphControls.chooseFolder")}
                </button>
              </div>
            )}

            {monitorState === "pending" && (
              <div className="flex flex-col items-center gap-5">
                <p
                  className="text-[13px] text-nt-mid max-w-[360px] leading-[1.55]"
                  style={{ letterSpacing: "-0.01em" }}
                >
                  {isLocalGraph
                    ? t("graphControls.filesMapped", {
                        name: graphName,
                        count: formatNumber(fileCount),
                      })
                    : isLiveGraph
                      ? t("graphControls.liveConnected", { name: graphName })
                    : t("graphControls.ready")}
                </p>
                <button
                  type="button"
                  onClick={onConfirmLoad}
                  className="nt-cta inline-block text-[10.5px] uppercase text-nt-bright hover:text-white transition-colors py-1"
                >
                  {isLocalGraph
                    ? t("graphControls.beginScan")
                    : isLiveGraph
                      ? t("graphControls.watchLive")
                      : t("graphControls.begin")}
                </button>
              </div>
            )}

            {monitorState === "complete" && (
              <div className="flex items-center justify-center gap-5">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="nt-cta inline-block text-[10.5px] uppercase text-nt-mid hover:text-nt-bright transition-colors py-1"
                >
                  {t("graphControls.chooseFolder")}
                </button>
                <button
                  type="button"
                  onClick={onWatchAgent}
                  className="nt-cta inline-block text-[10.5px] uppercase text-nt-mid hover:text-nt-bright transition-colors py-1"
                >
                  {t("graphControls.watchAgent")}
                </button>
                <button
                  type="button"
                  onClick={onReplay}
                  className="nt-cta inline-block text-[10.5px] uppercase text-nt-mid hover:text-nt-bright transition-colors py-1"
                >
                  {t("graphControls.replay")}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

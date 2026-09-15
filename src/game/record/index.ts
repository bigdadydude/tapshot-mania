/**
 * Isolated hand-play recorder. Default OFF.
 *
 * Engine: `if (recorder.enabled())` then tick / noteTap / noteEvent.
 * When off, those calls are never made — no sample buffers, no download.
 * Session-only; JSON is written only when the player exports (stop / game over).
 */
export {
  createPlayRecorder,
  playRecordingFilename,
  playPackFilename,
  defaultDownloadPlayJson,
} from "./recorder";
export type { PlayRecorder, PlayRecorderOpts } from "./recorder";
export type {
  PlayRecording,
  PlayRecordingPack,
  PlaySample,
  PlayTap,
  PlayEvent,
  PlayEventKind,
  PlayTapSource,
  PlayFrameInput,
  PlayEndReason,
  PlayAntiOrb,
  PlayHoleState,
} from "./types";

// Who each side's announcer is on screen: the caller shown in the call window (CommsCall.tsx)
// while they speak (docs/VOICE_PROMPTS_FACTIONS.md). `portrait` is the image (or looping video)
// shown in the frame, relative to public/: drop a file in public/ and set its path here, e.g.
// 'portraits/kami-os.webp'. Left null, the frame shows a placeholder feed.
import type { Voice } from './announcer';

export interface AnnouncerProfile { name: string; role: string; portrait: string | null }
export const ANNOUNCER_PROFILES: Record<Voice, AnnouncerProfile> = {
  vanta: { name: 'KAMI-OS', role: 'Tactical arbiter', portrait: null },
  tokugen: { name: 'TAC-NET', role: 'Overwatch', portrait: null },
};

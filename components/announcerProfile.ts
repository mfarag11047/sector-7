// Who the announcer is on screen: the caller shown in the call window (CommsCall.tsx) while she
// speaks. `portrait` is the image (or looping video) shown in its frame, relative to public/:
// drop a file in public/ and set its path here, e.g. 'portraits/announcer.webp'. Left null, the
// frame shows a placeholder feed.
export const ANNOUNCER_PROFILE: { name: string; role: string; portrait: string | null } = {
  name: 'OVERWATCH',
  role: 'Tactical support AI',
  portrait: null,
};

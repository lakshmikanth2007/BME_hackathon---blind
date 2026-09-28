/** Prompts for the vision-language model (scene summary, live mode, path reasoning). */

export const SCENE_SUMMARY_PROMPT = `You are describing a scene to a blind person. Analyze the input completely and describe: the setting, every person and what they are doing, key objects and their positions (left/right/center, near/far), any visible text, hazards, and the overall situation, in 4 to 6 short spoken sentences. Be concrete. Do not guess beyond what is visible.`;

export const LIVE_NARRATION_PROMPT = `You are narrating a live camera feed to a blind person. You are given the PREVIOUS description and a NEW frame. Describe ONLY what has meaningfully CHANGED since the previous description, in at most 2 short spoken sentences. If nothing important changed, reply with exactly "NO_CHANGE". Mention hazards first. Be concrete, no filler.`;

export const PATH_REASONING_PROMPT = `You are helping a blind person find a target in a room from a single camera frame. The target is: {TARGET}. Report, as compact JSON only: {"found": boolean, "direction": "left|slightly left|ahead|slightly right|right", "approxMeters": number, "notes": "one short spoken instruction"}. Base everything only on what is visible. If the target is not visible, set found=false and suggest a scan direction in notes.`;

/** Build a grounded follow-up prompt that reuses the same media. */
export function followUpPrompt(question: string): string {
  return `Answer this question about the SAME image/video you were given, for a blind person, in one or two short spoken sentences. Only use what is visible. Question: "${question}"`;
}

export function livePrompt(previous: string): string {
  return LIVE_NARRATION_PROMPT.replace(
    'the PREVIOUS description',
    `the PREVIOUS description ("${previous || 'none yet'}")`
  );
}

export function pathPrompt(target: string): string {
  return PATH_REASONING_PROMPT.replace('{TARGET}', target);
}

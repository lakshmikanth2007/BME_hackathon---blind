/** The command vocabulary. Intent names + their trigger phrases (synonyms,
 * Hinglish/Tanglish variants). Fuzzy matching in intentRouter handles the rest. */

export type IntentName =
  | 'reader.start'
  | 'obstacle.start'
  | 'obstacle.stop'
  | 'obstacle.oneshot'
  | 'navigation.start'
  | 'summary.photo'
  | 'summary.video'
  | 'live.start'
  | 'live.stop'
  | 'control.pause'
  | 'control.resume'
  | 'control.repeat'
  | 'control.repeatParagraph'
  | 'control.skip'
  | 'control.back'
  | 'control.stop'
  | 'control.cancel'
  | 'control.faster'
  | 'control.slower'
  | 'control.louder'
  | 'control.softer'
  | 'lang.english'
  | 'lang.hindi'
  | 'lang.tamil'
  | 'meta.help'
  | 'meta.where';

export interface IntentSpec {
  name: IntentName;
  /** Free-form target extracted from the phrase, e.g. "door" in "take me to the door". */
  target?: string;
}

export interface IntentDef {
  name: IntentName;
  phrases: string[];
}

/**
 * Phrases are matched loosely: token overlap + edit distance, so "read dis",
 * "padi" (Tamil "read"), "aage kya hai" (Hindi "what's ahead") still land.
 */
export const INTENTS: IntentDef[] = [
  {
    name: 'reader.start',
    phrases: [
      'read this',
      'read document',
      'read the page',
      'read it',
      'padi', // ta: read
      'padikka', // ta: to read
      'padho', // hi: read
      'read karo',
    ],
  },
  {
    name: 'obstacle.oneshot',
    phrases: [
      "what's in front of me",
      'what is in front of me',
      "what's ahead",
      'anything ahead',
      'aage kya hai', // hi
      'munnadi enna', // ta
    ],
  },
  {
    name: 'obstacle.start',
    phrases: [
      'any obstacle',
      'start obstacle detection',
      'obstacle mode',
      'detect obstacles',
      'obstacle detection on',
      'guard me',
    ],
  },
  {
    name: 'obstacle.stop',
    phrases: ['stop obstacle detection', 'stop obstacles', 'obstacle off'],
  },
  {
    name: 'navigation.start',
    phrases: [
      'find the way out',
      'take me to the door',
      'take me to the exit',
      'take me to the stairs',
      'take me to the lift',
      'find the exit',
      'find the door',
      'way out',
      'guide me to',
      'bahar jaane ka rasta', // hi
      'vெளியே pogum vazhi', // ta (mixed)
    ],
  },
  {
    name: 'summary.photo',
    phrases: [
      'describe this',
      'take a picture',
      'what do you see',
      'describe the scene',
      'photo describe',
      'yeh kya hai', // hi
      'idhu enna', // ta
    ],
  },
  {
    name: 'summary.video',
    phrases: ['record a video', 'record video', 'take a video', 'video describe'],
  },
  { name: 'live.start', phrases: ['start live', 'live mode', 'begin live', 'go live'] },
  { name: 'live.stop', phrases: ['stop live', 'end live', 'live off'] },

  { name: 'control.pause', phrases: ['pause', 'wait', 'ruko', 'niruthu'] },
  {
    name: 'control.resume',
    phrases: ['resume', 'continue', 'carry on', 'aage badho', 'thodaru'],
  },
  { name: 'control.repeatParagraph', phrases: ['repeat paragraph', 'read paragraph again'] },
  {
    name: 'control.repeat',
    phrases: ['repeat', 'say again', 'again', 'phir se', 'marubadiyum'],
  },
  { name: 'control.skip', phrases: ['skip', 'next', 'next sentence', 'aage'] },
  { name: 'control.back', phrases: ['go back', 'previous', 'back', 'pichla'] },
  { name: 'control.stop', phrases: ['stop', 'stop reading', 'be quiet', 'chup'] },
  { name: 'control.cancel', phrases: ['cancel', 'never mind', 'forget it'] },
  { name: 'control.faster', phrases: ['faster', 'speed up', 'jaldi'] },
  { name: 'control.slower', phrases: ['slower', 'slow down', 'dheere'] },
  { name: 'control.louder', phrases: ['louder', 'volume up', 'zor se'] },
  { name: 'control.softer', phrases: ['softer', 'quieter', 'volume down'] },

  { name: 'lang.english', phrases: ['speak english', 'english', 'switch to english'] },
  { name: 'lang.hindi', phrases: ['speak hindi', 'hindi', 'switch to hindi'] },
  { name: 'lang.tamil', phrases: ['speak tamil', 'tamil', 'switch to tamil'] },

  {
    name: 'meta.help',
    phrases: ['help', 'what can you do', 'list commands', 'commands'],
  },
  {
    name: 'meta.where',
    phrases: ['where am i in the app', 'where am i', 'what mode', 'what is running'],
  },
];

/** Phrases that carry a navigation target after "to". */
export const NAV_TARGETS = ['door', 'exit', 'stairs', 'lift', 'elevator', 'out'];

export type LearningNotes = {
  question: string;
  prediction: string;
  reflection: string;
  noticed?: string;
  evidence?: string;
  unknowns?: string;
};
export const defaultNotes: LearningNotes = {
  question: "sunlight",
  prediction: "",
  reflection: "",
  noticed: "",
  evidence: "",
  unknowns: "",
};
/** Additive migration: never discard the original free-form reflection. */
export function normalizeLearningNotes(notes: LearningNotes): LearningNotes {
  return {
    ...notes,
    noticed: notes.noticed ?? notes.reflection,
    evidence: notes.evidence ?? "",
    unknowns: notes.unknowns ?? "",
  };
}
export function notebookText(notes: LearningNotes) {
  const n = normalizeLearningNotes(notes);
  return [
    ["I noticed", n.noticed],
    ["My evidence is", n.evidence],
    ["We still don’t know", n.unknowns],
  ]
    .filter(([, value]) => !!value?.trim())
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");
}

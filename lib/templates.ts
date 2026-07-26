/* Blank document templates for new projects — mirrors the legacy app's
   blankBusinessCase / blankProject so new projects start with the same shape. */

export function blankBusinessCase() {
  return {
    purpose: "",
    problem: "",
    perspOurs: "",
    perspUsers: "",
    perspStakeholders: "",
    worsening: "",
    opportunities: "",
    outcomes: [] as string[],
    effProcess: "",
    effSystem: "",
    effBehaviour: "",
    effLeadership: "",
    financial: [
      { label: "Programme cost (one-off)", value: "", note: "" },
      { label: "Annual run cost", value: "", note: "" },
      { label: "Annual saving", value: "", note: "" },
      { label: "Payback period", value: "", note: "" },
    ],
    justification: "",
    effective: "",
  };
}

export function blankScope() {
  return { inScope: [] as string[], outScope: [] as string[] };
}

export function blankChangePlan() {
  return { groups: [] as unknown[] };
}

export function defaultOrgChart() {
  return [
    {
      id: "o_owner",
      name: "Project Owner",
      role: "Project Owner",
      parent: null,
      note: "Single point of accountability",
      accent: "indigo",
    },
  ];
}

/** JSONB document columns for a brand-new blank project. */
export function blankProjectDocs() {
  return {
    businessCase: blankBusinessCase(),
    scope: blankScope(),
    assessment: [] as unknown[],
    commPlan: [] as unknown[],
    changePlan: blankChangePlan(),
    orgChart: defaultOrgChart(),
    glossary: [] as unknown[],
    kpis: [] as unknown[],
  };
}

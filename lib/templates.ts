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

/** Reporting lines keyed by stakeholder id. Empty by default: the org chart
 *  is a view of the stakeholder list, so seeding a person here would invent
 *  someone who does not exist on the Stakeholders page. */
export function defaultOrgChart(): Record<string, string | null> {
  return {};
}

export function blankFinancials() {
  return {
    currency: "€",
    weighting: "duration" as "duration" | "size",
    contract: { title: "", party: "", value: 0, signed: "", start: "", end: "", note: "" },
    budget: [] as { id: string; label: string; amount: number; note: string }[],
  };
}

export function blankStartup() {
  return {
    mission: { mission: "", vision: "", values: [] as string[] },
    valueProp: {
      headline: "",
      segments: [] as {
        id: string;
        segment: string;
        jobs: string[];
        pains: string[];
        gains: string[];
      }[],
    },
    bmc: {} as Record<string, unknown>,
    lean: {} as Record<string, unknown>,
    personas: [] as {
      id: string;
      name: string;
      role: string;
      segment: string;
      goals: string[];
      pains: string[];
      note: string;
    }[],
    market: {
      tam: "",
      sam: "",
      som: "",
      positioning: "",
      competitors: [] as { id: string; name: string; note: string }[],
    },
    gtm: {
      motion: "",
      channels: [] as string[],
      launch: [] as string[],
    },
    features: {
      groups: [] as {
        id: string;
        label: string;
        items: { id: string; name: string; desc: string; how: string; what: string; audience?: string; outcomes?: string[] }[];
      }[],
      packages: [] as {
        id: string;
        name: string;
        tagline: string;
        featureIds: string[];
      }[],
    },
  };
}

export function blankSettings() {
  return {
    nudges: { autoStart: false, leadStart: 2, leadDue: 3 },
    enabledSections: [
      "comms",
      "change",
      "scope",
      "business",
      "financials",
      "preanalysis",
      "catalogue",
      "org",
      "capacity",
    ] as string[],
    navFavs: [] as string[],
  };
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
    financials: blankFinancials(),
    forecast: { bufferPct: 20, weighting: "duration" as "duration" | "size" },
    startup: blankStartup(),
    settings: blankSettings(),
  };
}

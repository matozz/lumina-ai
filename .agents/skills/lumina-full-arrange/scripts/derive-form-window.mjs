#!/usr/bin/env node

const SECTION_ORDER = ["buildup_1", "drop_1", "breakdown", "buildup_2", "drop_2"];

export const FORM_PROFILES = {
  house: profile(8, {
    buildup_1: role([16, 8, 32], 16, 4),
    drop_1: role([16, 32], 16, 8),
    breakdown: role([16, 8, 32], 16, 8),
    buildup_2: role([8, 16, 32], 8, 4),
    drop_2: role([16, 32], 16, 8),
  }),
  "tech-house": profile(8, {
    buildup_1: role([8, 16], 8, 4),
    drop_1: role([16, 32], 16, 8),
    breakdown: role([8, 16], 8, 8),
    buildup_2: role([8, 16], 8, 4),
    drop_2: role([16, 32], 16, 8),
  }),
  "progressive-house": profile(8, {
    buildup_1: role([16, 32], 16, 4),
    drop_1: role([32, 16], 32, 8),
    breakdown: role([16, 32], 16, 8),
    buildup_2: role([16, 32], 16, 4),
    drop_2: role([32, 16], 32, 8),
  }),
  "big-room-house": profile(8, {
    buildup_1: role([16, 8], 16, 4),
    drop_1: role([16, 32], 16, 8),
    breakdown: role([8, 16], 8, 8),
    buildup_2: role([8, 16], 8, 4),
    drop_2: role([16, 32], 16, 8),
  }),
  "future-house": profile(8, {
    buildup_1: role([8, 16], 8, 4),
    drop_1: role([16, 32], 16, 8),
    breakdown: role([8, 16], 8, 8),
    buildup_2: role([8, 16], 8, 4),
    drop_2: role([16, 32], 16, 8),
  }),
  trance: profile(16, {
    buildup_1: role([32, 16], 32, 8),
    drop_1: role([32, 16], 32, 16),
    breakdown: role([32, 16], 32, 16),
    buildup_2: role([16, 32], 16, 8),
    drop_2: role([32, 16], 32, 16),
  }),
  techno: profile(8, {
    buildup_1: role([16, 8, 32], 16, 4),
    drop_1: role([32, 16], 32, 8),
    breakdown: role([16, 8, 32], 16, 8),
    buildup_2: role([8, 16], 8, 4),
    drop_2: role([32, 16], 32, 8),
  }),
  dubstep: profile(8, {
    buildup_1: role([16, 8], 16, 4),
    drop_1: role([16, 32], 16, 8),
    breakdown: role([8, 16], 8, 8),
    buildup_2: role([8, 16], 8, 4),
    drop_2: role([16, 32], 16, 8),
  }),
  "drum-and-bass": profile(8, {
    buildup_1: role([16, 8], 16, 4),
    drop_1: role([16, 32], 16, 8),
    breakdown: role([8, 16], 8, 8),
    buildup_2: role([8, 16], 8, 4),
    drop_2: role([16, 32], 16, 8),
  }),
};

export function deriveFormWindow({
  profile: profileName = "house",
  fromSection = "buildup_1",
  throughSection = "drop_2",
  startBar = 1,
  endBar,
  ppq = 960,
  numerator = 4,
  denominator = 4,
} = {}) {
  const selected = FORM_PROFILES[profileName];
  if (!selected) {
    throw new Error(
      `Unknown form profile ${JSON.stringify(profileName)}. Choose: ${Object.keys(FORM_PROFILES).join(", ")}.`,
    );
  }
  const sectionOrder = selectSectionOrder(fromSection, throughSection);
  positiveInteger(startBar, "startBar");
  positiveInteger(ppq, "ppq");
  positiveInteger(numerator, "numerator");
  positiveInteger(denominator, "denominator");
  if (endBar !== undefined) {
    positiveInteger(endBar, "endBar");
    if (endBar < startBar) throw new Error("endBar must not precede startBar.");
  }

  const targetBars = endBar === undefined ? undefined : endBar - startBar + 1;
  const lengths =
    targetBars === undefined
      ? preferredLengths(selected, sectionOrder)
      : fitLengths(selected, targetBars, sectionOrder);
  const ticksPerBar = (ppq * numerator * 4) / denominator;
  if (!Number.isInteger(ticksPerBar)) {
    throw new Error("The supplied PPQ and time signature do not produce an integer bar length.");
  }

  let cursor = startBar;
  const sections = sectionOrder.map((id, index) => {
    const lengthBars = lengths[index];
    const start = cursor;
    const end = start + lengthBars - 1;
    cursor = end + 1;
    return {
      id,
      start_bar: start,
      end_bar: end,
      length_bars: lengthBars,
      pattern_cycle_bars: Math.min(selected.roles[id].patternCycleBars, lengthBars),
      start_tick: (start - 1) * ticksPerBar,
      end_tick_exclusive: end * ticksPerBar,
    };
  });

  const derivedEndBar = sections[sections.length - 1].end_bar;
  return {
    profile: profileName,
    from_section: fromSection,
    through_section: throughSection,
    basis: endBar === undefined ? "profile_default" : "exact_user_window_fit",
    phrase_quantum_bars: selected.phraseQuantumBars,
    start_bar: startBar,
    end_bar: derivedEndBar,
    total_bars: derivedEndBar - startBar + 1,
    ppq,
    time_signature: { numerator, denominator },
    ticks_per_bar: ticksPerBar,
    sections,
    checks: {
      contiguous: sections.every(
        (section, index) => index === 0 || section.start_bar === sections[index - 1].end_bar + 1,
      ),
      exact_requested_window: endBar === undefined ? null : derivedEndBar === endBar,
      pattern_cycles_divide_sections: sections.every(
        (section) => section.length_bars % section.pattern_cycle_bars === 0,
      ),
    },
  };
}

function profile(phraseQuantumBars, roles) {
  return { phraseQuantumBars, roles };
}

function role(candidates, preferred, patternCycleBars) {
  return { candidates: [...new Set(candidates)], preferred, patternCycleBars };
}

function selectSectionOrder(fromSection, throughSection) {
  const startIndex = SECTION_ORDER.indexOf(fromSection);
  const endIndex = SECTION_ORDER.indexOf(throughSection);
  if (startIndex === -1 || endIndex === -1) {
    throw new Error(`Sections must be one of: ${SECTION_ORDER.join(", ")}.`);
  }
  if (endIndex < startIndex) throw new Error("throughSection must not precede fromSection.");
  return SECTION_ORDER.slice(startIndex, endIndex + 1);
}

function preferredLengths(selected, sectionOrder) {
  return sectionOrder.map((id) => selected.roles[id].preferred);
}

function fitLengths(selected, targetBars, sectionOrder) {
  let best;
  const visit = (index, values, total, score) => {
    if (index === sectionOrder.length) {
      if (total !== targetBars) return;
      if (!best || score < best.score) best = { values: [...values], score };
      return;
    }
    const roleDefinition = selected.roles[sectionOrder[index]];
    for (const candidate of roleDefinition.candidates) {
      if (total + candidate > targetBars) continue;
      const distance = Math.abs(Math.log2(candidate / roleDefinition.preferred));
      visit(index + 1, [...values, candidate], total + candidate, score + distance);
    }
  };
  visit(0, [], 0, 0);
  if (best) return best.values;

  const totals = new Set();
  const collect = (index, total) => {
    if (index === sectionOrder.length) {
      totals.add(total);
      return;
    }
    for (const candidate of selected.roles[sectionOrder[index]].candidates) {
      collect(index + 1, total + candidate);
    }
  };
  collect(0, 0);
  throw new Error(
    `No phrase-aligned form fits ${targetBars} bars. Supported totals for this profile: ${[...totals].sort((a, b) => a - b).join(", ")}. Ask the user which section may be asymmetric.`,
  );
}

function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`${name} must be a positive integer.`);
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument ${token}.`);
    const key = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${token}.`);
    values[key] = ["profile", "fromSection", "throughSection"].includes(key)
      ? value
      : Number(value);
    index += 1;
  }
  return values;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = deriveFormWindow(parseArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

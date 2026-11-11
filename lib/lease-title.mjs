// A readable title for a lease from the state's GeneralLocation text (the layer has no lessee field).
// Rule: split the text into phrases (commas that aren't inside numbers, semicolons); drop phrases that are only a legal
// description or a measurement (Section 16, T5N R27E, SW1/4, 57.54 acres, parcel 1); strip leading filler ("approximately
// 3.4 miles along", "State-owned school land within a portion of", "the dry lake bed of" stays: it says where);
// take the first phrase left, capitalized. If nothing is left: the waterbody, else "State land, <county> County".
const LEGAL = /^(?:(?:the|a|an|and|of|in|within|portions?|parts?|all|lots?|parcels?(?:\s*\d+)?|sec(?:tion|\.)?s?\s*[\d,\sand&]+|t\.?\s*\d+\s*[ns]\.?|r\.?\s*\d+\s*[ew]\.?|[nsew]{1,2}\s*1\/[24]|[nsew]{1,2}\/[24]|1\/[24]|[nsew]{1,2}|[msh]\.?d\.?[mb]\.?|sbm|mdm|hbm|more or less|approximately|about|[\d.,]+\s*(?:acres?|ac\.?|miles?|mi\.?|linear feet|feet|ft\.?|foot)|[\d.,]+|\(?parcel\s*[\w\d]+\)?|tract\s*\d+|and|&|of the|on|at|one|two|three|four|five|six|seven|eight|nine|ten|\d+|discontiguous|each|parcels?)[\s,.;()-]*)+$/i;
const FILLER = [
  /^\(\d+\)\s*/,
  /^of\s+/i,
  /^(?:s\.?b\.?b\.?m\.?|s\.?b\.?m\.?|m\.?d\.?m\.?|h\.?b\.?m\.?|t\.?\s*\d+\s*[ns]\.?\s*,?\s*r\.?\s*\d+\s*[ew]\.?|township\s+\d+\s+(?:north|south)|range\s+\d+\s+(?:east|west))\b[\s,]*/i,
  /^(?:approximately|about)\s+[\d.,]+\s*(?:acres?|miles?|linear feet|feet|ft\.?)(?:,?\s*more or less,?)?\s*(?:of|along|in|on|within|across|at)?\b\s*/i,
  /^[\d.,]+\s*(?:ft\.?|feet)\s*by\s*[\d.,]+\s*(?:ft\.?|feet)\s*(?:strip\s*)?(?:of|along|in|on|within|across|at)?\b\s*/i,
  /^(?:(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+)?(?:(?:discontiguous\s+)?parcels?\s+of\s+)?(?:(?:state[- ]owned|fee[- ]owned|state|sovereign|school|indemnity|lieu|reserved|mineral|interest|100\s*percent|one-sixteenth|\(1\/16th\)|filled|unfilled|granted|tidelands|tide|submerged|lands?|located|situated|and|lying)\b[\s,-]*)+(?:(?:with)?in|on|at|of|along|under)?\b\s*(?:a\s+|the\s+)?(?:portions?\s+of\s+)?/i,
  /^(?:(?:\d+|two|three)\s+)?(?:parcels?\s+of\s+)?land\s+known\s+as\s+/i,
];
const splitPhrases = (s) => s.split(/;|,(?!\d{3}\b)/).map((x) => x.trim()).filter(Boolean);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export function leaseTitle(location, { waterbody = null, county = null, prc = "" } = {}) {
  const text = (location ?? "").replace(/\s+/g, " ").trim();
  for (const raw of splitPhrases(text)) {
    let p = raw;
    for (let i = 0; i < 3; i++) for (const re of FILLER) p = p.replace(re, "");
    p = p.replace(/^(?:(?:in|within|on)\s+)?(?:the\s+)(?=[A-Z])/i, "").replace(/^(?:in|within|on)\s+(?=[A-Z])/, "").replace(/^[\s,.;:()-]+|[\s,;:(-]+$/g, "").trim();
    if (!p || LEGAL.test(p) || p.length < 3 || !/[a-z]{3}/i.test(p)) continue;
    if (/^(?:\d+\s*)?(?:acres?|miles?)\b/i.test(p)) continue;
    if (/^\(?(?:state\s+)?parcel\s+number|^\d+\/\d+th\)|^with minerals|^[A-Z][a-z]+ County$/i.test(p)) continue;
    // A phrase cut inside parentheses: drop the stray one.
    if ((p.match(/\(/g) ?? []).length !== (p.match(/\)/g) ?? []).length) p = p.replace(/[()]/g, "").trim();
    return cap(p);
  }
  if (waterbody) return waterbody;
  if (county) return `State land, ${county} County`;
  return text ? cap(splitPhrases(text)[0] ?? text) : `PRC ${prc}`;
}

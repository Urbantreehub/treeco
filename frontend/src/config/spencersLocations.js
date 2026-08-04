// Spencer Henshaw (DBS / Kāinga Ora) property-element LOCATION codes.
// Scraped verbatim from the portal 'location_id' dropdown (104 codes,
// identical across all jobs) on 2026-08-04. PE = Property Exterior — the
// exterior/tree elements UTS quotes against. Each option carries the portal's
// numeric value id so a future portal write-back can post the right location.
// Regenerate with scripts/probe_location_options.py if the portal list changes.

export const SPENCERS_LOCATION_GROUPS = [
  {
    prefix: "PE",
    label: "Property Exterior",
    options: [{ code: "PE1", value: "1174" }, { code: "PE2", value: "1723" }, { code: "PE3", value: "1724" }, { code: "PE4", value: "1725" }],
  },
  {
    prefix: "AN",
    label: "AN",
    options: [{ code: "AN", value: "77" }, { code: "AN2", value: "6297" }, { code: "AN3", value: "6298" }],
  },
  {
    prefix: "B",
    label: "B",
    options: [{ code: "B1", value: "86" }, { code: "B2", value: "87" }, { code: "B3", value: "88" }, { code: "B4", value: "89" }, { code: "B5", value: "90" }, { code: "B6", value: "91" }, { code: "B7", value: "92" }, { code: "B8", value: "93" }, { code: "B9", value: "94" }, { code: "B10", value: "95" }, { code: "B11", value: "96" }, { code: "B12", value: "97" }, { code: "B13", value: "98" }, { code: "B14", value: "99" }, { code: "B15", value: "100" }, { code: "B16", value: "101" }, { code: "B17", value: "102" }, { code: "B18", value: "103" }, { code: "B19", value: "104" }, { code: "B20", value: "105" }, { code: "B21", value: "1141" }, { code: "B22", value: "5654" }, { code: "B23", value: "5655" }, { code: "B24", value: "5656" }, { code: "B25", value: "5657" }, { code: "B26", value: "5658" }, { code: "B27", value: "5659" }, { code: "B28", value: "5660" }, { code: "B29", value: "5661" }, { code: "B30", value: "5662" }, { code: "B31", value: "5663" }, { code: "B32", value: "5664" }, { code: "B33", value: "5665" }, { code: "B34", value: "5666" }, { code: "B35", value: "5667" }, { code: "B36", value: "5668" }, { code: "B37", value: "5669" }, { code: "B38", value: "5670" }, { code: "B39", value: "5671" }, { code: "B40", value: "5672" }],
  },
  {
    prefix: "BA",
    label: "BA",
    options: [{ code: "BA1", value: "106" }, { code: "BA2", value: "107" }, { code: "BA3", value: "108" }, { code: "BA4", value: "109" }, { code: "BA5", value: "1142" }, { code: "BA6", value: "1143" }],
  },
  {
    prefix: "BE",
    label: "BE",
    options: [{ code: "BE1", value: "1144" }, { code: "BE2", value: "1730" }, { code: "BE3", value: "1731" }, { code: "BE4", value: "1732" }],
  },
  {
    prefix: "CA",
    label: "CA",
    options: [{ code: "CA1", value: "1145" }],
  },
  {
    prefix: "DR",
    label: "DR",
    options: [{ code: "DR1", value: "1146" }, { code: "DR2", value: "1147" }, { code: "DR3", value: "1148" }, { code: "DR4", value: "1149" }, { code: "DR5", value: "1150" }],
  },
  {
    prefix: "EH",
    label: "EH",
    options: [{ code: "EH1", value: "1151" }, { code: "EH2", value: "1152" }, { code: "EH3", value: "1153" }, { code: "EH4", value: "1154" }, { code: "EH5", value: "1155" }, { code: "EH6", value: "1156" }],
  },
  {
    prefix: "KI",
    label: "KI",
    options: [{ code: "KI1", value: "1157" }, { code: "KI2", value: "1158" }, { code: "KI3", value: "1159" }, { code: "KI4", value: "1160" }, { code: "KI5", value: "1161" }],
  },
  {
    prefix: "LA",
    label: "LA",
    options: [{ code: "LA1", value: "1162" }, { code: "LA2", value: "1163" }, { code: "LA3", value: "1164" }, { code: "LA4", value: "1165" }, { code: "LA5", value: "1166" }, { code: "LA6", value: "1167" }],
  },
  {
    prefix: "LI",
    label: "LI",
    options: [{ code: "LI1", value: "1168" }, { code: "LI2", value: "1169" }, { code: "LI3", value: "1170" }, { code: "LI4", value: "1171" }, { code: "LI5", value: "1172" }, { code: "LI6", value: "1173" }],
  },
  {
    prefix: "ST",
    label: "ST",
    options: [{ code: "ST1", value: "1175" }, { code: "ST2", value: "1176" }, { code: "ST3", value: "1177" }],
  },
  {
    prefix: "UN",
    label: "UN",
    options: [{ code: "UN", value: "76" }],
  },
  {
    prefix: "VL",
    label: "VL",
    options: [{ code: "VL1", value: "1179" }, { code: "VL2", value: "5761" }],
  },
  {
    prefix: "W",
    label: "W",
    options: [{ code: "W1", value: "118" }, { code: "W2", value: "119" }, { code: "W3", value: "120" }, { code: "W4", value: "121" }, { code: "W5", value: "1178" }],
  },
  {
    prefix: "RF",
    label: "RF",
    options: [{ code: "RF1", value: "1726" }, { code: "RF2", value: "1727" }, { code: "RF3", value: "1728" }, { code: "RF4", value: "1729" }, { code: "RF5", value: "3391" }, { code: "RF6", value: "3392" }, { code: "RF7", value: "3393" }],
  },
]

// Flat list of all codes in portal order (PE group first).
export const SPENCERS_LOCATIONS = SPENCERS_LOCATION_GROUPS.flatMap(g => g.options)

// code -> portal value id (for portal write-back).
export const SPENCERS_LOCATION_VALUE = Object.fromEntries(
  SPENCERS_LOCATIONS.map(o => [o.code, o.value])
)


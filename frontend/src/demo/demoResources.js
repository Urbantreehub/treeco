// Demo rows for the scheduler tables: resources, availability, crew_assignments,
// plus the real roster (from StaffHub) as crew users. Owned by the scheduler work.
//
// Dates are computed against the current week (Mon–Fri) so the demo always has
// a live-looking board no matter when it is opened.

// Monday of the week the board opens on. On a weekend that is the coming
// Monday (the calendar hides weekends and jumps forward), matching demoSchedule.
function weekMondayYMD(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()
  if (day === 6) d.setDate(d.getDate() + 2)
  else if (day === 0) d.setDate(d.getDate() + 1)
  else d.setDate(d.getDate() + 1 - day)
  d.setHours(0, 0, 0, 0)
  return d
}
function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function weekDay(offset) {
  const d = weekMondayYMD()
  d.setDate(d.getDate() + offset)
  return ymd(d)
}

// The scheduler's rows and chips. kind 'person' and 'truck' become rows;
// 'equipment' rides on a truck (Navara) as a chip dropped per day.
export const DEMO_RESOURCES = [
  { id: 'josh',    name: 'Josh',    kind: 'person',    color: '#4A6741', sort: 0, active: true, note: 'quote visits' },
  { id: 'isuzu',   name: 'Isuzu',   kind: 'truck',     color: '#4A7FA5', sort: 1, active: true, note: 'small truck' },
  { id: 'nissan',  name: 'Nissan',  kind: 'truck',     color: '#6D4AA8', sort: 2, active: true, note: 'big truck' },
  { id: 'navara',  name: 'Navara',  kind: 'truck',     color: '#8B6238', sort: 3, active: true, note: 'ute — carries the Avant or the grinder' },
  { id: 'avant',   name: 'Avant',   kind: 'equipment', color: '#8B6238', sort: 4, active: true, note: null },
  { id: 'grinder', name: 'Grinder', kind: 'equipment', color: '#8B6238', sort: 5, active: true, note: null },
]

// The real roster (StaffHub.jsx). `resource_id` is each person's default truck
// (users.resource_id in the live schema); null = office, never on a truck by
// default. The demo `users` table only carries josh and ashley, so the crew
// hooks merge this list in when a user id has no row of its own.
export const DEMO_CREW_USERS = [
  { id: 'demo-josh',   name: 'Josh Micallef', short: 'Josh',    role: 'Director / Climber',                   resource_id: 'josh',   access_level: 'full',       active: true },
  { id: 'demo-lea',    name: 'Lea Molloy',    short: 'Lea',     role: 'Climber',                              resource_id: 'nissan', access_level: 'restricted', active: true },
  { id: 'demo-stu',    name: 'Stuart Wilson', short: 'Stu',     role: 'Crew leader / Climber / Truck driver', resource_id: 'nissan', access_level: 'restricted', active: true },
  { id: 'demo-joshcm', name: 'Joshua Curran Mongan', short: 'Josh CM', role: 'Groundsman',                    resource_id: 'isuzu',  access_level: 'restricted', active: true },
  { id: 'demo-sen',    name: 'Sen Aupouri',   short: 'Sen',     role: 'Arborist',                             resource_id: 'isuzu',  access_level: 'restricted', active: true },
  { id: 'demo-ashley', name: 'Ashley Rapana', short: 'Ashley',  role: 'Office',                               resource_id: null,     access_level: 'office',     active: true },
]

// Sen is on annual leave Mon–Wed of the current week.
export const DEMO_AVAILABILITY = [0, 1, 2].map(i => ({
  id: `demo-av-${i}`, user_id: 'demo-sen', date: weekDay(i), kind: 'leave', note: 'Annual leave',
}))

// Who is on which truck this week, beyond the defaults: Lea helps the Isuzu
// while Sen is away, and Josh joins the Nissan on Friday.
export const DEMO_CREW_ASSIGNMENTS = [
  { id: 'demo-ca-1', resource_id: 'isuzu',  date: weekDay(0), user_id: 'demo-lea' },
  { id: 'demo-ca-2', resource_id: 'isuzu',  date: weekDay(1), user_id: 'demo-lea' },
  { id: 'demo-ca-3', resource_id: 'isuzu',  date: weekDay(2), user_id: 'demo-lea' },
  { id: 'demo-ca-4', resource_id: 'nissan', date: weekDay(4), user_id: 'demo-josh' },
]

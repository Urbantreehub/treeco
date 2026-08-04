-- Read UTS truck job bookings from Apple Calendar (EventKit / Calendar.app).
-- Step 1 of the Apple Calendar -> TreeCo schedule import pipeline:
--   osascript scripts/read_truck_calendar.applescript > scripts/truck_cal_events.txt
--   python3 scripts/match_cal_to_jobs.py        # match bookings to imported jobs
--   source scripts/.env && python3 scripts/import_cal_schedule.py   # write schedule rows
-- Output: one line per event, fields joined by "|~|":
--   calendar |~| summary |~| location |~| start(ISO) |~| end(ISO) |~| allday
-- The truck job calendars are utsbigtruck / utssmalltruck; the others are empty/unused.
set targetCals to {"utsbigtruck@gmail.com", "utssmalltruck@gmail.com"}
set startDate to (current date) - 21 * days
set endDate to (current date) + 150 * days
set outLines to {}
tell application "Calendar"
	repeat with cn in targetCals
		try
			set cal to first calendar whose name is cn
			set evs to (every event of cal whose start date ≥ startDate and start date ≤ endDate)
			repeat with e in evs
				set s to summary of e
				set loc to ""
				try
					set loc to location of e
				end try
				set sd to (start date of e) as «class isot» as string
				set ed to (end date of e) as «class isot» as string
				set ad to (allday event of e) as string
				set end of outLines to (cn as string) & "|~|" & s & "|~|" & loc & "|~|" & sd & "|~|" & ed & "|~|" & ad
			end repeat
		end try
	end repeat
end tell
set AppleScript's text item delimiters to linefeed
return outLines as string

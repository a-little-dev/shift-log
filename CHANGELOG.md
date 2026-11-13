# Changelog

## 3.28.0 — current

**Twelve new insights, a suggestion on every one, and plainer words.**

### Every insight now says what to do with it

- **Group insights carry a suggestion.** They never have: the tab stated a
  figure and left it there. All of them now end with one line under *What to
  do with this* — what the floor's pattern means for a decision you make
  yourself: which nights to work, when to be on the floor, what to quote, who
  to confirm.
- **Personal insights lead with one.** The block is retitled *What to do with
  this*, and its first line — the most specific one, built from your own
  figures — is set as a statement rather than as one bullet among three. The
  others stay beneath it.
- **Every insight explains itself.** Three older readings (Stacking, Time of
  night, Your best night) had no "how this is worked out". They do now.

### Six new readings on My insights

- **Worth per ticket** — what one ticket is worth to you by how it came in,
  counting the ones that came to nothing: the share that arrive × the share
  that book × your average party. *Which guest to take when two want you.*
- **Who does not arrive** — which appointments are missed most: new guests
  against ones you have seen, self-drive against limo, off-property against
  hotel guests. *Who to confirm, and what an empty hour costs you.*
- **Best pairing** — the guest-and-source combination that books most often,
  and the one that books least. *Where to quote from the top of your range.*
- **Hours that pay** — before 8pm, 8 to 11, after 11: what a ticket is worth
  in each. *When to be on the floor and when to take the break.*
- **Early or late in a tour** — whether you book better in the first half of
  a tour or the second. *Whether to discount early, and how long to stay.*
- **Missing prices** — how many bookings have no price, and roughly what that
  leaves out of every total. *Add them, privately if you prefer.*

The readings that change a decision tonight now come first in the deck.

### Six new readings on Everyone

- **Ten appointments** — of every ten made across the floor, how many arrive
  and how many book, and which of the two losses is bigger.
- **Who does not arrive** — new guests against returning, across the floor.
- **Which way in closes** — appointment, request, lineup pick, bar walk-in or
  pull-in: which books most often and which least.
- **Limo or own car** — which books more often, set against what the limo
  costs.
- **The hour that closes** — the hour whose guests book most, against the
  night as a whole.
- **New faces** — whether the share of first-time guests has moved in the
  last two weeks against the two before.

All twelve keep the rule the rest follow: nothing appears until there is
enough behind it, and each says how it was worked out.

### Plainer words

- "Closing is the bigger leak: 36% of arrivals walk" now reads **"More is lost
  in the room than at the door: 36% of guests who arrive do not book."**
- "…against $3,798 on a night you work" now reads "on a typical night with a
  booking".

### One more small-hours fault

"Time of night" in *What your log suggests* made the same mistake fixed in
Personal insights last version: a 1am ticket was counted as early evening. It
is counted as late now.

### Checks

The new readings' figures are recalculated independently from the raw tickets
and matched against the screen on seven data sets; every insight on both tabs
is checked for a suggestion and a method, for stray "undefined", and for
money showing while amounts are hidden — 529 checks. The earlier suites still
pass: server against the reference, 422 on-screen figures, 27 in-use checks.

## 3.27.0

**An audit of 3.26 against figures worked out independently, and the faults it
found. Nothing was removed and nothing was redesigned.**

Every count and every headline figure was recalculated from the raw tickets by
a separate program written from the rules rather than from this code, then
compared with what the server sends and with what the screen shows, across
eight sets of test data — empty, thin, one person, clean, messy old rows,
busy, busy and messy, and five thousand tickets. The counts all agreed. These
did not.

### A price typed with a comma was saved as one dollar

Type **1,400** into the price box and the ticket was stored as **$1**. PHP
reads a number up to the first character it does not recognise, and the comma
is where it stopped. "$1,400" was stored as nothing at all. The box has never
refused a comma, so this has been open since the price field existed.

The server now removes separators and symbols before reading the figure, on a
new ticket and on an edit alike. A price that comes to nothing — blank, zero,
or words — is recorded as left off, rather than as a shared price of $0.

**Worth a look:** any booked ticket in your log showing a price of a few
dollars was probably typed with a comma. Editing it and re-entering the price
puts it right, and every average that included it corrects itself.

### Days that do not exist

The 31st of February and 25:99 were both accepted, because only the shape of
the date was checked. A ticket on a day that is not on the calendar belongs to
no week and no tour, so it sat in the log and was missing from every figure.
Dates and times now have to be real — on tickets, and on a tour's start, end
and corrected dates. The "too far ahead" check also compares dates on the
site's own clock instead of the server's.

### Three averages for one tour

- **The goal bar** said "about 9 more parties at your average of $1,723"
  directly above an Average party of $1,511. The bar used a plain average and
  the headline a trimmed one; they part company as soon as a tour holds ten
  prices. The bar now uses the trimmed figure, so the parties-to-go count is
  worked out from the same average you are shown.
- **Tour history** divided each closed tour's total by its count — a plain
  average again, under a footnote saying averages are trimmed, and a different
  figure from My insights for the same tour (in the test data, $2,180 against
  $1,875). A closed tour now keeps its trimmed average with its record. Tours
  closed before this version have it filled in once, and only where the
  tickets in the log still add up to what the record says; a tour edited since
  it closed keeps the figure it closed with.
- **What your log suggests** quoted "your overall average" as a plain mean, so
  a finding could name a different figure from the Average party above it.
  It quotes the same trimmed average now.

### Ranges read too low

The "likely" range on missed value, and the floor's usual range, took the
nearest lower price instead of reading between neighbours — on four prices the
three-quarter mark was simply the third. Both the server and the browser now
interpolate, the way a spreadsheet's PERCENTILE does, so the two still agree
with each other and each is now right.

### Smaller things

- **1am was "before 8pm".** In Personal insights, "Time of night" compared the
  clock hour with 20, so the small hours counted as early evening. They now
  sit with "8pm and later", where the night they belong to is.
- **A past tour's heading counted test tickets** and its figures did not: "50
  tickets" on the row, 48 in the history above it. The heading now counts what
  the figures count and names any test tickets separately.
- **The confirmation beside Save redrew the whole page twice** — once to
  appear and once, three seconds later, to leave — and each time took the
  keyboard away from whoever had already started the next ticket. Focus and
  the cursor are now put back, and the message leaves by removing itself.
- **CSV export** swapped a quotation mark inside a note for an apostrophe.
  Quotes are now carried properly, line breaks are kept, accents survive
  Excel, and a cell a spreadsheet would run as a formula is defused.

### On a phone

- **The fourth tab was off the edge.** The tab bar scrolled sideways with its
  scrollbar hidden, so Past tours sat out of sight on a phone with nothing to
  say it was there. Under 600px the tabs now stand two by two.
- **No more half-empty row.** With an odd number of sections the last one sat
  beside a blank half. A section left on its own now takes the full width.

### Fonts served from the site

Archivo, Manrope and IBM Plex Mono ship inside the plugin (`assets/fonts/`,
SIL Open Font License) instead of being fetched from Google. Opening the log
no longer tells an outside company that somebody did, and the page no longer
waits on a second host.

### Checks

Written fresh for this pass and run against the plugin's real PHP and the real
page in Chrome: the server's figures against the reference on eight data sets;
13 rules on what a saved ticket may contain; 422 on-screen figures across six
data sets, every tab, both scopes; and 27 checks of the app in use — every
section opened on desktop and phone with amounts hidden and shown, a ticket
logged, edited and exported, the celebration, the arrows and the tour switch.

## 3.26.0

**Two figures the log already held and never showed.**

### Why they did not book

The reason has been written on every not-booked ticket since the log began
and read back on exactly one screen: its own ticket. The coaching panel has
been saying "the reasons you log on a not-booked ticket are the place to
look" while giving nowhere to look.

A new panel on My insights reads them together, two ways, because free text
needs both:

- **themes**, matched on the words actually used — the price, wanted someone
  else, wanted something else, said he would come back, only looking. A
  reason can sit under two of them, so the shares do not add to the total
  and the card says so rather than leaving it to be noticed. Where the words
  match nothing it is left under its own words, and the count of those is
  stated;
- **in your own words**, every reason as written, most repeated first.

It leads with how many guests decided against booking and what that is worth
at your average, and it names how many said nothing — which is the one thing
on the card you can do something about tonight.

The themes are deliberately narrow. A theme that catches everything tells
you nothing, and a reason filed under the wrong cause is worse than one left
unfiled.

### A tour's goal, against what it made

The goal has been kept on every closed tour record since the switch existed
and displayed nowhere. It now sits under the tour's total in the history —
**83% of the $14,000 goal** on a miss, **met the $11,000 goal** on a hit —
and the Past tours strip counts **how many were met of the tours you set one
on**.

Only where a goal was actually set. A tour run without one did not miss
anything, and marking it as though it had would be a reproach for a decision
never taken. Once a goal is met the percentage stops carrying information,
so it is dropped: "met 285% of $11,000" reads as a riddle where "met the
$11,000 goal" reads as what happened.

### Checks

`preview/reasons.js` counts the reasons straight from the fixture's tickets
and reconciles them against the card — that every reason written appears as
often as it was written, that no theme claims more than exist, that the
price theme holds every reason mentioning one, and that a tour which beat
its goal can never read as a miss.

All suites pass: 120 + 6,002 + 19 JS checks, 81 + 24 + 39 PHP checks, plus
18 reason, 21 limo, 10 scope and 7 behaviour checks in a browser.

## 3.25.1

**The stretch goal is gone.**

Every part of it: the figure worked out from what your tours average, the
offer beside the empty goal box on the log, the action behind it, and the
line on Past tours that said the average was what a stretch goal is built
on — that cell now simply says how many closed tours it covers.

A tour goal is still set the way it always was, by typing one.

Nothing else moved. All suites pass: 120 + 6,002 + 19 JS checks, 81 + 24 +
39 PHP checks, plus 21 limo, 10 scope and 7 behaviour checks in a browser.

## 3.25.0

**Limo money, on both the personal and the pooled side. "What you are aiming
at" is gone.**

### What you are aiming at is removed

The card is off My insights entirely, with its styling. The stretch goal
itself is still there where it is used: beside the empty box on the log,
where a tour goal would otherwise be invented, offered as one press.

### Limo money

A booking that arrived by limo carries a cut off the top before anything
else is split. Worked through on the house's own example of a $100,000 limo
booking: **$30,000 to the limo, $35,000 kept by the courtesan, and $65,000
on the house's side** once the limo's cut and the house's own half of the
remainder are counted together.

A new **Limo money** section on My insights and on Everyone. The personal
one leads with the tour in scope and carries a table of **every tour with
limo money in it** — what it booked, what the limo took, and what was kept —
with a total beneath, which is the figure per tour that was asked for. The
pooled one does the same for the floor.

Three rules, each of which would be invisible on screen if it were wrong:

- only a **booked** ticket marked as arriving by limo counts. A limo that
  turned up and did not book is not money;
- a limo booking with **no price on it** is counted as a booking and left out
  of the money, and the card says how many — dropping it from both would
  under-report how many limos there were;
- on the pooled side only **shared** prices can be counted, which the card
  says, because a price kept private is in nobody's total but its own.

### Nothing to backfill

The figures are worked out from the limo mark and the amount, both of which
have been on every ticket since the log began. There is no new column, no
migration and no second pass over the table: **every ticket ever written is
already counted**, and anything logged from here counts as it is saved.

### The rates are settings

30% and 35% are the defaults, not the law — both are on the plugin's
settings page with a worked example underneath that recalculates as they are
changed, so a house on different terms is not stuck with somebody else's
figures. Both are clamped to 0–100: a rate above 100 would hand out more
than the booking was worth, and a negative one would quietly add money to a
tour, and either would be believed by every figure built on it.

### A card that led with four noughts

The personal card is scoped to the tour above it, and a tour with no limo
booking in it headlined four zeros while the table underneath carried the
real figures. The strip now falls back to the whole log and says which it is
showing.

### Checks

`preview/limo.js` counts the limo money straight from the fixture's tickets
and compares it against the card: that a limo ticket which did not book is
not counted, that the cut is 30% and the share 35% of what did, that the
per-tour rows add to the total beneath them, and that the house's own
$100,000 example comes out at $30,000 / $35,000 / $65,000.

All suites pass: 120 + 6,002 + 19 JS checks, 81 + 24 + 39 PHP checks, plus
21 limo, 10 scope and 7 behaviour checks in a browser.

## 3.24.0

**A fourth tab for finished tours, a stretch goal worked out from what your
tours actually come to, and the floor comparison taken back out.**

### You against the floor is gone

Removed from the Everyone tab, along with its card, its findings and its
test. Nothing else changed on that tab. If it is wanted back, it is complete
in 3.23.0 — the card, the subtraction of your own figures from the floor's,
the shared-price rule and `tests/floor.js`.

### The stretch goal

A goal typed into an empty box tends to be whatever the last tour came to,
which is a target to match rather than a reason to push. The stretch is
worked out instead: what your tours average, and then **ten per cent above
it** — far enough to mean something, near enough to be had. Rounded to the
nearest 250, because a goal of $14,837 is a sum and a goal of $14,750 is a
target.

**What you are aiming at** on My insights shows both: the goal you set and
the stretch, each with its own bar and how far there is to go. One press
takes the stretch as the tour's goal, and the stretch is offered beside the
empty box on the log too, where a goal would otherwise be invented.

It needs two closed tours before it appears — below that there is no average
to speak of, and it says so rather than guessing.

Both figures read through the same two functions the Past tours tab reads,
which matters more than it sounds: worked out separately they drifted apart
the moment one counted a stretch of days the toggle never marked and the
other did not, leaving the tab saying a tour averages $27,500 and the goal
built on it quoting $21,525.

### Past tours, in a tab of its own

A fourth tab after Everyone. Everything about finished tours moved there:

- a strip across every closed tour — how many, the parties, the money, what
  a tour averages, and the best one;
- the **tour history** table with its date editor, off My insights;
- **tour by tour**, each with its figures and its own scrolling list of
  tickets, off the bottom of My log;
- the summary of a tour you just closed, which now opens this tab rather than
  leaving its figures on a tab you might not go to next.

My log is the tour you are on. My insights is how it is going. Past tours is
what came before.

### Where each figure lives

Audited after the move: nothing personal is left on Everyone, and nothing
house-wide sits on My insights. The two tabs share no figures.

### Two faults found in the moving

**A table could push the page sideways.** A panel is a grid item, and a grid
item sizes to its content unless told otherwise — so the history table's own
scrolling box was never allowed to be narrower than the table inside it. It
only showed once a wide table was open by default on a phone. Panels and
panel bodies now carry `min-width: 0`.

**The tab you pressed could sit half off the edge.** With four tabs the row
scrolls sideways on a phone and the last one is partly past the edge. The row
now scrolls the selected tab into view — the row, never the page.

### Checks

`preview/stretch.js` reads the average off Past tours and the stretch off My
insights and checks the one is ten per cent above the other, that the target
is a round figure, that the sentence quotes the same average the strip does,
and that taking the stretch sets the goal to it.

All suites pass: 120 + 6,002 + 19 JS checks, 81 + 24 + 39 PHP checks, plus
10 scope, 11 stretch and 7 behaviour checks in a browser.

## 3.23.0

**The written sales tips are gone. In their place: advice worked out from
your own log, and a comparison of your figures against everyone else's.**

### The amounts switch moved to the top

It used to sit partway down each tab — on My log, halfway down the column
beside the tickets — which meant hunting for it every time. It is now the
first thing on every tab, beside the line that says what the figures cover,
and it reads as a button rather than as a link inside a sentence. The second
copy further down the Everyone tab is gone; one switch governs the page.

### The library of sales tips is gone

Seventy written tips, a shelf system, thumbs up and down, three downvotes to
retire one, and an admin tab to moderate them. They were sound and they said
nothing about you: everyone on the floor read the same seventy, in the same
order, whatever their log said.

Removed entirely — the tips, the voting, `includes/tips.php`, the three REST
routes, the admin tab, and the house tally. The option and the per-person
vote records are deleted on upgrade rather than left in the database for
good.

### What to work on

Its replacement on My insights is worked out from your tickets and ordered by
what each reading looks to be worth, so the first is the one with the most
behind it:

- appointments that were not kept, valued at your own average;
- bookings with no price on them, and what that does to every average;
- the type that pays best against the type you are asked for most;
- which night of the week is worth more a party, and by how much;
- how wide the spread of your own prices is, and where the bottom of it sits;
- requests against appointments;
- how few of your guests had seen you before.

It reads your whole log rather than the tour in scope — how you work is not a
per-tour question, and on a four-day tour nothing would clear the thresholds.
Where the log does not support a reading, it does not appear.

### You against the floor

New on Everyone, and the one that needed the most care. It compares your
figures with everyone else's, segment by segment: how often your appointments
are kept, how much of what you see you close, what you are asked for more and
less than the others, and what each kind of party goes for on your tickets
against theirs.

Two things make it honest rather than flattering:

**Your own tickets are taken out of the floor's figures first.** The house
totals include you, and on a small floor they include a lot of you — compare
yourself against a pool you are a tenth of and every gap flattens toward
zero, telling everybody they are average.

**Money is compared on shared prices alone.** The house counts prices shared
with everyone; your own screens count private ones too. Take your own total
off the house's shared total and your average appears to beat the floor by
exactly the prices you chose not to show them. Every comparison uses your
shared figures; your private prices stay out of it, and stay yours.

Readings are ordered by what is at stake rather than by verdict, so a price
gap worth hundreds a party leads whether it flatters or not. Two places where
you match the floor are kept whatever else there is to say — a comparison
that only ever reports gaps reads as an accusation.

### More findings

Four new readings on My insights: whether parties with more than one thing in
them pay more or less than single ones, whether you close better before or
after 8pm, your best single night and what it came to, and how often a
ticket does not record whether you had met the guest before.

### Checks

`tests/floor.js` builds a log and a house payload where the right answer is
known in advance — four shared prices at $1,000 and two private ones at
$9,000, against a floor averaging $3,000 — renders the real card and reads
the figures back off it. If the subtraction stops happening, or the private
pair leaks into the comparison, the average moves somewhere impossible to
miss and the suite fails.

All suites pass: 120 + 6,002 + 19 + 16 JS checks, 81 + 24 + 39 PHP checks,
plus 10 scope and 7 behaviour checks in a browser.

## 3.22.0

**Every personal screen now reads one tour at a time, the floor's screen
leads with this week, and a tour's dates can be corrected after the fact.**

### The question the figures answer has changed

Across four months of tickets, "is the booking rate good?" is not a question
anyone asks. **How is this tour going, and is it going better than the last**
is. So My log and My insights are both scoped to a single tour, named at the
top with arrows to step back through the ones before it. One more press reads
the whole log, which is what both screens used to do and no longer do by
default.

Everything on the insights tab follows the scope — the headline, the rings,
the badges, the ticket mix, the findings, the party types, the segments.
Three things deliberately do not:

- **the tour history**, which is a list of every tour and would be a list of
  one;
- **the chart**, which becomes a run of tours when a single tour is in scope —
  a tour has nothing to compare itself against if the chart is cut to it too;
- **"your usual"** under the average party, which is the whole log's trimmed
  average, there so this tour's average has something to be high or low
  against.

### Earlier tours moved out from under the current one

My log lists the tickets of the tour in hand. Everything before it sits in a
new **Earlier tours** section beneath, one panel per tour, each with that
tour's figures and its own scrolling list of tickets. A closed panel draws
nothing, so a long history costs nothing until it is opened.

Tickets logged while out of house belong to no tour at all. Rather than let
them vanish from a screen that now shows one tour at a time, they are
gathered under **Logged outside a tour** at the end of the section. The
audit below checks that the tour in hand plus every panel beneath it is the
whole log, exactly.

### Everyone leads with the week

The floor reads that tab to know how the week is going, and all-time totals
across months of tickets were answering something else while sitting at the
top of the page. **This week** now leads — tickets, parties, show rate,
average party, booked so far, plus walk-ins, missed value and what is still
undecided. **The weeks before** follows. Everything ever logged has moved
into its own **Overall** section further down, with the group insights, party
types and segments that are drawn from that range beneath it where they
belong.

### A closed tour's dates can be corrected

The switch gets pressed late, or a day early, or a tour gets closed on the
drive home. Until now that was permanent. **Change dates** on any closed tour
in the history opens a start and an end in the row itself.

The figures are then worked out again from the log for the days given,
because a different range is a different set of tickets — they are not scaled
or carried over. The tour keeps its goal, the time it was opened, and its
place in the history, and the row says **dates corrected** afterwards.

Refused: an end before the start, a date that is not a date, a tour running
into the future, and a closed tour reaching into the shift running now, which
would count the same tickets twice.

### A bug this found

Scopes were matched by object identity. The list of tours is rebuilt on every
render, so `list[i] === tour` compared two descriptions of the same tour and
found them different — the position being stepped from was always reported as
zero, and the arrows went dead after one step while the label read "tour 5 of
5" on every tour. Matching is by key now, and the keys carry both the start
and the end so a tour reopened and closed again on the same day cannot
collide with the one it replaced.

### Checks

A new browser audit, `preview/scopes.js`, drives the real app: it steps
through every scope, adds the tour in hand to every panel beneath it and
compares the total against the log, opens an earlier tour and checks it draws
as many tickets as it claims, confirms the scope carries between the log and
the insights, and corrects a closed tour's dates end to end. `tests/sections.php`
gained the server side of that — the recount, the preserved goal, and every
date that should be refused.

All suites pass: 123 + 6,002 + 19 JS checks, 93 + 24 + 39 PHP checks, plus
10 scope checks and 7 behaviour checks in a browser.

## 3.21.1

**Two gold frames that had no room inside them.**

Both were found by photographing the app rather than reading it — the kind of
fault that passes every arithmetic check and is obvious the moment you look.

### The usual range sat on the frame

On **Everyone**, a group finding is drawn as a framed slide with a gold edge
down its left side. The element carries two classes, `sl-giitem` for the
plain list row and `sl-gislide` for the framed slide, and the list rule was
written further down the stylesheet than the slide rule. Equal weight, so the
later one won: the slide inherited the list's `padding: 15px 0` and its text
ran flush onto its own gold edge.

The slide now names both classes, so where the two rules happen to sit in the
file can no longer decide its padding.

### The reached goal clipped its own figures

Passing a tour goal turns the goal row into a framed gold panel. The frame is
drawn as an inset ring, which lands exactly on the content box — and the row
had top padding only. The ring ran through **BOOKED THIS TOUR** and cut the
bottom off **6 parties**.

The framed state now carries padding and a radius of its own, and no longer
draws a separating rule underneath the frame as well.

### Housekeeping

- `tests/house-audit.js` bucketed weeks from **Thursday** while the app ships
  **Wednesday**, so it reported ten failures against correct figures. The
  audit now holds the same day the app and the plugin do.
- `tests/run.js` asserted three pieces of copy that the 3.21.0 text trim had
  rewritten ("counted as one tour", "1 with no price") or moved to a surface
  that tab does not render. The week-boundary check now asserts the thing that
  actually has to hold: that `WEEK_START_DAY` and `SL_WEEK_START_DAY` are both
  Wednesday.
- `tests/agree.php` and `tests/sections.php` lift the counting helpers out of
  `rest.php` by name, and had not been told about `sl_shared_price()` — which
  `sl_add_metrics()` now calls. Both suites were fatal on the first ticket.

All suites pass: 118 + 6,002 + 19 JS checks, 93 + 24 + 24 PHP checks.

## 3.21.0

**Every ticket now accounts for itself, the sheen stays on the tabs, and gold
runs through the interface.**

### "30 total, 7 booked, 5 not"

The arithmetic was right; the sentence was not. A ticket that was a no-show,
or that nobody has marked yet, is **neither booked nor not booked** — so the
two figures were never going to reach the total on their own, and eighteen
tickets sat on screen unexplained.

The tickets cell now names the remainder: **7 booked · 5 not · 18 open**. The
test suite checks the three add up to the total rather than trusting them to.

### Every value column audited

A new suite, `tests/columns.js`, builds **400 random logs** — every
combination of kind, guest, attendance, outcome, price mode and amount,
including empty strings and zeros — and asserts the invariants on each:

- the kinds account for every ticket, and so do the guest types;
- decided is booked plus not booked, and never exceeds the total;
- every booking is either priced or not; every price is either shared or
  private;
- marked appointments never exceed appointments, and every no-show is an
  appointment no-show;
- money is never counted from an unpriced booking, and the total is exactly
  the sum of the prices that qualify;
- no rate ever exceeds what it is a share of;
- an empty log reports no rates rather than a wrong one.

**6,002 checks, all passing.** The columns reconcile.

### The sheen

Changing tab washed a band of light across the entire page — the log, the
form, everything. It now runs across the **tab bar only**, which is the
control that was pressed.

### The seal

It struck on every page load. It now strikes **once a session**, remembered in
session storage, so moving around the site does not restamp it. A new session
earns the entrance again.

### Gold

Gold was doing only two jobs — the seal and the goal bar — while pink carried
every accent. Gold is the metal the mark is struck from, so it now marks
weight rather than action, and pink is left for things that can be pressed:

- a gold hairline along the top edge of every card, brightest where the light
  falls;
- gold rules under section eyebrows and beneath the stat strip;
- gold-tinted stat labels;
- a gold seam down the edge of every ticket stub;
- a gold ring around each panel mark, so a closed panel reads as an object;
- the header rule running gold into pink;
- the log's scrollbar matched to the seam.

### Less repetition

- The unpriced count was stated in two places; it is now in the price cell
  only.
- The tour line said its length twice — *5 days · 5 active* became **3 of 5
  days worked**.
- The in-house hint was three lines explaining what the switch already says.
  It is one, and it was also **rendering outside its own box**, spanning the
  page above the two columns and overlapping the card beneath.

`tests/columns.js` — 6,002 checks. `tests/run.js` — 124. `tests/php-smoke.php`
— 93. `tests/agree.php` — 24. `tests/sections.php` — 24.
`tests/house-audit.js` — 19. The control sweep — 28. All passing.

## 3.20.0

**A struck seal instead of a drawn one, larger and animated on arrival, and
sharper graphics throughout.**

### Everything checked first

All five suites and every browser walkthrough were run before anything was
touched: 117 + 93 + 24 + 24 + 19 checks and the 28-check control sweep, all
passing, with no page errors on any tab.

### The seal

It was three shapes: a hairline ring, a flat translucent disc, and the letter.
Flat, and at 44px too small to read as anything.

It is now **struck rather than drawn**, at **60px**:

- a **rim** with its own gradient, lit from the opposite side to the face so
  the edge reads as raised rather than painted on;
- a hairline **highlight** just inside it;
- a **sunk face** on a radial gradient, with a soft inner shadow so the disc
  looks pressed into the metal;
- an **engraved line** inside the rim;
- the **letter cut in** — a dark impression offset a fraction below a metal
  stroke, which is what makes an engraving look engraved;
- a **specular arc** across the top left, where the light is coming from.

### It arrives

On first load the seal drops in from a slight rotation, the **rim draws itself
around**, the letter is **cut in after it**, the engraving and the highlight
fade up, and a **shine runs the length of the stroke** as it settles. The
wordmark and the lines beneath slide in just behind it, staggered.

It strikes **once**. A mark that restamps itself every time a ticket is saved
is a distraction rather than an entrance — verified that a tab change does not
replay it. Reduced motion gets the finished seal with none of the drawing.

The sign-in page uses the same mark, from `includes/logo.php`, which was a
separate copy and would otherwise now show a different logo. Both were brought
into step and the letter path is checked to be identical in each.

### A name collision, fixed

The seal's parts were called `sl-ring`, `sl-disc` and `sl-letter` — and
`sl-ring` is also the **rate ring** on My insights. Any rule written for one
was quietly reaching into the other, and a test counting rings found four
where there were three. The seal's parts are now `sl-lm-*` throughout.

### Sharper elsewhere

- The **rate rings** carry gradient arcs instead of flat strokes, running from
  deep to bright so the eye follows the arc round, over a recessed track with
  its own shadow, each with a soft glow in its own colour.
- Curves are drawn for **precision rather than speed**, which is visible on a
  ring's edge and on the seal's rim.
- Type is antialiased and set with ligatures on, a shade crisper on the dark
  ground.

`tests/run.js` — 123 checks, including that the seal's parts exist, that it is
drawn at the larger size, and that it no longer borrows a class the rate rings
own. All other suites unchanged and passing.

## 3.19.2

**The real cause: every save has been writing two columns as the wrong type
since 3.10.0. Fixed, and damaged tickets repaired on upgrade.**

3.19.1 fixed the browser half — a date chosen from the picker was not being
recorded. That was real, but it was not the whole fault, and it was not the
reason editing an existing ticket's amount did nothing.

### What was actually wrong

`$wpdb->update()` and `$wpdb->insert()` take a list of column formats matched
**by position** to the fields being written. That list had to be kept in step
with the order `sl_ticket_from_request()` happens to return its fields in.

When `hotel_guest` was added in 3.10.0, the field list grew to sixteen and the
format list stayed at fifteen. Every format after it shifted by one:

| Column | Written as | Should be |
|---|---|---|
| `private_note` | `%d` | `%s` |
| `is_test` | `%s` | `%d` |
| `price_mode` | `%f` | `%s` |
| `amount` | `%s` | `%f` |

So on every save, **the private note was written as a number** — becoming
`0` — and **the price visibility was written as a float**, turning `included`
and `private` into `0`. `0` is not a visibility the form knows, so re-opening
that ticket showed no amount field at all, and its money dropped out of every
figure. That is the "editing an existing ticket is broken for amount" fault
exactly.

### The fix

Formats are now **derived from the column names** rather than positions. A map
gives each column its own type and the list is built from whatever fields are
being written, so adding a column cannot move anything else. An unknown column
falls back to text rather than to whatever happened to be next in a list.

### Repairing what was damaged

Tickets already saved with a broken `price_mode` are repaired once, on upgrade.
The original choice cannot be recovered — `0` does not say which it was — so:

- a booking that still has an **amount** becomes **private**, which puts the
  money back into your own totals without claiming it was shared with the
  floor;
- one with **no amount** becomes **omitted**, which is what it was in effect.

That is the cautious direction. A ticket marked private can be corrected to
shared by opening it; money silently left out of your figures cannot be
noticed at all. **If any of those were shared with the house, open them and
set them back** — they will be in your log with a *Price private* chip.

Notes written as `0` are cleared.

### Testing

The suite now checks the real field list rather than a sample: one format for
every field, each one the format that column wants, the note as text, the
visibility as text, the amount as a number, the test flag as a whole number,
and the create path — which adds two more columns around the same fields —
lining up too.

`tests/php-smoke.php` — 93 checks. `tests/run.js` — 117. `tests/agree.php` —
24. `tests/sections.php` — 24. `tests/house-audit.js` — 19. The browser sweep
— 28. All passing.

## 3.19.1

**The date, time and amount fields were dropping what you picked. Fixed, plus
two more faults found by sweeping every control in the app.**

### Why the editor lost your date, time and amount

The app recorded typing through the `input` event only. A date or a time
**chosen from the browser's own picker** fires `change` — and for the calendar
widget, Safari fires no `input` at all. So a date picked rather than typed was
never recorded, and the ticket saved with whatever the field held before. The
same applied to an amount arriving by paste or from some numeric keypads,
which is why editing an existing ticket's price appeared to do nothing.

Both events are now captured. Reproduced first, then fixed: setting a date to
15 June and a time to 13:05 through `change` alone used to save 12 August and
03:39; it now saves what was picked. An amount set the same way saved the old
figure; it now saves 8888.

### The chart panel rendered as nothing

*Kept against no show* opened to an empty panel. Its card head holds the
Day/Tour toggle, and the head was being found with a non-greedy
`<div …>…</div>` — which stops at the **first** closing tag it meets, in this
case the toggle's. The head was cut short and its own `</div>` left orphaned
at the front of the body, where the browser read it as closing the panel body
early. Everything after it fell outside, so the chart disappeared entirely.

The head is now found by counting opens and closes, so the tag that actually
matches is the one used.

### The Day/Tour toggle was unreachable

Fixing the above revealed that the toggle had been swallowed with the head all
along — cleanly removed rather than mangled, but gone either way. Anything in
a card head that is not the title or the date range is a **control**, so it is
now put back at the top of the panel body. Verified: switching to Tour takes
the chart from 14 daily bars to 3.

### The sweep

A new browser pass exercises every interactive control: each form field holds
its choice, the party picker opens and selects and clears, the note is kept,
reset clears it, all three tabs render, amounts hide and show, every panel
opens with content in it, the insight carousel moves, the CSV link is offered,
and back-to-top appears and works. **28 checks, all passing**, with no page
errors anywhere.

`tests/run.js` — 117 checks, now including that the chart panel has bars, no
orphaned tag at the front of its body, and its toggle still reachable.
`tests/php-smoke.php` — 85. `tests/agree.php` — 24. `tests/sections.php` — 24.
`tests/house-audit.js` — 19. All passing.

## 3.19.0

**Deleting a ticket now asks first.**

A ticket is a night that happened, and there was no undo — one press of
*remove* and it was gone, along with its money, out of your figures and off
the Everyone tab. It now takes two deliberate presses with the ticket shown in
between.

The question is a proper window rather than `window.confirm()`. That would
show the browser's own wording, could not show **which** ticket was about to
go, and on a phone appears at the top of the screen far from the button that
was pressed. This one shows the ticket in full — the night, the time, every
chip on it, the money — above a plain warning that it cannot be undone.

Four ways out, three of them safe:

- **Keep it** closes the window.
- **Escape** closes it.
- **A click on the backdrop** closes it — deliberately, since the safe answer
  should be the one you can reach by accident.
- **Yes, delete it** is the only thing on screen that deletes.

Focus lands on *Keep it* rather than the delete, so a stray Return keeps the
ticket. The delete button is the only rose-coloured button in the app, and it
is the only place that colour is used as a fill.

### A bug caught in testing

The window is built into `document.body` so it can sit above everything,
which means the app's delegated click handler — bound to its own root —
never saw it. The dialog looked correct and its buttons did nothing: the first
run of the test deleted no ticket at all, which is the right outcome by
accident rather than by design. Its buttons are now wired where they live.

Verified end to end in a browser: one press asks and removes nothing, cancel
and Escape and the backdrop all keep it, and the second press takes the log
from 24 tickets to 23.

`tests/run.js` — 114 checks, including that pressing remove once leaves the
log untouched. `tests/php-smoke.php` — 85. `tests/agree.php` — 24.
`tests/sections.php` — 24. `tests/house-audit.js` — 19. All passing.

## 3.18.1

**A sweep for the same class of fault everywhere else it could hide.**

Three times now a figure has disagreed with itself because one business rule
had been written out by hand in several places and the copies drifted. This
release went looking for the rest of them.

### One more real disagreement, found and fixed

**The floor's price distribution and its priced count described different
bookings.** `sl_add_metrics()` had been taught to require a real amount, but
the `$amounts` array feeding the median, the quartiles and the top-tenth share
still used `null !== $amount` — which counts an empty string and a zero. So on
the Everyone tab the *count* of shared prices excluded those bookings while the
*distribution* of them did not.

There are now two named rules, one each side of the line that has caused every
one of these faults:

- **`sl_own_price()`** — a person's own money: shared or private, with a real
  figure. Used by the tour figures, the week rows inside them and the goal bar.
- **`sl_shared_price()`** — only what was shared with the floor. Used by the
  metric folding and the price distribution, which now describe exactly the
  same bookings.

The browser's `ownPriceOf()` mirrors the first, and the badge selection, the
best-party figure and the popup all route through it rather than repeating the
test.

### Also aligned

- **The ticket's own words.** The label maps — *Appointment*, *From lineup*,
  *Returning to me* and the rest — were written out twice: once for the log,
  once for the window a badge opens. Edit one and the same ticket would be
  described two different ways depending on where you read it. Now named once.
- **The week boundary.** The server held a bare `3` where the browser has a
  named `WEEK_START_DAY`. It is now `SL_WEEK_START_DAY`, so the pair is
  findable from either side — they have to move together or the chart and the
  totals bucket tickets into different weeks.

### Checked and found already in step

The walk-in kinds, the rule that a walk-in cannot be a no-show, the
test-ticket exclusion, and `decided`/`aMarked` are each defined once per side
and agree.

`tests/php-smoke.php` — 85 checks, now including that the priced count and the
price distribution hold the same bookings and the same money.
`tests/run.js` — 111. `tests/agree.php` — 24. `tests/sections.php` — 24.
`tests/house-audit.js` — 19. All passing.

## 3.18.0

**The banner and the headline disagreed. Found, fixed, and the two boxes made
one.**

### The disagreement

The goal bar said the tour had booked **$39,250**; the insights headline said
**$37,977** — same tour, same 17 parties, $1,273 apart.

`ownPrices()` in the browser still used `priceMode !== "omitted"`, which lets
through a booking whose visibility was never chosen. That is the *third* place
this rule had been written out by hand, and the third time it drifted. It is
now one named function, `ownPriceOf()`, mirroring `sl_own_price()` on the
server, and the two figures match exactly.

### One box

The switch, what has been booked, and the goal were three stacked panels
saying overlapping things. A shift is one state, so it now reads as one box —
and **everything past the switch stays hidden until a tour is running**. There
is nothing to book against before that.

### The money leads

Everything moved at once, so nothing led. The headline figure now **runs up
alone**, and the rings begin filling once it has almost landed, staggering
among themselves. Measured across frames, the money moves for five frames
before the first arc appears.

**Booked this tour** counts up the same way, so the figure reads the same in
both places rather than one animating and the other appearing.

### The goal bar fills, then breathes

The bar fills over a second, and only once it has stopped growing does the
liquid start — sloshing while its own container is still moving reads as a
glitch rather than a surface. Two waves cross at different speeds, 5.5 and 7.9
seconds; one alone reads as a stripe sliding past, two out of step read as
something with a surface. The bar is taller now so there is room to see it.

The bar is tracked separately from the figure, because a goal can be set long
after the box first appeared — sharing one play-once flag left such a bar
filled but dead, which is exactly what happened first time.

### An even split

My log was `.88fr / 1.12fr`, which made the ticket form — the thing you are
actually filling in — the narrower of the two. It is now half and half: 586px
each at 1280 wide.

`tests/run.js` — 111 checks. `tests/php-smoke.php` — 77. `tests/agree.php` —
24. `tests/sections.php` — 24. `tests/house-audit.js` — 19. All passing.

## 3.17.0

**Bigger rings, a headline that arrives, and badges that open the night they
are talking about.**

### The rings are larger, and they fill

Up from 64px to **88px**, with a thicker arc and the figure inside at 23px —
readable across a room rather than only close up. On arrival each one **fills
from empty to its true share**, staggered slightly, while the percentage in the
middle counts up alongside it.

They are drawn empty and filled after the browser has painted: a dasharray
already sitting at its final value has nothing to animate from, and the arc
would simply appear.

### The money runs up

**Booked this tour** counts from zero to its total over about a second, eased
so it moves quickly and lands softly rather than ticking at a constant rate. It
always finishes on the exact figure rather than wherever the last frame fell.

Both play **once**, when the headline first appears. A tab change or a saved
ticket redraws it settled — without that, every action anywhere on the page
would replay the whole thing.

### Badges open their night

A badge that names a particular night is now a button. It **lifts and grows
slightly on hover with a gloss travelling across it**, and the arrow beside it
slides forward. Clicking opens the ticket in a small window over the page: the
night, the time, the money, every chip that was on it, the reason and any
private note — with an **× in the corner** that spins as you reach for it.
Escape closes it too, as does a click outside.

A badge that names a *rate* stays a label. There is nothing behind it to look
at, and a button that does nothing is worse than a label that never claimed to.

### Up to four specific nights

The party badges were one. There are now more to draw from — your best party,
and the most recent night well above your usual — alongside the streak, the
tour comparison and a standout day, which opens **all** the tickets from that
day rather than one, since the point of it is that there were several. Four are
shown at once, strongest first.

`tests/run.js` — 109 checks, now asserting on the animation's targets rather
than the empty first paint, and that every arc target matches the percentage
that will settle beside it. `tests/php-smoke.php` — 77. `tests/agree.php` — 24.
`tests/sections.php` — 24. `tests/house-audit.js` — 19. All passing, no
horizontal overflow at 390px.

## 3.16.1

**Parties booked and total booked disagreed between sections. Two causes,
both fixed, and a new suite that checks every section against the others.**

### What was wrong

The tour code had grown its own rule for whether a price counts, and it was
not the rule the rest of the app uses.

1. **The week rows inside a closed tour were short by every private price.**
   They were built with the shared-money figure the Everyone tab uses, while
   the tour total above them counted the person's own money — shared *and*
   private. The weeks therefore did not add up to the tour they were inside.
2. **The goal bar counted bookings the browser does not.** It tested
   `price_mode !== 'omitted'`, which looks equivalent to "shared or private"
   and is not: it also lets through a booking whose visibility was never
   chosen. This is the same fault fixed on the main figures in 3.12.1,
   reintroduced when the tour code was written — which is exactly why it now
   goes through one function instead of being written out again.

Both were real: on the test log, the weeks were short by £3,000 of private
money and the goal bar was over by a £9,999 booking with no visibility set.

### Fixed

One helper, `sl_own_price()`, now decides this everywhere on the tour side: a
price counts only where the visibility was actually chosen — shared or
private — and there is a real figure above zero. The tour figures, the week
rows inside them and the goal bar all call it.

### Checked, not assumed

A new suite, `tests/sections.php`, takes one log containing every awkward case
— a shared price, a private one, a booking with the price left off, a booking
with an amount but no visibility, a zero, a not-booked ticket and a no-show,
spread across three weeks — and asserts that:

- the closed-tour record's parties and total match a hand count;
- **the week rows add up to the tour they sit in**, in parties, in money and
  in priced count;
- every ticket lands in exactly one week;
- the goal bar agrees with the closed record on all three;
- the average is the total over the priced count;
- and the rule itself accepts and refuses the right tickets.

`tests/agree.php` also now checks the browser's own-money figures against
`sl_own_price()` across all 720 ticket combinations, so the headline on My
insights and the goal bar on My log cannot drift apart again.

`tests/sections.php` — 24 checks. `tests/agree.php` — 24.
`tests/run.js` — 101. `tests/php-smoke.php` — 77. `tests/house-audit.js` — 19.
All passing.

## 3.16.0

**My insights rebuilt: shorter, with a shape to it.**

The page was six identical cells, then a card, then more identical cells —
every number the same size, which means every number the same weight, which
means nothing tells you what matters. It read like a report because it was
laid out like one.

### One figure leads

**Booked this tour** now sits at the top at 58px, with the parties behind it,
the tour's own shape underneath — *Aug 8 – Aug 12 · 5 days · 1.4 a day* — and,
where there is one to compare against, how it stands against the last tour in
green or rose.

### Rates are rings

Appointments kept, booked, and requests booked are drawn as filled arcs with
the figure in the middle. A percentage read as a number takes a moment; read
as an arc it takes none.

An earlier version drew *average party* as a ring against an invented ceiling
of $5,000 — an arc needs a real denominator or its fill means nothing, so that
became a genuine rate and the average moved to the strip below. The tests now
check every arc's drawn length against the number printed inside it, because a
ring showing 60% with a half-filled arc would be worse than no ring at all.

### The mix is a bar

*11 appt · 4 req · 3 line · 4 bar · 2 pull* was five abbreviations you had to
read in sequence. It is now one stacked bar with a colour each and a legend
underneath, so the shape of your work is visible before you read a single
figure.

### Badges

The log now says out loud what it noticed: a run of bookings, your best party,
every appointment kept, a tour up on the last one, a standout day. Each has its
own mark and colour. Nothing appears unless it is true — an empty row is
honest rather than padded.

### Shorter

- The **This tour** card is gone; it repeated the money and the party count
  the headline already carries, so its unique facts moved into the headline
  and the card went.
- The price line went from three lines of prose to **15 shared · 0 private · 2
  with no price**.
- The strip below the rings dropped from six cells to four, and no longer
  repeats anything the rings say.
- The dead `tourReview` function was removed with it.

The page is **1,831px instead of about 2,400** at the same width, with more in
it worth looking at.

`tests/run.js` — 101 checks. `tests/php-smoke.php` — 77. `tests/agree.php` —
22. `tests/house-audit.js` — 19. All passing, and no horizontal overflow on a
390px phone.

## 3.15.0

**A tour goal, with what you have booked against it, at the top of the log.**

While you are in house the bar now carries a second row:

- **Booked this tour** — what you have taken since the shift started, with how
  many parties made it and how many of those carry no price.
- **A goal, if you set one** — *$12,000 to go · 77% of $51,250* — over a bar
  that fills from pink into gold as it goes.
- **How many more parties that is** at your own average on this tour, so the
  gap is expressed in nights rather than only in money.

Set a goal with **Set a tour goal**; change or clear it at any time. It is
optional — nobody has to invent a figure before they can start work — and it
is remembered with the shift, so it survives a reload and a sign-out and is
kept on the record when the tour closes.

Typing is forgiving: `$25,000`, `25000` and `25,000` are the same goal, and a
stray minus is read as the number it precedes rather than refused.

### When the goal is reached

The bar turns gold, reads **Goal reached**, and the same gilded light a large
ticket earns is thrown from the goal bar — the bloom, the ring, and the rising
gold dust — with a band of light sweeping across the row and the figure
lifting into gold.

It fires **once per crossing, not once per render**, which is the part worth
saying: without that, every ticket saved afterwards and every tab change would
set it off again and the thing would become an irritation rather than a
moment. Setting a goal you have already passed counts as a crossing too.
Reduced motion gets the gold and the words with none of the movement.

### Worked out once, on the server

The booked figure and the goal arithmetic come from the same place the closed
tour figures do, and ride along with every tour response — two routes to one
number is how two screens stop agreeing. The figures are sent with the page as
well, so the bar is right on the first paint.

The goal figures obey the amounts toggle like everything else; the tests check
they are masked before they check the numbers.

### A bug caught on the way

`tourRefresh()` — the boot and retry path — was not carrying the new progress
figures through, so the goal row rendered as nothing at all until some other
request happened to update it. Found by exposing the app's own state rather
than reading the page, which is the only way that class of fault shows itself.

`tests/run.js` — 99 checks. `tests/php-smoke.php` — 77. `tests/agree.php` — 22.
`tests/house-audit.js` — 19. All passing.

## 3.14.1

**The shift you are on is remembered properly.**

It was always stored against your account rather than the browser, so the
record itself survived signing out. What did not survive was the *display* of
it — and that is what you actually see.

### The bug

The switch was seeded empty and filled in by a request that arrived a moment
later. That request finished with `if (state.tab === "mine") render();` — a
line left over from when the toggle lived on the insights tab. **The switch
now lives on the log, which is the tab you land on**, so on the screen where
it matters the redraw never happened. A running shift showed as *Out of house*
until you visited another tab and came back.

### Fixed

- **The state is sent with the page**, alongside your handle and the rest, so
  the switch is right on the very first paint rather than flipping a second
  later — or, on a poor connection, not at all.
- The refresh that follows **redraws whatever tab is showing**, so a shift
  started on a phone appears on a laptop left open, and vice versa.
- **When the state cannot be checked at all, the bar says so** instead of
  guessing. It reads *Could not check whether you are in house*, in gold, with
  a **Try again** button, and the switch is withheld. This matters more than
  it looks: silently showing *Out of house* invites somebody to press it and
  start a second tour on top of one already running.

### Verified

The browser tests now check the first paint specifically, before any request
could have returned, and confirm the state survives a full reload and moving
between tabs. The PHP tests sign an account out, sign it back in, and confirm
the same shift is still there — and that another account sees their own state
rather than this one.

`tests/run.js` — 92 checks. `tests/php-smoke.php` — 69. `tests/agree.php` — 22.
`tests/house-audit.js` — 19. All passing.

## 3.14.0

**The shift start can be corrected, and it now carries a time as well as a
day.**

You arrive, work for three hours, and then remember the switch. The start is a
statement about when the shift began, not about when the button was pressed —
so it has to be correctable, or the first hours of every forgotten tour sit
outside the tour they belong to.

### What changed

- A shift now records **a time as well as a day**. The bar reads *Shift
  started Sat, Aug 8, 6:30 PM · day 5* rather than only the date.
- **Adjust the start** sits under the bar while a shift is running. It opens a
  day field and a time field with the current values already in them, and a
  line saying plainly what moving the start does: tickets are counted into a
  tour by their own day, so moving it earlier pulls in anything already logged
  on those days.
- Going in house now sends the current time rather than midnight, so a shift
  started at eight in the evening says so.

### What it refuses, and why

- **A start in the future** is refused rather than quietly clamped to today.
  Silently moving somebody's date is worse than telling them it is wrong, and
  a future start would make the day count negative.
- **Later today than it is now** is refused for the same reason.
- **More than two years back** is refused: it is well past any real shift, and
  it stops a mistyped year dragging thousands of tickets into one tour.
- A day or a time it cannot read is refused; a *missing* time falls back to
  midnight rather than failing, since that is a reasonable thing to mean.

A refused correction **leaves the shift exactly as it was** and keeps the
editor open with the reason beside the fields, so what was typed is not thrown
away.

### Testing

The suite caught two things worth recording. The harness's `current_time()`
stub ignored the format it was handed and always returned a full timestamp, so
code asking for a date got one with a time attached and every comparison
failed for reasons unrelated to the code. And an early version of the test
used an evening time "today", which is genuinely in the future when the suite
runs in the small hours — the rule working, not a fault.

`tests/run.js` — 90 checks, now loading a third instance of the app with a
shift already running so the editor has something real to edit.
`tests/php-smoke.php` — 63. `tests/agree.php` — 22. `tests/house-audit.js` —
19. All passing.

## 3.13.0

**The switch reports where you are, and arriving and leaving now look
different from one another.**

### It says the state, not the action

The switch read **Go in** and **Going out** — instructions for what pressing
it would do. It now reads **Out of house** and **In house**, and keeps saying
so until it is changed. Glancing at the bar tells you where you are rather
than what you could do next.

The state name moved onto the switch itself, so it is not printed twice on the
same row. The line beside the dot now carries the context instead — *No tour
running*, or *Tour running since Wed, Aug 12 · day 3*. The action wording has
not been lost: it moved to the accessible label, where a screen reader
announces "You are out of house. Press to go in house and start a tour."

### Arriving and leaving

Two moments, so two animations rather than one played backwards.

**Going in house** is warmth arriving. A band of light sweeps across the bar
from the left — gold into jade into pink, the site's own three colours in the
order they appear elsewhere — the dot ignites with a ring pushing outward, the
bar lifts very slightly, and the new word rises into place.

**Going out** is the light withdrawing. A plain, colourless sheen leaves to
the right, the dot dims out of its glow, and the bar settles by a fraction
rather than lifting. It is the quieter of the two and should feel it.

Both last around a second, belong to the moment of change rather than the
state that follows, and are removed once finished so nothing lingers on the
element. Anyone who has asked for reduced motion gets the state change with no
movement at all.

`tests/run.js` — 81 checks, including that no action wording survives on the
switch and that the state and its context read correctly in both positions.
`tests/agree.php` — 22. `tests/php-smoke.php` — 52. `tests/house-audit.js` —
19. All passing.

## 3.12.1

**Your insights and Everyone were counting prices differently. Fixed, proved,
and now impossible to break quietly.**

### The bug

Two different rules decided whether a booking counted as priced, and they
disagreed in both directions:

- **The browser called a price "shared" whenever it was not marked private.**
  A booking carrying an amount but no visibility — possible on any ticket
  written before the choice existed, or edited into that state — was counted
  in *your* shared figure while the server counted it as no price at all. Your
  screen said you had shared more than the floor's screen ever saw.
- **The server counted a booking as priced when the amount was empty or
  zero.** `null !== $amount` lets an empty string and a `0` through, so such a
  booking joined the priced count and added nothing to the total. Every
  average on Everyone was divided by a count larger than the money in it.

Both sides now use the same rule, stated the same way: a price counts only
where the visibility was actually chosen **and** there is a real figure. Your
own totals still include private prices, as they always have — that is
deliberate, and it is the only difference left between the two screens.

### Proved rather than asserted

`tests/agree.php` is new. It builds a log containing **every combination** of
ticket kind, price mode, attendance, outcome and amount — 720 tickets, one for
each — runs them through the PHP aggregation and through the browser's own
`tally()` (loaded from the real file, not reimplemented), and compares field by
field.

Sixteen counts must match exactly. The money fields are allowed to differ, but
only by an exact amount: the browser's priced count must equal the server's
plus precisely the private ones, and *shared* on your side must equal *priced*
on the server. That relationship is now asserted, so the two screens cannot
drift apart again without a test failing.

### You can now check it yourself

The line under your figures used to say only how many prices were kept off the
house total. It now reads out the whole split — how many you shared with the
floor, how many you kept private, out of how many booked, and how many
bookings carry no price at all. If that disagrees with what you remember
entering, the number to compare against is right there.

### The toggle

**In house / out of house has moved to the top of My Log**, above the ticket
form, which is where you are standing when you arrive and when you leave. It
was on the insights tab, which is not somewhere you go to record something.
The closed-tour figures still appear on the insights tab, where the rest of
the figures live.

`tests/agree.php` — 22 checks. `tests/run.js` — 78. `tests/php-smoke.php` — 52.
`tests/house-audit.js` — 19. All passing.

## 3.12.0

**Weeks now run Wednesday to Wednesday, and a tour is something you declare
rather than something the log guesses.**

### The week

Weeks ran Thursday to Wednesday. They now run **Wednesday morning to
Wednesday night**, everywhere — the four-week chart, the week-over-week
reading, the tour week tables, and the house figures on the server.

Both sides were walked across 400 consecutive days to prove they agree: every
week starts on a Wednesday, ends on the Tuesday night, and every date falls
inside its own week. The JavaScript and the PHP were checked separately and
give the same answer for the same date, which matters because one computes the
chart and the other computes the totals.

### In house / out of house

A switch at the top of your own insights. Turn it on when you arrive; turn it
off when you leave. Everything logged in between is one tour.

Turning it off **closes the tour**: every ticket since it was turned on is run
through the same figures the rest of the app uses, the result is kept, and the
tour drops into your tour history. The closed tour is shown once, in full, so
the numbers are not simply filed away where nobody looks at them — tickets,
active days, show rate, parties, average party, tour total, and a week-by-week
table underneath when the tour ran over more than one week.

**Closed figures are kept, not recomputed.** Editing a ticket months later
cannot rewrite what a finished tour reported at the time. That is the point of
closing one.

Some details that matter in use:

- A declared tour **overrides the old gap detection**. Any stretch of log from
  before you first used the switch is still inferred from gaps, so nothing
  changes for anyone who never touches it.
- **This tour** disappears from the page while you are out of house. It used
  to keep showing the tour that had just been closed, which is exactly what
  the switch is meant to end.
- **Reopen the last one** undoes a toggle pressed by mistake, putting the tour
  back the way it was.
- A tour cannot end before it started, however the clock or the timezone
  behaves.
- Tours run any length and end on any day. The week table inside a closed tour
  says plainly that the first and last weeks are usually part weeks, because a
  tour rarely starts or ends on a Wednesday.
- History is capped at 60 tours so it cannot grow without limit, and both tour
  records are removed on uninstall.

### Week over week

Unchanged in behaviour and now correct at the new boundary: the four-week
chart, the week-over-week comparison and the house week table all bucket on
Wednesday, and a tour spanning several weeks shows each of them separately.

`tests/run.js` — 72 checks. `tests/php-smoke.php` — 52 checks.
`tests/house-audit.js` — 19 checks. All passing.

## 3.11.1

**Audit of the Everyone tab, and a real accounting bug fixed.**

A new suite, `tests/house-audit.js`, builds a house payload the way the PHP
endpoint does, renders the Everyone tab from the real app file, then recomputes
every figure on that screen from the raw tickets by a completely separate route
and compares. The log it uses is built to be awkward: tickets spread over five
weeks so the four-week window has to exclude some, tickets sitting on the
boundary days themselves, bookings with no price, bookings with a private
price, walk-ins wrongly marked as no-shows, and a test ticket that must never
reach any figure.

### The bug

**When pooled amounts are switched off, every average on the Everyone tab was
built from a hollow total.** A booking with a shared price still counted toward
`priced`, but its money was withheld from `amount` — so the ticket total and
the week totals were right, and every *average party* figure divided a short
total by a full count. With amounts off, a week with three shared prices
reported an average of $0 rather than no figure at all, and the same short
total fed the week totals, the segment table and the price comparisons.

`priced` and `amount` now move together. When pooled amounts are off, a booking
with a shared price is counted exactly as one whose price was kept private:
`omitted`. No figure is built from an incomplete total, and rates and counts
are untouched either way.

### Checked and found correct

The audit also confirmed several things that were suspected but not proven:

- **Ticket totals** on the headline strip and in every week row match a
  ticket-by-ticket count exactly, with the test ticket excluded.
- **Week totals and averages** match to the pound across all four weeks,
  including the week in progress.
- **Week boundaries** were walked across a full year of possible "today"
  values in two daylight-saving timezones: every week is exactly seven days,
  no gaps, no overlaps, and today always lands inside the current week.
- **`booked` always equals `priced` plus `omitted`**, now asserted directly,
  which is the invariant the bug above broke.
- **A walk-in marked as a no-show** is read as having shown, so the overall
  no-show figure cannot disagree with the appointment one.

Also fixed in the audit itself: an early version checked the test ticket was
excluded by asserting a number never appeared anywhere on the page, which a
coincidental week count could satisfy honestly. It now compares the counted
total against the log directly.

`tests/house-audit.js` — 19 checks. `tests/php-smoke.php` — 47 checks.
`tests/run.js` — 66 checks. All passing.

## 3.11.0

**Hotel guest now reads as a factor rather than a label.**

3.10.0 stored the field and showed it. This makes the log answer the question
behind it: does a guest already upstairs spend more, and do they keep the
appointment?

### On My insights

Two new findings in *What your log suggests*, each with its own three
suggestions:

- **Staying here** — appointments kept by guests on the property against those
  arriving from elsewhere, stated as a gap in points. The advice flips with
  the direction: if hotel guests keep more, take those slots with confidence
  and hold the others loosely; if they keep fewer, confirm them the same way
  as anyone else, because being upstairs makes an appointment easy to keep and
  just as easy to put off.
- **Room upstairs** — trimmed average spend on each side. Again the advice
  turns: quote hotel guests at the top of your range if they pay more, and if
  they do not, stop assuming a room means a bigger budget. Both end by pointing
  at the booking rate, since the group that pays more is not always the group
  that says yes more.

*Where they are staying* also joins the comparison engine in *Personal
insights*, so it is measured on booking rate, appointments kept and price
alongside transport, guest history, hour and day — whichever separates most
is what surfaces.

### On Everyone

Three group readings: the floor's book-rate gap between hotel guests and
everyone else, what a hotel guest spends against what others do, and the share
of tickets where the guest was already staying on the property. Each carries
its own method note.

### Guards

Every one of these waits for enough on both sides — three marked appointments
or three priced parties each, five decided tickets a side for the floor — and
a gap wide enough not to be chance: 12 points on attendance, 15% on spend, 8
points across the floor. Tickets where the question was never answered are
counted on neither side rather than being lumped in with *no*.

### Testing

The main fixture is deliberately small, so the two sides rarely differ enough
to trip those guards — which is correct behaviour and useless for testing the
findings. The harness now loads a second instance of the app against a log
built to separate: 6 of 8 hotel appointments kept against 3 of 8, and $3,000 a
party against $1,000. It asserts the exact figures the app prints — 75%, 38%,
a 38-point gap, 200% more a party.

`tests/run.js` — 66 checks. `tests/php-smoke.php` — 38 checks. All passing.

## 3.10.0

**Hotel guest on the ticket — yes, no, or unknown.**

A new field sits between *Guest* and *Transport*, asking whether they are
staying on the property. Like every other choice on the form it redraws only
the form, so picking it does not rebuild the page or move the cursor.

It runs the whole way through rather than only being stored:

- **On the stub** — a hotel guest is chipped in the returning-guest colour, and
  one who is not staying is marked *Not staying*. Unknown and unanswered stay
  unmarked, as everywhere else.
- **In your segments** — *Hotel guests* and *Not staying here* join the segment
  table with their rates alongside everything else.
- **In Personal insights** — a new comparison, *Where they are staying*, so if
  hotel guests book at a different rate or a different price than guests
  arriving from off the property, the log will say so once there are enough of
  each to mean anything.
- **On the Everyone tab** — the same two segments for the floor.
- **In the CSV** — its own column, next to Guest.
- **When editing** — an existing ticket fills the field back in, so changing
  something else never quietly clears it.

The column is added by `dbDelta` on upgrade, so existing tickets keep their
data and simply carry an empty value until edited.

`tests/run.js` — 57 checks, including that all three answers are offered, that
the field survives being chosen without a rebuild, and that both chips appear.
`tests/php-smoke.php` — 38 checks. All passing.

## 3.9.1

**Sales tips moved to the foot of My insights.**

They had been sitting first, above everything drawn from your own log — which
put a standing library in front of the figures the page exists to show. The
panel is now last, in line with the others, under the tour history.

Two things needed fixing once it moved:

- **The page shifted when the tip changed.** At the foot of the document a
  shorter tip shrinks the page, and the browser pulls the scroll up to follow.
  Tips run from two lines to five, so the card now holds a floor height and
  every one renders at the same 208px. What was a jump of up to 90px is now
  12, from the footnote rewrapping.
- **The shelf chip stretched the full width of the card.** Giving the card a
  floor height made it a flex column, and a stretched cross axis pulled the
  chip out to the full width. It now sets its own alignment.

`tests/run.js` — 52 checks. `tests/php-smoke.php` — 38 checks. All passing.

## 3.9.0

**Tips can be voted on, and 25 more of them — 70 in the library.**

### Twenty-five new tips, three new shelves

| Shelf | Covers |
|---|---|
| Client relationships | Keeping a file rather than a memory, why the second visit is the more important sale, what a guest is escaping, and where the line between a regular and a friend goes |
| The guest's experience | Removing decisions rather than adding them, giving an evening a shape, fixing the small thing before it is mentioned, and why recovery beats perfection |
| Negotiation | Who frames the money owns it, trading instead of conceding, leading with the fullest version, two yeses rather than a yes and a no, and knowing your walk-away before you open |

### Thumbs up, thumbs down

Every tip now carries a pair of thumbs. Pressing one records it; pressing the
same one again takes it back. **A tip three separate people mark as no use
leaves the cycle for everybody.**

Two records are kept, and the distinction is what makes the retirement mean
anything:

- **Per person, in user meta** — which way each person voted on each tip. This
  is what makes a vote a vote rather than a tally: pressing thumbs down four
  times is one opinion, not four.
- **For the house, in an option** — how many people voted each way.

The PHP suite tests exactly this: one account pressing thumbs down thirteen
times in a row never pushes the count above one, and cannot retire a tip
alone. Three separate accounts can.

The card updates the moment a thumb is pressed and the request follows behind,
because a thumb that waits on a round trip feels broken — and if the request
fails the vote is put back rather than left showing something the server never
agreed to.

Retirement can never empty the library: if it ever took the pool below five
tips it is ignored.

### A Tips tab in the admin panel

Alongside Bug reports and Members, a third tab lists every tip anyone has
voted on, most-argued-about first, with its up and down counts and its shelf.
Retired tips are marked, and **Put it back** returns one to the cycle for good
— it stays however the votes move afterwards. Ids are resolved back to titles,
so a tip removed from the library in a future version still shows its votes
rather than a bare slug.

### Stable ids

Every tip now carries an id derived from its title (`sound-before-sight`), so
a vote stays attached to the tip it was cast on rather than to a position in
an array. All 70 are unique, which the test suite checks — two tips sharing an
id would silently pool their votes.

`tests/run.js` — 52 checks. `tests/php-smoke.php` — 37 checks. All passing.
Votes and the vote record are both removed on uninstall.

## 3.8.0

**Sales tips — a new section at the top of My insights.**

Everything else on that tab reads your own log back to you. This does the
opposite: a standing library of 45 pieces of advice on what tends to work in a
house where the price is high and the competition is not on price. Eight
shelves:

| Shelf | What it covers |
|---|---|
| Arrival | The hours between yes and the door, and the first ninety seconds |
| The room | Light, scent, sound, and what should never be in view |
| Conversation | Reading the register, what to remember, what never to mention |
| Pricing and closing | Naming a number, holding it, and what a hesitation usually means |
| How a visit ends | The last five minutes, and why they are the ones remembered |
| Between visits | Retention, reaching out, and not discounting the second visit |
| Presentation | Photographs, legibility, consistency, honest scarcity |
| Lasting at this | Boundaries, rest, protecting your best hours, testing one change |

### Which one you are shown is not random

Where your own log is clear about a weak point, the draw is weighted to the
shelf that speaks to it — an appointment show rate under 70% pulls toward
*Arrival*, a book rate under 55% toward *Pricing* and *Conversation*, a
returning-guest share under 40% toward *Between visits* and *How a visit ends*.
When it leans for a reason, the tip says so underneath.

The first version narrowed the pool to only the weighted shelf, which meant
five tips going round on a loop — a short library and an obvious one. The
weighted shelf now comes first and the rest follows it, so today's tip lands
where the log points and pressing on walks you out into all 45.

Which tip you start on is fixed by the date, so it changes overnight on its
own rather than resetting every time the page is opened. **Another tip** moves
forward, the arrow moves back, and both swap the card in place — the panel
stays open and the page does not move under you.

The card carries a gold rail rather than a pink one, so advice and measurement
are never mistaken for one another at a glance.

`tests/run.js` — 49 checks. `tests/php-smoke.php` — 26 checks. All passing.

## 3.7.0

**Nothing follows the scroll any more. One arrow brings you back instead.**

### Back to the top

A small arrow in the corner, above the bug mark, which appears only once
there is more than 520px of page behind you — before that there is nothing to
go back to, so there is no button. It fades and lifts in rather than snapping,
and leaves the same way.

Clicking it scrolls smoothly to the top and then moves keyboard focus up there
too, so the keyboard follows the page rather than being left at the bottom of
it. Anyone who has asked for reduced motion gets an instant jump instead.

Scroll fires constantly, so the check is deferred to the next frame and the
class only ever changes on a crossing — nothing is measured in the middle of
the browser's own scrolling.

### The columns no longer stick

Since 3.2.0 both columns held their place as the page moved. That was there to
stop the log pane leaving a gap under itself, but it meant two panels
detaching and floating while everything around them scrolled. They now sit
still on the page, and the arrow does the job the stickiness was doing.

**Making them end level took measuring rather than styling.** Stretching the
row to the form's height sounds right, but the pane's own content then counts
toward what sizes the row: the pane grows, the row grows to match, the pane
grows again, and the log ends up exactly as long as it ever was. Both a
`stretch` and a zero-flex-basis version were built and both did this. The form's
height does not depend on the pane, so it is a fixed number to work back from —
the pane is now measured against it, on load and on resize, and the two columns
end level at the same pixel. The viewport cap remains as the fallback if that
measurement never runs.

Also fixed on the way: the desktop override had been written *above* the rule
it was overriding. At equal specificity the last one wins, so it had been doing
nothing at all.

`tests/run.js` — 45 checks. `tests/php-smoke.php` — 26 checks. All passing.

## 3.6.0

**A room for the app to stand in, instead of a flat black wall.**

The background was one value of black, which is a wall with the lights off.
What makes a dark interface read as expensive is that the black is *not* one
value: a warm centre, cool corners, and slow colour moving through it that you
never quite catch. Three fixed layers now sit behind everything, none of which
scroll, so the cards float rather than sit.

1. **Auroras and sheen** — two pink lights, one at the top left and a smaller
   one bottom right, with a faint gold at the top right echoing the metal in
   the logo. Across them all runs a single very wide band of light, the look
   of light off silk. The whole layer wanders on a 52-second loop that should
   never be caught moving; it is the difference between a still image and a
   room, not an animation.
2. **Vignette** — the corners pulled down so the middle carries the eye.
3. **Grain** — fine noise, which is what stops a large dark gradient banding
   into visible stripes.

Sampled at the corners, the background now runs from `(23,13,17)` warm pink at
the top left through `(18,15,11)` gold at the top right to `(8,8,8)` at the
bottom left. Nowhere on screen is it the same black twice.

**Cards were given real height.** A single large shadow at this size reads as
a border rather than as distance, so each card now casts three: a tight one
that seats it, a wide one that lifts it off the room, and a very soft pink one
underneath that picks up the colour behind.

### Three things worth writing down, all learned by getting them wrong first

- **The vignette cannot live on the drifting layer.** That layer is overscanned
  by 12% so no edge ever slides into view as it moves — which means its dark
  corners fall outside the screen entirely. The first attempt looked hazy for
  exactly this reason. The vignette now has its own layer at the viewport.
- **Grain is a speckle, not a wash.** At the opacity it was first given it
  lifted black to grey and the whole room went flat and cheap. It belongs at
  about a tenth, where you cannot see it but you can see what it does.
- **A sheen band needs its stops spread across the whole layer.** Tightened
  up, the band's own edge becomes a visible diagonal seam across the page.

The panel behind the logo carries `.sl-app` too, for its type and colour
tokens, so it is excluded from all three layers — it has its own ground and
must not paint the room a second time on top of the page. The whole backdrop
is skipped for anyone who has asked for reduced motion.

`tests/run.js` — 45 checks. `tests/php-smoke.php` — 26 checks. All passing.

## 3.5.2

**The panel now works with the WordPress login instead of alongside it.**

### The design was wrong

Being signed into WordPress as the owner and then being asked for the owner's
password proves nothing — it is the same person, one step later. That gate was
a checkpoint in front of a door already unlocked, and every way it could fail
was a way of being locked out of your own panel for no security gain.

**If the account already signed into WordPress may open the panel, it opens.**
No password, no second step. Clicking the S goes straight in.

The password gate still exists, but only for the case it was ever useful in:
signed in as somebody else. There it now explains itself — *you are signed into
WordPress as X, which is not the account this panel opens for* — and names the
account it does want.

### When something still refuses

A panel that only says "that did not work" cannot be fixed from the outside,
so the gate can now report its own state. **Trouble getting in?** shows what
the server sees: which account is signed in, whether it is an administrator,
whether it is the owner, which address the panel is set to, whether the bug
table exists, and the plugin version — then says plainly which of those is the
problem.

Failures are also named rather than flattened:

- **404** — the admin route is missing, so the update did not finish
  installing; deactivate and reactivate.
- **Invalid nonce** — the session expired; reload.
- **401** — WordPress does not see you as signed in.
- **Bare 403** — something on the server is refusing, likely a security plugin
  or firewall in front of the REST API.

Underneath, responses are now read as text and parsed here, so an endpoint
answering with an HTML error page produces a real message instead of a
`Unexpected token <` crash that hid the actual status.

### Also

- `whoami` returns nothing about accounts other than the one already signed
  in, and the smoke test asserts that no password or hash can appear in it.
- An administrator who is not the owner can still open the panel, so a
  mistyped owner address can never seal it shut.

`tests/php-smoke.php` — 26 checks. `tests/run.js` — 45 checks. All passing.

## 3.5.1

**Fixes the admin gate, which refused a WordPress username.**

### What was wrong

The gate compared what was typed against the owner's **email address only**.
Typing the WordPress username — `alicelittleweb` — never matched, so the
correct password was never even checked, and the answer came back as though
the password were wrong. The box was labelled *Email*, but a sign-in box is a
sign-in box: people reach for whichever identifier they think of first, and
WordPress itself accepts either.

A PHP smoke test now runs the gate for real against a stubbed WordPress —
`tests/php-smoke.php`, 17 checks. It caught this immediately, along with two
others below.

### Fixed

- **Username or email both work.** The field is relabelled, and the lookup
  tries the address, then the username, then the address again for anything
  that did not parse as an email.
- **An administrator can always get in.** Previously, if the owner option ever
  pointed at an address nobody held, the panel was sealed shut with no way
  back. Any administrator signing in with their own password can now open it
  and correct the address under Settings.
- **A wrong account now says so.** Correct username, correct password, but not
  the owner account, used to return the same "wrong password" — an unhelpful
  dead end. It now says the details are right but the panel is set to a
  different address, and names it. This leaks nothing: it only appears once
  the credentials have already been proven.
- **The typed username survives a failed attempt** rather than being cleared,
  so a mistyped password does not mean typing everything again.
- **Submitting an empty gate** says "Both boxes, please." instead of making a
  request that was always going to fail.
- Case and stray whitespace around the address are tolerated.
- The field is set not to autocapitalise or autocorrect — on a phone, the
  first letter of a username was being capitalised on the way in.

Unknown account and wrong password still fail with identical wording, and the
five-attempts-per-quarter-hour throttle is unchanged.

`tests/run.js` — 45 checks. `tests/php-smoke.php` — 17 checks. All passing.

## 3.5.0

**An admin panel behind the S. Bug reports moved into it, and a view of who
has logged how many tickets.**

### Getting in

The logo is now a button. Clicking the S opens a gate asking for an email and
password; getting through opens the panel over the app, so nothing underneath
is lost. Escape or a click outside closes it. The unlock lasts two hours, and a
**Lock** button ends it immediately.

**No password lives in this plugin.** The gate checks what is typed against the
WordPress account for the owner address, using WordPress's own hashed store —
so the credential stays where WordPress already keeps it, and changing it in
WordPress changes it here with no edit to any file.

Because of that, one thing has to be true for the panel to open: the WordPress
account for **alicelittle@thealicelittle.com** must have the password you
intend to use. If it does not, set it once under Users → Profile and the gate
will accept it.

Other protections:

- A wrong address and a wrong password fail with **identical wording**, so the
  gate cannot be used to find out which addresses exist.
- **Five attempts per IP per quarter hour**, then a wait.
- Every route the panel reads or changes requires the unlock to have happened;
  the unlock itself is a short-lived transient on the session, not an account
  and not a cookie of its own.

### Inside

A strip along the top: tickets logged, members logging, accounts, open
reports. Then two tabs.

**Bug reports** — everything the bug mark has collected, newest first, each
with the writer's handle, when it arrived, which tab and version and screen
they were on, and buttons to mark it *working on it*, *close*, *reopen* or
*delete*. Filters for needs-attention, closed and everything. A coloured rail
down each card carries the status: pink for new, gold for in progress, grey
once closed.

**Members** — every account with its handle, address, and how many tickets it
has logged, sorted by volume with a bar for the shape of it. Counted excludes
test tickets, which are shown separately alongside bookings and the date last
logged. Accounts awaiting approval appear with a zero rather than being left
out, and tickets belonging to a deleted account still show under their handle
rather than vanishing from the totals.

### Moved rather than added

The **Bug reports** screen in wp-admin is gone; reading reports now happens
only in the panel. Filing one is unchanged — the bug mark in the corner still
does that, and it is still the only way reports arrive.

`tests/run.js` — 45 checks, all passing. Every PHP file passes `php -l`.

## 3.4.0

**A bug mark in the corner of the app, and a private log of what it collects.**

### In the app

A small, mostly transparent bug mark sits in the bottom-right corner at 42%
opacity — quiet enough to forget, findable the moment something breaks. It
brightens to pink on hover. Tapping it opens a small panel: a sentence of
explanation, a box to write in with a character count, and a send button.

- The widget lives in `document.body`, **not** inside the app's root. Root's
  `innerHTML` is replaced on every render, so anything built inside it would
  be wiped mid-sentence; out here a half-written report survives a save, a tab
  change and a re-render.
- Escape closes it, and so does a click outside — **unless something has been
  written**, in which case a stray click does not throw the text away.
- Sending an empty box shakes the panel rather than scolding.
- On success the panel becomes a tick and a thank-you, then closes itself.
- Errors from the server, including the rate limit, are shown in place of the
  character count rather than as an alert.

Each report carries the writer's **handle**, which tab they were on, the app
version, viewport size, page URL and browser string. **Nothing from their
tickets is attached**, and the panel says so plainly.

### Where they land

A new table, `{prefix}shift_log_bugs` — deliberately separate from tickets,
since it holds free text about the app and should never be joined to ticket
data or swept up by a ticket query.

A **Bug reports** menu appears in the WordPress admin with a count badge for
unread reports. It shows each report with its handle, when it arrived, and
where the writer was, with buttons to mark one *working on it*, *close*,
*reopen* or *delete*, filter tabs for needs-attention / new / closed /
everything, and a bulk delete for closed reports.

### Who can read it

Only the account whose email matches the owner address — set to
**alicelittle@thealicelittle.com**. This is stricter than an ordinary
administrator check: another administrator can change *who* the owner is from
Settings, but cannot read the reports as themselves. The menu is never
registered for anyone else, and the page itself checks again on load.

The address is editable under **Settings → Shift Log** so it can be corrected
if it ever changes; the field warns that setting an address nobody holds makes
the log unreachable until it is corrected back.

### Safeguards

- Filing is limited to **six reports an hour per account**, held in a
  transient — enough for a bad afternoon of genuine faults, not enough to fill
  a table with.
- Messages are capped at 2,000 characters and pass through
  `sanitize_textarea_field`; every other field is sanitised to its own type and
  length, and the page URL through `esc_url_raw`.
- Writing a report needs the same capability as logging a ticket, and the same
  REST nonce. Reading them does not happen over REST at all.
- Admin actions are nonce-protected, and both destructive ones confirm first.
- The table and both options are removed on uninstall, under the same explicit
  opt-in that already guards ticket data.

### Also

- Every PHP file now passes `php -l`.
- The test harness's stub DOM was extended to cover the widget, so
  `tests/run.js` still runs the real front-end file end to end — **45 checks,
  all passing**.

## 3.3.0

**Every personal finding now carries three things you could try with it.**

A reading told you what your log says. It did not tell you what to do about
it. Each of the fifteen findings in *What your log suggests* now ends in a
**What you could try** block: three concrete moves aimed at the money, written
against that particular finding rather than pulled from a general list.

They are written from the finding's own figures, so they name your own party
types, days, hours and prices:

- *Most popular* suggests leading with the type you are known for, and offers
  the runner-up as a step up rather than a separate decision.
- *Your range* suggests opening at your own 75th percentile — a number a
  quarter of your parties already meet, so it is proven rather than hopeful —
  and treating your 25th as a floor.
- *Follow-through* splits by which leak is bigger: confirm the day before if
  arrivals are the problem, work on the first five minutes if closing is, and
  fix only one at a time so you can tell what helped.
- *Prime hours* names your best-paying hour and suggests protecting it and
  quoting higher in it.
- *Streak* points out that a run of yeses is the cheapest moment to test a
  larger number.
- *New vs returning*, *Momentum*, *Price trend* and *Repeat value* each read
  differently depending on which way the gap runs, so the advice under a
  falling average is not the advice under a rising one.

Presentation and safeguards:

- The block sits under the reading on a **pink ground with its own rule**, so
  the figures and the suggestions never blur into one another.
- Suggestions **respect the amounts toggle**: every figure inside them goes
  through the same masking as the rest, so nothing leaks while amounts are
  hidden. The test harness now checks this directly.
- The card's footnote says plainly that the figures come from the log but the
  moves are a suggestion — *you know the night and the guest, and the log does
  not*.

`tests/run.js` grew to **45 checks**, including that every finding carries
exactly three suggestions, that they name the finding's own subject, and that
no bare dollar figure appears in them while amounts are masked.

## 3.2.0

**The log reads inside its own window instead of stretching the page.**

With a few dozen tickets the right column ran to nearly four thousand pixels,
leaving the form beside it as a short panel floating against an enormous page
— and the only way back to the form was a long scroll up.

The list of tickets now scrolls **inside its own pane**, sized to the screen
rather than to the number of tickets (`clamp(420px, 100vh − 268px, 940px)`).
The stats strip and the amounts row stay pinned above it; the footer and the
CSV link stay below. **Show 40 more** sits inside the pane, so loading more
tickets fills the window rather than growing the page.

Details:

- The pane **fades at whichever edge still has tickets past it** — the top
  fade is absent at the top, the bottom fade clears once you reach the last
  stub, so a fade never sits over the final ticket implying more to come.
  Tracked with a capture-phase scroll listener registered once on the root, so
  it survives every re-render.
- The scrollbar is **styled in pink** to match, on Firefox and WebKit alike.
- **Both columns are now sticky** above 1100px: the form holds its place while
  the log is read, and the log holds its place while the rest of the form is
  filled in.
- `overscroll-behavior: contain` keeps a flick inside the pane from carrying
  on into the page behind it.
- The pane is **keyboard reachable** and takes a visible focus ring, so the
  log can be scrolled without a mouse.
- Below 1000px the pane is **released entirely** — a scroller inside a
  scrolling page is a nuisance on a phone, and there the list simply runs on
  as it always did.

On a 1440×950 screen this takes the page from 3,900px to 1,692px, with the
form now the taller of the two columns.

### Unchanged

Every figure and threshold is untouched; `tests/run.js` still passes all 40
checks.

## 3.1.0

**More colour where the reading happens, and the closed panels rebuilt as
tiles instead of long thin bars.**

### Panels are cards now

The collapsed sections were five near-identical bars stacked down the page —
a lot of width spent on one word each. They now sit **two to a row** as proper
tiles, each with:

- a **drawn mark** in a pink-washed rounded square (drawn as SVG, not emoji,
  so it sits with the typeface rather than against it) — a sun for what the
  log suggests, bars for comparisons, a heart for party types, a pin for
  tours, figures for the group, a calendar for the weeks;
- **a line of its own** saying what is inside, so the choice is legible before
  you open anything;
- a **chevron that turns** through 180° on open, rather than a plus swapping
  to a minus.

The open panel takes the full width and the rest close ranks around it. Below
860px they stack one per row as before. Each tile carries a pink hairline down
its leading edge that lights on hover, the mark fills solid pink while open,
and the open panel gains a soft pink bloom from its top-left corner.

### Colour in the findings

A finding on a slide now reads as the thing you are looking at rather than
another grey box:

- a **pink bloom** washing out of the top-left corner;
- a **pink-to-gold rail** down the leading edge;
- the tag set in pink on pink rather than as a grey chip;
- the headline a full white at 20.5px, with more room around it.

**Everyone** takes the same treatment in gold rather than pink — gold bloom,
gold rail, gold label — so the floor's figures stay visibly distinct from your
own at a glance, which matters when both screens show the same shapes.

### Unchanged

Every figure, guard and threshold is untouched; `tests/run.js` still passes
all 40 checks.

## 3.0.0

**A full pass over the app: every calculation audited, deeper findings, a
carousel to move through them, and the confetti replaced with gilded light.**

### Fixed in the audit

- **The show-rate chart's legend was invisible.** Its three swatches still
  pointed at colour variables from a palette deleted two redesigns ago, so the
  squares rendered as nothing. They now use the same tone system as every
  other swatch in the app.
- **The stat strips were half-broken by two dangling selectors.** A stray
  `.sl-stats[data-cols="5"]` with no block swallowed the 1240px breakpoint for
  six-column strips, and a stray `.sl-stats[data-cols="6"]` fused onto the
  `.sl-stat` rule beneath it — scoping the base cell styling to one page only.
  Both repaired, and wrapped strips now carry proper hairlines: a top rule on
  second-row cells, and no left divider on the first cell of a row.
- **The chosen tab's gloss was painting across half the page.** The gloss
  pseudo-element positions absolutely, but the tab itself was never made a
  positioning context — so "a gloss across its upper half" meant the upper
  half of the *viewport*, drawn as a giant dome behind the header. One line:
  the tab is now `position: relative`.
- **Two gold variables held pink values.** `--gold-wash` and one stop of
  `--metal-soft` carried the pink RGB. Corrected to gold.
- **The test-ticket toggle redrew the whole page**, contradicting 2.27.2's
  fix; it now redraws only the form, like every other form field.
- **Day-of-week earnings** now count only booked amounts, so a stray figure on
  an undecided ticket can never lean on "your busiest day".

### The maths, verified end to end

A test harness (`tests/run.js`, plain Node, no dependencies) loads the real
production `shift-log.js` under a stubbed DOM, feeds it a fixture log through
a stubbed fetch, drives the app through its own recorded listeners, and checks
every rendered figure against values computed independently by hand — 40
checks: show rates, book rates, trimmed averages, quartile ranges on the
no-show valuation, private-price handling, omitted prices, test-ticket
exclusion, tour detection, per-tour figures, request conversion, masking (no
dollar figure may appear anywhere while amounts are hidden), and that an arrow
press never rebuilds the page. All pass.

### Deeper findings

Seven new personal readings, each with the same sample-size discipline as the
rest and its own "how this is worked out":

- **Your range** — the middle half of your own prices, the number to quote from.
- **Momentum** — this tour's book rate against every tour before it.
- **Price trend** — what a party is worth this tour against your history.
- **Follow-through** — appointments as a chain: arrival against closing,
  with the bigger leak named.
- **Prime hours** — your busiest hour against your best-paid one.
- **Repeat value** — what a returning guest pays against a new one.
- **Streak** — the run of consecutive booked tickets you are on right now.

And two new group readings: **Week over week** (last completed week against
the one before, volume and book rate) and **The floor's weekend** (how much of
everyone's work lands on Friday and Saturday).

### The carousel

Findings now show one at a time, moved with a gold arrow either side of a
"3 of 13" counter, with dot navigation on wide screens. The whole set renders
up front and the track slides on a transform, so changing insight never
rebuilds the page, never loses the scroll position, and never closes the open
panel. Arrows disable at the ends, dots jump straight to a finding, everything
is reachable by keyboard, and the counter is announced politely. The
hover-to-reveal method text still works inside a slide.

### Gilded light instead of confetti

The emoji celebration — falling hearts, dollar signs and DOM fireworks — is
gone, replaced by a canvas drawn in the site's own metal: a soft pink-to-gold
bloom out of the save button, a hairline gold ring, motes of gold dust that
rise and twinkle, and, on the biggest nights, slow glints of light crossing
the dark the way light catches a polished edge. Still tiered by the ticket
(quiet · booked · $5k · $10k), still warm rather than sad on a no-show, still
absent entirely for anyone who has asked for less motion, still gone from the
DOM within five seconds. Scales with the screen, caps device-pixel ratio at
2, and draws nothing interactive — the canvas never intercepts a click.

### Polish

- Slides carry a gold hairline top edge and a richer face than the flat grid
  items they replace; group findings get the same frame as personal ones.
- Tabular numerals everywhere figures line up in columns — stat numbers,
  tables, counters — so 7 and 700 occupy honest widths.
- Insight footnotes now state how many findings there are and how to move
  through them.

## 2.28.0

- **Changing tab sweeps the page**, the same band of light that runs across the
  save button, at page scale. It runs once per change, only when the tab
  actually changes, and not at all for anyone who has asked for less motion.
- **The tab bar has weight.** It is taller (64px against 52px) and the track is
  now recessed — dark at the top, a lit rim at the bottom, a soft shadow
  beneath. The chosen tab sits proud of it with a light top edge, a darker
  underside, a gloss across its upper half and a shadow under it, so it reads
  as a raised control rather than a coloured word.
- **Version A — Closed Beta** now sits under the wordmark in light grey, on the
  app header and the sign-in screen.
- **The green is emerald rather than mint.** The old pair sat at 33–45%
  saturation, which is exactly what made it look chalky; the new pair is the
  same hue at 78–80%. Fills use #12a06a and text #16b37c, which holds 7.3:1
  against the page — better contrast than the mint it replaces, and it reads as
  a jewel rather than a pastel.

## 2.27.2

**The form no longer rebuilds the whole page every time a field changes.**

Choosing anything redrew the entire tab, which threw away the very control
being used: focus was lost, the page jumped back to the top, and on a phone the
native picker closed onto an element that no longer existed. Each choice worked
in the data but felt broken on screen.

- The form now sits in its own node and only that node is redrawn on a field
  change — the ticket list, the figures and the scroll position are left alone.
- Focus is put back on the field just used, so a keyboard run through the form
  is uninterrupted.
- Changing tab, saving, editing and deleting still redraw the page, as they
  should.

**The whole ticket system is now tested end to end**, under a stub that records
the app's real listeners and fires input, change and click in browser order —
46 checks across ten areas:

1. every dropdown keeps its choice through the click that follows
2. the placeholder clears a field
3. conditional fields appear and disappear correctly
4. typed values survive a later dropdown change
5. what is sent matches what was chosen, including transport expanding to its
   three stored columns
6. a walk-in is always sent as kept
7. the test flag sets and clears
8. editing loads every field back, including transport collapsed to one choice
9. every option in every list is reachable
10. only the form is redrawn, and focus returns to the field used

## 2.27.1

**Fixes the ticket type sticking on Appointment.**

Choosing an option in a dropdown fires a **click** as well as a change, and the
click handler matches anything carrying `data-field` — which the dropdowns do.
So every selection ran twice: the change set the value, then the click ran with
no value at all and fell through to the guard that defaults the type to
appointment. Ticket type snapped back to Appointment; the other dropdowns
silently cleared themselves.

- Clicks originating from a dropdown are now ignored, since a dropdown reports
  through change.
- The field setter refuses a call with no value rather than clearing or
  defaulting the field, so nothing can do this again from another direction.

**Tested against real events, not just state.** The form now runs under a stub
that records every listener the app registers, then fires change and click in
the order a browser does. Nine dropdown selections are checked to survive the
click that follows, alongside the pill path still clearing when pressed twice,
and the rules still firing — choosing a walk-in marks it kept, going back to an
appointment clears it. This runs on every build.

That last part is the lesson: the earlier tests called the setter directly and
passed, because the bug was in which handlers a browser fires and in what
order. Only driving the real listeners caught it.

## 2.27.0

**Breakdowns collapse, one open at a time.**

Every section below the headline is now a panel with a heading you press. A
**−** marks the open one, a **+** the rest. Opening one closes the other;
pressing the open one closes it, leaving just the headings.

- **My insights** has six: what your log suggests, personal insights, kept
  against no show, party types, every segment, tour history.
- **Everyone** has four: group insights, party types, every segment, the weeks
  before.
- **This tour and This week are never panels.** They are what each page is for,
  and putting them behind a press would ask people to work for the thing they
  came to see. Both stay open above the panels, with the headline figures.
- A closed panel renders no body at all, so a long history costs nothing until
  it is asked for. My insights is down to roughly a third of the markup it was.
- Headings are reachable by keyboard and carry `aria-expanded`, so the state is
  announced rather than only drawn.
- The chart heading lost its "by day" suffix and the segment table is now just
  *Every segment* — the toggle inside says which grouping is in use, and a
  panel heading should read as a name.

The wrapper that turns a card into a panel lifts the heading out of the card
and drops the card's own frame, which is fiddly enough to be worth testing:
nine assertions cover it, including that a nested section inside a card
survives intact.

## 2.26.0

- **Average party is now a headline figure on My insights**, in place of the
  booked total. What a party is worth is the number worth reading at a glance;
  the total is context and has moved to the sub-line, with the priced count
  beside it.
- **The tour in progress sits underneath it.** The cell reads the trimmed
  average across everything logged, then *this tour $X* below — so the figure
  you are working against now is visible without scrolling to the tour card.
  On a test log those read $867 overall against $1,250 this tour, which is the
  comparison that makes the number useful.
- Both are trimmed averages, matching every other average in the app, and both
  mask with the amounts toggle.
- With no prices logged the cell reads *no prices added* rather than a zero.
- Six assertions added, now 144.

## 2.25.1

**Fixes the appointment show rate reading 100% while no-shows were visible
elsewhere.**

The cause was the two sides of the app disagreeing about what an appointment
is. The browser treated a ticket with no `kind` recorded as an appointment; the
server required the word "appointment" exactly. Rows written before the kind
column was always populated therefore counted as appointments in the ticket mix
but were left out of appointment attendance — so their no-shows appeared in the
overall no-show count while the show rate ignored them.

Reproduced with twenty kept appointments and six no-shows on rows with no kind:
the rate read **100%** with six no-shows plainly counted. It now reads 77%.

- Both sides now resolve a ticket's kind the same way: anything that is not a
  request, lineup pick, bar walk-in or pull-in is an appointment.
- The rule that only an appointment can fail to show is now applied on **read**
  as well as on write. A walk-in marked as a no-show on an old row is read as
  kept, so the overall no-show figure and the appointment one always agree.
- The segment definitions on both sides resolve kind the same way too, so the
  Appointments row and the headline can no longer disagree.

**Testing added, and it runs on every build from now on:**

- Six batches — clean logs at 150 and 600 tickets, logs with a quarter of rows
  missing their kind at 150, 600 and 2,000, and a hand-built batch of awkward
  corners — are aggregated by both the server logic and the real browser code
  and compared field by field. All nineteen figures agree on every batch.
- A 900-ticket log with mixed legacy kinds is checked against thirteen
  invariants: the ticket mix sums to the total, every no-show is an appointment
  no-show, ticket-type segments partition the log exactly, tours account for
  every ticket once, day rows sum to the whole log, and the four weeks count
  each ticket in range once.

## 2.25.0

- **The ticket form is dropdowns rather than rows of pills.** Ticket type,
  guest history, transport, attendance, outcome, price visibility and the test
  flag are each a single control now. A field with five choices was a row of
  five targets that wrapped onto two lines on a phone; a dropdown is one line
  whatever it holds, and on a phone it opens the system picker, which is far
  easier to hit than a small pill.
- **A chosen value still carries its colour.** The control takes the tone the
  pill had — amethyst for an appointment, green for kept, red for a no-show —
  so the form still reads at a glance once filled in.
- Party types stay as they were: a multi-select, since one ticket can carry
  several and a plain dropdown cannot express that.
- **Every rule survived the change**, and the tests now prove each one against
  the dropdown path: choosing a walk-in still forces attendance to kept, going
  back to an appointment still clears it, a no-show still clears the outcome,
  price and reason, and omitting a price still clears the amount.
- One difference worth knowing: a pill cleared itself when pressed twice, which
  a dropdown must not do. Choosing the same option again now leaves it set;
  the placeholder row at the top of each list is how a field is cleared.
- The field logic moved into one function shared by both paths, so a rule
  cannot hold for one control and not the other.
- Fourteen assertions added, now 138.

## 2.24.0

A layout and repetition pass over both tabs.

**Repetition removed.**

- The **ticket-mix bars** are gone from My insights. Ticket mix already appears
  in the headline sub-line and again as rows of the segment table; a third
  telling in bar form said nothing new.
- The **day-by-day table** is gone. It restated the chart immediately above it
  in another shape.
- On the Everyone tab, the weekly bars no longer print a show rate above each
  column, because the table directly beneath carries it. They print ticket
  volume instead, which is what the bar height means.
- My insights is down from ten cards to eight, and from 32 KB of markup to 25.

**Layout.**

- **Boxes in a row now end level.** Every paired card takes the height of the
  taller one, so a short card no longer leaves a block of empty space beside a
  tall one — that was the source of the odd gaps.
- **Figures are centred in their cells**, so a strip of four or six reads as
  one object rather than a row of left-aligned fragments.
- **Content width narrowed from 1560px to 1340px.** At the old width a table
  row stretched far enough that the eye lost the line between the label and
  the figure.
- **The chart is taller** — 260px against 215px — with wider gaps and softer
  corners on the bars, and it now sits in a card of its own rather than
  squeezed beside a column of prose.
- Each headline strip now says what it covers — *Everything you have logged*,
  *Everything the floor has logged* — so it is not mistaken for a repeat of the
  tour or week beneath it.
- On the Everyone tab, group findings sit beside the party ranking, and the
  segment table takes the full width it needs.

## 2.23.0

**My insights is reordered around the tour you are on.**

The order is now: headline figures, **this tour**, the two insight boxes, ticket
mix and the timeline, party types and segments, day by day, then **tour
history** at the end.

- **This tour is the featured card**, directly under the headline figures,
  carrying the same weight as *This week* on the Everyone tab.
- **Tour history moved to the bottom.** It is reference, not a headline — what
  happened in June should not sit above what is happening now.
- **The two insight boxes sit side by side** rather than stacked. Ten personal
  findings and the correlations used to be two full-width cards one after the
  other; pairing them halves the distance to the breakdowns below.
- **Paired cards now end level.** They previously sized to their own content,
  so a short card left a block of empty space beside a tall one. Both now take
  the height of the taller, and a scrolling box inside grows to fill it rather
  than leaving a gap.
- Vertical spacing between sections tightened from 26px to 22px.

Six assertions added covering the order itself, so it cannot drift back.

## 2.22.0

- **Kept and missed are now obviously different on the bars.** They were pink
  against rose — close enough to read as one colour. Kept is green (#3fa87d),
  missed is red (#d4455f) **with a diagonal stripe**, so the two are told apart
  by pattern as well as hue and survive colour blindness.
- **Up to ten findings on each side**, personal and group, inside a box that
  scrolls rather than stretching the page. Raised from six.
- **Two more group findings** to fill the space: *Repeat business* (the share of
  tickets from guests who had been before) and *Prices shared* (how much of the
  group picture rests on real prices rather than private or omitted ones).
- **Every finding explains itself on hover.** Rest on one — or tab onto it, they
  are all keyboard reachable — and a paragraph unfolds saying exactly how the
  figure was arrived at, including the minimums it had to clear. For example,
  *The usual range*: "Sorts every shared price and takes the 25th and 75th
  percentile — the middle half. Half of all parties fall inside this range,
  which makes it more use than an average when deciding what to quote. Needs at
  least eight shared prices."
- The explanation unfolds in place rather than floating, so the scrolling box
  never clips it, and it does not animate for anyone who has asked for less
  motion.
- Each card now says how many findings it holds, so it is clear there is more
  below the fold.
- Nine assertions added, now 113.

## 2.21.0

- **Prices by category are personal only now.** The Everyone tab's segment
  table has lost its *Total* column, and the pooled party-type card no longer
  shows a figure per type. Both keep their counts, show rates and book rates.
- The same figures remain in full on My insights, where they are your own.
- The pooled tables say where the prices went rather than leaving a gap, and
  the segment table is simply one column narrower rather than showing a dash in
  every row.
- What stays group-wide is the average party, the potential no-show value and
  the shares in Group insights — none of which is a price attached to a
  category.
- Seven assertions added, including a check that both tables keep their headers
  and cells balanced in either mode.

## 2.20.1

Plainer wording in Group insights.

- **"Punches above its weight" is now "Most profitable."** The old label was a
  figure of speech standing in front of the actual point.
- **"Takings" is gone throughout**, replaced with "the money":
  - *7% of the tickets but 22% of the money* — was *"% of takings"*
  - *of all the money booked comes from the biggest tenth of parties*
  - *38% of the tickets, 25% of the money*
- Two other roundabout lines straightened: *"volume and takings are not landing
  on the same day"* became *"the busiest day and the best-paying day are not
  the same"*, and *"they spend above their share"* became *"they pay more than
  their share of the tickets suggests."*
- Code comments updated to match, so the source reads the way the page does.

## 2.20.0

**The Everyone tab is reordered around the week in progress.**

- **This week now leads**, in its own featured card with larger figures:
  tickets and the daily rate so far, parties and the share of decided, the
  appointment show rate, the average party with how many priced tickets it
  rests on, and what has been booked so far. It says which day of the seven it
  is on, so a Tuesday is never mistaken for a finished week.
- **Last week's finished numbers run underneath it** — tickets, parties and
  average — because a part-week means nothing without knowing where the last
  one ended up. The average also says whether it is up or down against it.
- **The four-week table moved to the bottom** and is now headed *The weeks
  before*. It is history rather than the headline, and reads better as the
  thing you scroll to.

The order down the tab is now: headline figures, this week, group insights,
party types and segments, then the weeks before.

## 2.19.1

- **Tickets a day is gone; parties booked a day takes its place.** How many
  tickets came through says how busy the floor was, which is not the person's
  doing. How many closed a day is the figure they actually influence.
- It sits on the *Parties* figure in both places — the tour summary and the
  tour history row — with the share of decided beside it. The *Tickets* column
  is now a plain count.
- On a test tour of 12 tickets across 5 days it reads **1.0 parties a day**
  rather than 2.4 tickets a day, which is the number worth carrying into the
  next tour.

## 2.19.0

- **"Run" is now "tour" everywhere** — the section heading, the grouping toggle,
  the table headers, the footnotes and the internal comments. Nothing on screen
  says run any more.
- **Every tour has its own average party price.** It sits on the *This tour*
  summary in place of the raw booked total, which now runs beneath it as a
  sublabel with the number of priced tickets behind it. It is a trimmed
  average, so one unusual night does not carry the figure.
- **Tour history** added to My insights: every tour so far, newest first, one
  row each — dates and length, tickets with a per-day rate, parties with the
  share of decided, requests, no-shows with the kept rate beside them, average
  party, and total booked. Up to twelve tours, and the one in progress is
  marked.

  From a three-tour log the average party read $669, then $963, then $1,100 —
  which is the sort of movement that only shows up when tours sit in a row.
- With only one tour logged, the card says so rather than showing a table of
  one, since there is nothing to compare against yet.
- Eleven assertions added, now 91.

## 2.18.0

- **Walked value is removed** — the figure, the explanatory line beneath it and
  the calculation behind it.
- **Potential no-show value takes its place, on both tabs**, each worked out
  from its own average:
  - **My insights** values the appointments you missed at your own trimmed
    average booked price.
  - **Everyone** values the floor's missed appointments at the group's trimmed
    average shared price.
  - So four missed appointments might read **$2,500** against your own $625
    average, while the floor's forty read **$32,800** against the group's $820.
    Neither borrows the other's numbers.
- Each carries the likely span beneath it — the middle half of the prices it
  was calculated from — so the headline amount has its uncertainty attached
  rather than stated separately.
- The separate range findings in Personal insights and Group insights are gone,
  since the stat now says the same thing in one place.
- The figure is suppressed when there is nothing to value it with, and the span
  is dropped below four prices while the amount still shows.
- The Everyone strip is five across; the personal strip stays six.

## 2.17.0

- **Cost of no-shows is now potential cost of no-shows, given as a range.** A
  single figure claimed a precision it never had: nobody knows what a party
  that never arrived would have been worth. The range spans the middle half of
  actual booked prices — the 25th to 75th percentile — because that is the span
  half of parties genuinely land in.
- **Calculated on both sides.** Personally it uses your own booked prices; on
  the Everyone tab it uses the group's. So four missed appointments might read
  *$2,000 – $2,800* on your own log and the floor's forty might read
  *$24,000 – $42,000*, each against the prices that produced them.
- Both say plainly that it is what might have been on the table, not money
  lost. A guest who was never going to book was never money in hand.
- Minimums on both: four of your own prices personally, eight group-wide.
  Below that, neither appears.
- Nine assertions added, now 87.

## 2.16.0

- **The pooled takings total is gone from the Everyone headline.** In its place
  is **Average party** — the trimmed average of every shared price, with how
  many prices it covers and how many outliers were set aside. What a party is
  worth is the figure worth reading; what the floor took in total is not
  something everyone needs on screen.
- **Each week now documents its own average.** The four-week table gained an
  *Average party* column showing that week's average and how many priced
  tickets it rests on, so the figure can be read week by week rather than only
  as one running number.
- **The week's takings sit at the end of its row**, in a *Week total* column.
  The week still running is marked *so far*, so a partial week is never
  mistaken for a weak one.
- Copy updated throughout: the masking control now says averages cover only the
  bookings whose price was shared, rather than totals.
- Seven assertions added, now 78.

## 2.15.0

- **Requests booked** now has its own figure on My insights, showing how often
  a request closes and out of how many decided. It was previously buried as one
  row of the segment table.
- **The same figure group-wide**, in Group insights, set against appointments:
  *"67% of requests book, against 71% of appointments — 4 points worse."* Two
  very different conversations, and the gap is the point.
- **Walked value** on My insights: the parties that showed up and did not book,
  valued at your own trimmed average booked price.
  - A **walk is not a no-show**. A walk showed up and the conversation did not
    close; a no-show never arrived. The figure counts only the former, and the
    two are never mixed.
  - It uses the trimmed average for the same reason the group average does: in
    testing, one $26,000 night in the log would have valued four walks at
    $11,764 on a plain average against $2,600 trimmed.
  - A line beneath calls it an estimate of what was on the table rather than
    money lost, because that is what it is.
- The personal statistics strip is six across on a wide screen, three at tablet
  width, two on a phone.
- Eight assertions added, now 71.

## 2.14.0

**A trimmed group average under Shared prices.** The plain average is at the
mercy of one unusual night: adding a single $25,000 party to a fifteen-ticket
spread moved it 230%, while the trimmed average moved 4%. The headline figure
now sets aside the top and bottom tenth and averages the rest, and says how many
values it set aside. Below ten prices there is nothing to trim, so it falls back
to the plain mean rather than pretending.

**Group insights** — findings that exist only because everyone's tickets sit
together, one line each, three to a row on a wide screen:

- **The usual range** — the middle half of shared prices, with the midpoint.
  More use than an average when deciding what to quote.
- **Where the money is** — what share of takings comes from the biggest tenth
  of parties. A floor living on its big nights looks very different from one
  with an even spread.
- **Punches above its weight** — the party type whose share of takings most
  exceeds its share of tickets. Overnight at 6% of tickets and 22% of takings
  is the sort of thing no single log would show.
- **Busiest against best paid** — the hour with the most tickets is often not
  the hour with the highest average.
- **The night that closes** — book rate by night, best against worst.
- **Where no-shows land** — the night whose appointments fail most, shown only
  when it clears 25%.
- **Cost of the no-shows** — missed appointments at the trimmed average.
- **New guests** — their share of tickets against their share of takings, which
  answers whether chasing new business or repeat business pays better here.

Each has a minimum before it appears, and the highest and lowest single prices
are deliberately never shown — on a small floor those identify one person's
night. Nothing here can be traced to an individual.

The hour and weekday figures are folded from the same single pass, so this
costs no extra queries. Four assertions added to the suite, now 63.

## 2.13.0

A test, clean-up and speed pass over the whole app.

**The log was the bottleneck, not the queries.** It rendered every ticket it
had: at a thousand tickets that was 838 KB of markup written in one go, rebuilt
every time a toggle was pressed. It now shows forty at a time with a *Show more*
control, so the markup is a flat ~38 KB whatever the log holds, and a re-render
costs 3 ms instead of 94 ms.

| Tickets | Log markup before | After |
|---|---|---|
| 1,000 | 838 KB | 38 KB |
| 3,000 | ~2.5 MB | 39 KB |

**First load, measured:** about 127 KB over the wire — 2.5 s on slow 3G, 0.6 s
on fast 3G. All three tabs render in 44 ms on a 3,000-ticket log.

- **Fonts trimmed** from eleven weight files to eight, weight 800 folded into
  700, and a preconnect to the font host so they are not waiting on DNS.
- **Celebrations scale to the screen.** A phone now animates roughly a third of
  the pieces a desktop does, with one burst ring instead of two. It looks the
  same on a small screen and costs far less.
- **Dead code removed:** twelve stylesheet rules left over from when transport
  was multi-select, and two unused functions from the old week comparison.
- Two output values made explicitly safe at the point of printing rather than
  relying on a cast further up.

**Testing.** There is now a 59-assertion logic suite covering counting and test
exclusion, appointment-only show rates, run detection, Thursday-to-Wednesday
weeks, transport mapping, the edit round trip, celebration tiers, the minimums
that keep correlations and observations quiet on thin data, party ranking, and
rendering every tab against a full log, a single ticket, an empty log and a log
of nothing but tests. It runs as part of validation, alongside the tab render
check added in 2.12.1.

## 2.12.1

Two crashes fixed, both mine.

- **My insights was blank.** The 2.12.0 change that dims the Everyone tab while
  it refreshes was applied by matching a line of markup — and that same line
  appears in My insights, so the patch landed in both places. My insights ended
  up referring to a variable that only exists in the house view, which throws
  and takes the whole tab down. Reverted there; the house view keeps it.
- **The Everyone tab was throwing too**, and had been since 2.7.0. The
  four-week card built its rows without carrying the week boundaries, then
  asked for a label that needs them. That is the more likely cause of the tab
  seeming slow — it was not slow, it was failing after the data arrived.
- Both would have been caught by running the code rather than parsing it, so
  validation now renders every tab against a stub DOM — a full log, an empty
  one, and one holding nothing but test tickets — and fails if any of them
  throws.

## 2.12.0

**The Everyone tab was slow because it ran 22 full-table queries per load** —
one for the totals, one for the daily rows, and one for each of the twenty
segments, eleven of which were party types. Now it runs **one**.

- A single query reads only the columns the figures need, and the totals, the
  daily rows and every segment are folded out of that one pass in PHP. The
  segment definitions moved from SQL fragments to predicates.
- The result is cached for 90 seconds, and every ticket written — created,
  edited or deleted — clears that cache immediately, so the pooled view is
  quick without ever being stale.
- Added a `(is_test, occurred_on)` index, so the remaining scan skips test
  tickets rather than reading and discarding them.
- **The tab no longer blanks while refreshing.** Figures already on screen stay
  put and dim slightly while newer ones arrive. Only the first load shows a
  skeleton, which now has the shape of the page rather than a line of text.
- Saving a ticket marks the pooled figures stale instead of discarding them, so
  returning to the tab shows the old numbers instantly and updates in place.

## 2.11.0

- **Test ticket toggle.** Every ticket now carries a *Real ticket / Just
  testing* choice. A test ticket saves, edits, appears in the log and behaves
  in every way like a real one — it is simply left out of every figure.
- Excluded from **both** sides:
  - Personally: totals, appointment show rate, book rate, money, the timeline,
    segments, party types, the run summary and the observations all build from
    one filtered list, so a test can't move any of them.
  - House-wide: the three aggregate queries — totals, daily rows and every
    segment — carry `is_test = 0`, so a test cannot reach the Everyone tab at
    all, not even as a count.
- Tested with two junk $99,999 tickets in a five-ticket log: the real booked
  total stayed at $800 and the show rate at 50%, while both tests remained
  visible in the log.
- Test tickets are dimmed in the list, marked with a **Test** chip and a dashed
  spine, and flagged in the CSV export. A line on My insights says how many are
  being left out, so the gap between the log and the figures is never a mystery.
- The flag can be turned on or off by editing a ticket, so a real one logged by
  mistake during a demo can be corrected rather than deleted.

## 2.10.0

- **Tickets can be edited.** Every saved ticket now carries an *edit* control
  beside *remove*. Editing loads the whole ticket back into the form — day,
  time, type, guest, transport, party types, attendance, outcome, price and
  private note — so anything can be corrected or a note added after the fact.
- The form says *Editing ticket* with a pink edge while it is rewriting rather
  than writing, and offers *Update ticket* and *Cancel*.
- **An edit is a correction, not an occasion.** No confetti: the ticket simply
  glows for a moment so you can see which one changed.
- **Creating and editing share one validation function on the server**, so a
  rule cannot hold on one path and not the other. An edit cannot turn a bar
  walk-in into a no-show, attach a price to an omitted ticket, or store two
  kinds of transport, exactly as a new ticket cannot.
- Updates are scoped to their author with the same `WHERE user_id` clause as
  reading and deleting, so a crafted request naming somebody else's ticket
  updates nothing.
- Deleting the ticket currently being edited drops out of edit mode cleanly.

## 2.9.0

- **Thumbs up is gone.** Sparkles and pink hearts in its place: ✨ 💖 💕 for the
  booked tiers, 💗 alongside the hearts for a no-show, 🌸 added at the top tier.
- **Nothing with a face spins any more.** A glyph with an up looked wrong
  tumbling end over end, so rotation is now limited to the flat marks — dollar
  signs and stars. Everything else sways and breathes on the way down instead.
- **Everything runs longer and moves more.**
  - Pieces fall for 2.3–3.8s rather than 1.3–2.4s, on a path that drifts one
    way, crosses back, and drifts again, so nothing falls in a straight line.
  - They arrive in two waves, so the screen keeps moving instead of emptying
    all at once.
  - Two rings burst from the button rather than one, the second a beat behind.
  - Two shock rings instead of one, and the wash holds through the middle of
    the run rather than fading immediately.
  - Fireworks: eight shells rather than six, 22 sparks each rather than 16,
    rising more slowly and hanging longer before they fall.
  - The whole thing clears at 5.6s, against 3.2s before.
- A $10,000 ticket now puts around 300 pieces on screen.

## 2.8.0

- **Gold is the logo and nothing else.** The seal and the wordmark keep the
  metal; buttons, tabs, section marks, the ticket spine, focus rings and the
  hairlines have all moved off it. Hairlines are now a neutral white at 9%.
- **Categories have their own colours.** Green and red were doing two jobs at
  once — appointment and request on one hand, kept and missed on the other.
  Ticket types, guest history, transport and party types now use a jewel set:
  amethyst, teal, lapis, orchid and steel. Green means kept or booked, red
  means missed or didn't book, and neither means anything else.
- Pink is the interface accent: the save button, the active tab, section marks
  and focus rings.
- **Options sit centred and share the row.** Each choice in a group takes an
  equal share of the width with its label dead centre, so a set of choices
  reads as one control. The tick that used to sit left of the party-type labels
  is gone — the fill already says which are chosen.
- **Section titles now sit above the controls in the hierarchy**: 18px sentence
  case, against 15px on the buttons beneath them. They were previously 11.5px
  uppercase, which read as smaller than the things they introduced.

## 2.7.0

- **The Everyone chart runs Thursday to Wednesday, four weeks at a time.** Day
  by day was noise at house scale. Weeks are always four buckets, so a quiet
  week reads as quiet instead of disappearing from the run of dates, and the
  week still running is dimmed and outlined rather than passed off as a short
  one.
- **Repetition removed from the Everyone tab.** It was stating the same facts
  three ways. Gone:
  - the fourteen-row day table, which restated the chart;
  - the last-14-days-against-the-previous-14 comparison, which the four weeks
    now show directly;
  - the ticket-mix and guest-history share bars, which repeated the headline
    counts and the segment table;
  - the party-type rows in the segment table, which the ranked party card
    already covers in more detail.
- What is left says each thing once: four headline figures, the four-week card
  carrying both the bars and the weekly figures, the ranked party types, and
  the segment table for everything that is not a party type.

## 2.6.0

**Gold that reads as metal.** A single value can only ever look like yellow
paint. Metal reads as metal because it carries a highlight, a midtone, a shadow
and a specular band at once — so the gold is now a seven-stop ramp within one
hue (#f7e7b8 → #d9b64f → #b8891f → #f0dc9a → #c39a2e → #8a6318 → #dcbc65),
running light-dark-light-dark the way a polished edge does. This is not the
multi-colour gradient that was removed in 2.5.0; every stop is the same metal.

- Buttons, the active tab, the seal, the wordmark, section marks and the ticket
  spine are all struck from it, with a light top edge and a dark underside so
  they sit proud of the surface.
- A specular band travels across the save button on hover.
- Amounts and gold text carry a shadow so they sit on the black rather than
  glowing off it.

**Less blocky.**

- Statistics are no longer four boxes: one strip between two hairlines, divided
  by short vertical rules, with the numerals up to 38px and given room.
- Cards lost their full outline. The hairline now starts bright at the top-left
  corner and fades out by the middle, so a card reads as a lit edge rather than
  a container.
- Tickets are perforated: notches cut out of the fold and a dotted gold rule
  where the stub tears, so a ticket reads as a ticket.
- The split is asymmetric (0.88 / 1.12) and the form column is sticky on wide
  screens, so the log scrolls against it instead of both scrolling as one slab.
- Vertical rhythm opened from 20px to 26px between sections.

## 2.5.0

- **No more gradients.** Every brand gradient is gone — buttons, tabs, toggles,
  chips, bars and the seal are all flat colour now. The six that remain are
  effects rather than decoration: the single-hue wash behind the save
  celebration, one sweep of light across a new ticket, and two barely-there
  vignettes on the canvas at 5%.
- **The neon green is gone.** Positive figures are a deep emerald (#4f9e7f)
  and negative a garnet rose (#cf6076) — still legible as green and red where
  it matters, without the mint glare.
- **Gold does the structural work.** Hairlines, card edges, the rule under the
  masthead and the stripe on every ticket are all thin gold at low opacity,
  which is what carries the luxury rather than colour intensity.
- Antique gold (#d4af37) and a deeper rose (#e0567f) replace the previous
  brighter pair, on a warmer near-black (#0a0a0b) with off-white text that is
  never pure white.
- The wordmark sets "Shift" in gold against "Log" in rose, flat.
- Resting toggles are now outline-only, filling with solid colour when chosen.
- Theme recoloured to match, login screen included.

## 2.4.0

- **Gold, pink and black.** The magenta-violet-cyan gradient is gone. Pink and
  gold on near-black, with the seal, buttons and rules all drawing from those
  two. The five categorical tones stay apart inside one family: pink, light
  pink, gold, light gold and bronze. Green and red remain, used nowhere but the
  data, where they mean better and worse.
- **The animation now depends on the ticket.**
  - No show — hearts filling the screen, in pink. Deliberately warm rather than
    a sad noise: a guest not turning up is not the fault of the person logging.
  - Booked under $5,000 — dollar signs.
  - $5,000 to $9,999 — dollar signs, heart eyes and thumbs up.
  - $10,000 and up — all of that, plus six fireworks that rise and burst.
  - Anything else, including a ticket that didn't book, gets a quiet sparkle.
- A booking with the price left off falls to the dollar-sign tier, since there
  is no figure to place it. A no-show takes precedence over any amount.
- The confirmation words follow the same tiers.
- The companion theme is recoloured to match, login screen included.

## 2.3.0

- **Run on run is now Personal insights.** The table comparing this run against
  the last is gone; in its place are correlations drawn across your whole log —
  which guests, transport, hours and ticket types actually behave differently.
  The "This run" summary beside it stays.
- Five dimensions are tested against three measures: transport, guest history,
  how the ticket came in, time of night, and weekend against midweek — each
  measured on book rate, appointment show rate, and average price.
- Every comparison needs enough tickets on **both** sides before it appears
  (four decided, three appointments, or three priced depending on the measure),
  and a gap wide enough not to be chance — twelve points, or twenty percent on
  price. The six strongest are shown, ranked by how far apart the two sides are.
- Each finding shows both sides as facing bars, green above red, with the raw
  counts underneath so the basis is always visible.

## 2.2.0

- **Transport is one choice**, not three yes/no rows: Limo · Outside driver ·
  Self drive · Unknown. It is still stored in the same three columns, so every
  ticket ever logged reads exactly as before, and the server clears any extra
  "yes" that arrives so a stored row can't contradict the form.
- **Narrower, quieter type.** Archivo for display and Manrope for the interface
  — both considerably less wide than Syne and Outfit — with uppercase tracking
  cut by roughly a third. Same size on screen, less distance for the eye.
- **Saving fills the window.** A wash of light out of the button, a ring pushing
  outward, and confetti falling the full width of the page, on top of the burst
  from the button itself. Around a second and a half.
- **Controls shift colour.** Pressed toggles now carry a three-stop gradient
  that slides into place and snaps to size; the party-type summary fills with
  the brand gradient as options are chosen, its counter turns cyan while open,
  and each tick pops as it lands.
- **The data stays plain.** Figures are near-white on neutral rows, table hover
  is a light wash rather than violet, and the stat rules are dimmed — so green
  and red mean only one thing: better and worse.

## 2.1.0

- **Pull-in** added as a fifth ticket type, joining appointment, request,
  lineup pick and bar walk-in.
- Like the other in-person types, a pull-in means the guest is already there,
  so it is held out of the show rate. The form doesn't ask about attendance for
  one, and the server forces it rather than trusting the request, so a pull-in
  can never be filed as a no-show. Segments made only of pull-ins report **n/a**
  for show rate rather than a meaningless 100%.
- Carried through the ticket mix bar, the segment tables, the day and run
  tables, the observations, and the CSV export, with its own magenta tone.

## 2.0.0

A visual rebuild, and two corrections to how time is measured.

**Runs, not weeks.** Calendar weeks were the wrong unit: a tour starting on a
Wednesday got cut in half by a Monday-to-Sunday split. Runs are now detected
from the log itself — a gap of five days or more starts a new one, so days off
mid-tour keep a run whole while going home ends it. Nobody marks anything. The
comparison is run-on-run and uses per-day figures, since two runs are rarely
the same length. The pooled view uses rolling 14-day windows instead, because a
run belongs to a person, not a house.

**No streaks, levels or milestones.** These were a mistake for this work: a
daily streak punishes exactly the pattern of three weeks on and then home, and
rewarding takings would turn a quiet week into a personal failure. All removed.
The effort went into the page itself instead.

**Saving a ticket now feels like something.** A confetti burst from the button,
the new ticket landing with a sweep of light and a violet glow that settles
after a moment, and a short varied acknowledgement rather than the same words
every time. All of it stands down under prefers-reduced-motion.

**Night edition.** Deep aubergine canvas with magenta-violet-cyan gradients,
glass surfaces with blurred backdrops, pill toggles that press and glow in
their own colour, chart bars with rounded caps, and tables as floating rows
rather than a ruled grid. Display type is Syne, interface is Outfit.

**Who is logging is gone**, in the interface and in the API — the house view
reports what happened, never who did or did not contribute.

The companion theme is updated to match, including the WordPress login screen.

## 1.12.0

- **"What your log suggests"** on My insights: plain-language findings drawn by
  correlating your own tickets, aimed at the decisions that move money.
  - Most popular party type, and its share of your tickets.
  - Most profitable party type by average price, against your overall average.
  - Popular-versus-profitable gaps, where something earns more per party but
    comes up less often.
  - Which party type books best, and which books worst.
  - New versus returning split, with unrecorded guest history excluded rather
    than silently counted.
  - Whether new or returning guests book better, and by how many points.
  - What appointment no-shows are worth at your average booking.
  - Busiest day against best-earning day, when they differ.
  - Which ticket type carries the highest average.
- **Every finding has a minimum sample.** The card stays quiet below five
  tickets, averages need three priced tickets, book-rate comparisons need four
  decided on each side, and comparisons only surface when the gap is wide
  enough to be real. A rate from three tickets is noise, and dressing it as a
  pattern would be worse than saying nothing.
- Findings respect the amounts toggle: anything carrying money is masked until
  amounts are shown.

## 1.11.0

- **Walk-in from bar** added as a fourth ticket type, alongside appointment,
  request and lineup pick.
- **The show rate now measures appointments only.** Requests, lineup picks and
  bar walk-ins mean the guest is already standing there, so counting them made
  the rate look better than it was — in testing, a log with four appointments
  (two missed) and six walk-ins read 80% the old way and 50% the new way. Every
  show-rate figure now uses appointments as its denominator: the headline stats,
  the chart labels, the segment table, the day and week tables, and the week
  comparison. Labels say "Appt show rate" so the basis is never ambiguous.
- Segments containing no appointments report **n/a** rather than 0% or 100%.
- **The form no longer asks.** Pick any non-appointment type and the attendance
  toggle is replaced by a line explaining the ticket counts as kept. The server
  enforces the same rule, so a crafted request cannot file a walk-in no-show.
- The attendance share bar is now "Appointment attendance: kept vs no show".
- Ticket mix, period tables and week comparison all carry the fourth type.

## 1.10.0

The categories added in 1.9.0 now run through the whole analysis rather than
sitting only in the segment tables.

- **Ticket mix is three-way.** Lineup picks were previously counted as requests
  by the mix bar; appointments, requests and lineup picks are now separate
  everywhere — the share bar, the headline sub-lines, and the day/week tables,
  which gained an `Appt / Req / Line` column.
- **Guest history share bar** on both dashboards: new · returning · ranch
  regular · unknown.
- **Party types card** on both dashboards: every type ranked by volume, with
  show rate, book rate and total beside each. A ticket can carry several, so
  these deliberately add to more than 100%.
- **Week over week** gained rows for new guests, returning guests and lineup
  picks, and the plain-language headline now mentions new-guest movement.
- **Day/week tables** gained a new-guests column.
- Share bars take any number of parts now, and drop empty ones from both the
  bar and the legend so a three-way mix never reads as five with two blanks.
- Server aggregates carry lineup and guest-type counts, so the house view gets
  the same breakdowns without exposing anything per person.

## 1.9.0

- **Picked from lineup** joins Appointment and Request as a ticket type, and
  gets its own row in the segment tables on both dashboards.
- **Party type**, a dropdown holding a multi-select: GFE, PSE, BDSM / Kink,
  Roleplay, 2-girl, Virgin, Couple, Nuru, Overnight, Straight sex, Blow job.
  Any number can apply to one ticket. Collapsed it shows a summary so the form
  stays short. Each type gets its own row in the segment tables, so show rate
  and book rate can be read per type, and every type appears on the stub as a
  chip and in the CSV export.
- The vocabulary is defined once on the server and sent to the browser, so the
  two can never drift. Only keys from that map can reach the database.
- **Type is easier to read.** Body size up to 17px, darker secondary and
  tertiary ink, heavier field labels, section headers and table headers, and
  larger captions. Buttons are noticeably bolder at 700 weight, and pressed
  toggles thicken to 600 so the on state reads at a glance.

## 1.8.0

- **Fills the page.** Themes cap page content at roughly 800px, which is what
  reduced the app to a long narrow column. Two fixes, either sufficient alone:
  a page template the plugin registers (**Page Attributes → Template → Shift
  Log — full width**), which keeps the theme's header and footer but drops the
  constraining wrapper; and an automatic viewport breakout applied to any page
  holding the shortcode, for themes that hide the template picker.
- The breakout also sets `overflow-x: hidden` on those pages only, since `100vw`
  counts the scrollbar and would otherwise add a horizontal scroll.
- Common theme container classes are neutralised, scoped to pages with the app.
- **Wide screens now hold two columns.** The week review, the segment table and
  the period table pair up side by side above 1180px rather than stacking, so
  the extra width carries content instead of margin.
- Content area up to 1800px with side padding that scales with the viewport.
- A **Page width** setting to switch the breakout off if a theme fights it.

## 1.7.0

- **Guest history toggle:** new guest · returning to me · new to me but a ranch
  regular · unknown. It appears on the ticket, on the saved stub, in the segment
  tables on both dashboards, and in the CSV export.
- **Notes moved onto the ticket.** The separate Notes tab is gone. Every ticket
  now has an optional private note that travels with it, stored in a column no
  aggregate query reads and returned only to its author.
- **Wider desktop layout.** Content area up to 1440px, and the log column now
  takes the larger share of the split rather than an even half.
- **Date and time no longer collide.** Native date and time controls carry an
  intrinsic minimum width wider than a narrow column, which forced them to
  overlap; they now shrink properly, and stack below 420px.
- **Cream is gone.** New palette: lilac-grey ground, white cards, violet accent,
  with teal, jade and rose carrying guest history, positive and negative states.

## 1.6.0

- **Personal notes.** A Notes tab with its own table, scoped to its author the
  same way tickets are. Notes are never counted, aggregated, or exposed to the
  Everyone tab — there is no endpoint that reads them for anyone but you.
- **Price visibility is now a three-way choice.** *Add & share* counts in your
  totals and the house total; *Add, keep private* counts in your totals only and
  is absent from every figure on the Everyone tab; *Leave it off* records no
  figure at all. Tickets carry a "Price private" chip so the choice stays
  visible. Existing prices are treated as shared, so nothing changes retroactively.
- **Depth.** Layered surfaces throughout: gradient card faces with an inset top
  highlight, three-stage shadows, a pressed-in tab rail, gradient chart bars and
  progress fills, and a brass edge on every ticket stub.
- **Tactile controls.** Toggles sit raised when off and press *into* the surface
  when on, with a colour wash matched to their meaning. Buttons lift on hover
  and depress on click.
- **Readability.** Base size up to 16.5px, larger labels and table text, and
  darker ink for stronger contrast against lighter surfaces.
- **Mobile.** Full-width layout rather than a squeezed column, 52px touch
  targets, a scrollable tab rail, transport toggles that stack to full width,
  and two-up statistics. Two breakpoints, at 780px and 460px.

## 1.5.0

- **Identity.** A wax-stamp seal — a script S in brass on a deep ink disc,
  ringed by a hairline — now appears on the sign-in card, the waiting screen
  and the app header. An earlier draft used a pointed oval with a centre dot;
  it read as an eye, which is the wrong signal entirely for a privacy-first
  log, so it was cut.
- **Typography.** Bodoni Moda for display (a didone: hairline serifs, heavy
  weights — feminine and bold at once), Jost for the interface, IBM Plex Mono
  retained for figures.
- **Palette.** Deep forest ink, blush-grey ground, pearl surfaces, and a
  restrained brass accent used only on hairlines, the mark, and active states.
- **Date and time fields fixed.** Native date and time inputs render taller
  than text inputs and align their values differently per browser, which is
  what made the row look ragged. Both now have an explicit shared height,
  normalised appearance, left-aligned values and a toned-down picker icon, so
  the pair sits flush.
- Uppercase letterspaced labels, refined tables, brass-topped ticket stubs, and
  a tightened spacing scale throughout. All functionality unchanged.

## 1.4.0

- **Everyone tab is collective only.** The per-person table is gone, and the
  API no longer sends per-person rows at all — the house endpoint returns a
  count of who is logging and nothing traceable to an individual. Nobody can
  see how any one person is doing, including administrators using the app.
- **Last week** section on both My insights and Everyone: tickets, show rate,
  parties booked and money, for the last completed Monday–Sunday week.
- **Week over week** comparison of the two most recently completed weeks, with
  a plain-language headline (ahead or behind, more or fewer parties, show rate
  movement) and a table of changes. Rate changes are in percentage points;
  counts and money show absolute and percentage change. An increase in no-shows
  is coloured as a decline rather than a gain.
- The week in progress is excluded, so a partial week never skews a comparison.

## 1.3.0

- Access code set to `RATPACK`. A one-time migration applies this to sites that
  already generated their own code; it runs once, so any later change made in
  **Settings → Shift Log** sticks.
- Approval is now automatic by default: anyone entering the correct code is
  active immediately and can log tickets and open the house-wide view.
- Approval mode is a setting again — switch to **Review each account** to
  restore the queue.
- The name field appears only when approval is manual. On automatic approval no
  name is collected, since there is no review for it to inform.
- Administrators are emailed whenever an account is created, in either mode.

**Note on this version:** with automatic approval, the access code is the only
thing between a stranger and the pooled figures of everyone using the log.
Individual logs stay private either way, but the Everyone tab is open to anyone
who has the code.

## 1.2.0

- Approval made mandatory. Pending accounts hold no capabilities at all: no
  ticket logging, no figures, not even an empty log of their own. The front-end
  scripts are not loaded for them.
- Sign-up asks for a name so an administrator can confirm the request. Stored in
  a single field, `sl_verify_name`, and deleted the moment the account is
  approved. Declining deletes the account and the name together.
- Usernames are randomly generated rather than derived from the email, so no
  name lands in `user_login` or an author URL where it cannot be changed later.
- Display name and nickname set to the anonymous handle at sign-up.
- Approval queue gained a decline action and a pending count on the menu item.
- Approval emails the person to confirm their account is live.

## 1.1.0

- Front-end sign-up form on the shortcode page, with Sign in / Create account
  tabs. Deliberately not WordPress core registration, which assigns the default
  role and leaves people without logging access.
- Access code option, honeypot field, and a five-attempts-per-hour-per-IP limit.
- Twelve-character password minimum.
- `shift_log_pending` role added.

## 1.0.0

- Initial plugin. WordPress accounts handle sign-in, passwords and resets.
- Ticket logging: day and time, appointment or request, three transport toggles
  with yes/no/unknown, attendance, outcome, and an optional party price the
  person can submit or leave off.
- Personal insights: rates, composition bars, a day/week chart, a segment
  breakdown, and a period table.
- House-wide insights from aggregate-only SQL. People appear by handle; no
  endpoint returns another person's ticket rows.
- Amounts masked on screen until revealed, and hidden again on reload.
- Admin settings for role access, pooled prices, and currency.
- Uninstall leaves ticket data in place unless explicitly opted in via
  `SL_DELETE_DATA_ON_UNINSTALL`.

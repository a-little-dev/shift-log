/* Shift Log — front end.
   Talks to the WordPress REST API using the logged-in cookie plus the
   wp_rest nonce. No credentials or account data are handled here. */
(function () {
	"use strict";

	var D = window.SL_DATA || {};
	var root = document.getElementById("sl-root");

	/* Party-type vocabulary. Mirrors sl_party_types() in includes/rest.php;
	   the API sends the same map, which overrides this on load. */
	var PARTY = {
		gfe: "GFE", pse: "PSE", bdsm: "BDSM / Kink", roleplay: "Roleplay",
		two_girl: "2-girl", virgin: "Virgin", couple: "Couple", nuru: "Nuru",
		overnight: "Overnight", straight: "Straight sex", bj: "Blow job"
	};
	if (!root) return;

	/* ---------------- state ---------------- */
	var state = {
		tab: "log",
		mode: "day",
		tickets: [],
		house: null,
		houseLoading: false,
		houseStale: false,

		showMoney: false,
		/* The seal is struck once, when the page first arrives. Every render
		   after that draws it settled — a mark that restamps itself whenever
		   a ticket is saved is a distraction, not an entrance. */
		struck: (function () {
			try { return window.sessionStorage.getItem("sl_struck") === "1"; } catch (e) { return false; }
		})(),
		/* The tour box plays its own arrival once, like the headline does.
		   The bar is tracked apart from the figure, since a goal may be set
		   long after the box first appeared. */
		stillTour: false,
		goalFilled: false,
		/* Set once the headline has played, so re-renders — a tab change, a
		   saved ticket — redraw it settled rather than replaying from zero
		   every time anything at all happens on the page. */
		stillRings: false,
		visible: 40,
		/* Which tour the log and the insights are reading. null means the
		   one that is running, or the most recent; "all" is the whole log. */
		scope: null,
		open: { insights: "observations", all: "group", weeks: null, past: "tours", pastlist: null },
		slide: {},
		tour: {
			/* The closed tour whose dates are being corrected, and the pair
			   being typed into. Held here rather than read off the inputs, so
			   a re-render mid-edit does not lose what was typed. */
			editId: null, editStart: "", editEnd: "",
			/* Seeded from the page, so the switch is right on the first paint.
			   `known` guards against the one thing worse than showing the
			   wrong state: asserting "out of house" when the answer never
			   arrived, which invites somebody to start a second tour on top
			   of the one already running. */
			open: (D.tour && D.tour.open) || null,
			history: (D.tour && D.tour.history) || [],
			progress: (D.tour && D.tour.progress) || null,
			known: !!D.tour,
			busy: false, just: null, moved: null, editing: false, error: "",
			goalEditing: false, celebrated: false,
		},
		admin: { on: false, unlocked: false, tab: "bugs", data: null, busy: false, error: "", filter: "open", login: "", who: null, diag: false },
		swept: false,
		partyOpen: false,
		editing: null,
		loading: true,
		status: null,
		form: blankForm(),
	};

	function blankForm() {
		var now = new Date();
		return {
			date: isoDate(now),
			time: pad(now.getHours()) + ":" + pad(now.getMinutes()),
			kind: "appointment",
			party_types: [],
			transport: null,
			attendance: null, outcome: null, guest_type: null, hotel_guest: null, price_mode: null,
			amount: "", reason: "", note: "", is_test: false,
		};
	}

	/* ---------------- helpers ---------------- */
	function pad(n) { return String(n).padStart(2, "0"); }
	function isoDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
	function fromISO(s) { var p = s.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
	function esc(s) {
		return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
			return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
		});
	}
	function prettyDate(s) { return s ? fromISO(s).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "—"; }
	function shortDate(s) { return s ? fromISO(s).toLocaleDateString(undefined, { month: "numeric", day: "numeric" }) : ""; }
	function prettyTime(hm) {
		if (!hm) return "";
		var p = hm.split(":"), h = +p[0];
		return (h % 12 === 0 ? 12 : h % 12) + ":" + p[1] + " " + (h >= 12 ? "PM" : "AM");
	}
	function num(v) { var n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.]/g, "")); return isFinite(n) ? n : 0; }
	function money(v) {
		var n = num(v);
		if (!n) return null;
		try { return n.toLocaleString(undefined, { style: "currency", currency: D.currency || "USD", maximumFractionDigits: 0 }); }
		catch (e) { return "$" + Math.round(n).toLocaleString(); }
	}
	function cash(v) { return num(v) ? (state.showMoney ? money(v) : "$•••") : null; }
	function pct(n, d) { return d > 0 ? Math.round((n / d) * 100) + "%" : "—"; }
	function pctNum(n, d) { return d > 0 ? (n / d) * 100 : 0; }

	/* ---------------- REST ---------------- */
	function api(path, opts) {
		opts = opts || {};
		return fetch(D.root + path, {
			method: opts.method || "GET",
			credentials: "same-origin",
			headers: { "Content-Type": "application/json", "X-WP-Nonce": D.nonce },
			body: opts.body ? JSON.stringify(opts.body) : undefined,
		}).then(function (r) {
			/* A failing endpoint does not always answer in JSON — a 404 from a
			   missing route or a 403 from a security plugin arrives as HTML.
			   Reading it as text first means the error says what happened
			   instead of "Unexpected token <". */
			return r.text().then(function (raw) {
				var j = null;
				try { j = raw ? JSON.parse(raw) : null; } catch (e) { j = null; }

				if (!r.ok) {
					var err = new Error((j && j.message) ? j.message : "Request failed (" + r.status + ")");
					err.status = r.status;
					err.code = j && j.code ? j.code : null;
					throw err;
				}
				return j;
			});
		});
	}

	/* ---------------- aggregation (own tickets) ---------------- */
	/* shared and kept ride along so a summed row — a week inside a tour, a
	   folded set of house days — does not silently lose the split between a
	   price shown to the floor and one kept to yourself. */
	var SUMMABLE = ["n", "appt", "req", "lineup", "bar", "pull", "g_new", "g_ret", "g_house", "g_unknown",
		"showed", "noshow", "a_showed", "a_noshow", "booked", "notbooked", "priced", "omitted", "amount",
		"shared", "kept", "sharedAmount"];

	function blankAgg() {
		var a = {};
		SUMMABLE.forEach(function (f) { a[f] = 0; });
		return a;
	}

	/** Fold pre-aggregated rows (the house endpoint sends these) into one. */
	function sumRows(rows) {
		return rows.reduce(function (a, r) {
			SUMMABLE.forEach(function (f) { a[f] += r[f] || 0; });
			return a;
		}, blankAgg());
	}

	/**
	 * Test tickets behave like real ones everywhere except here. Every figure
	 * on both dashboards is built from this list, so a ticket marked as a test
	 * cannot move a rate, a total or an observation.
	 */
	function counted() {
		return state.tickets.filter(function (t) { return !t.isTest; });
	}

	function testCount() {
		return state.tickets.length - counted().length;
	}

	var WALK_IN_KINDS = ["request", "lineup", "bar", "pull"];

	/* The words a ticket is described with, in one place. Written out twice —
	   once for the log, once for the window a badge opens — the same ticket
	   could end up described two different ways after any edit to either. */
	var KIND_LABEL = { appointment: "Appointment", request: "Request", lineup: "From lineup",
		bar: "Bar walk-in", pull: "Pull-in" };
	var KIND_TONE = { appointment: "c1", request: "c2", lineup: "c3", bar: "c4", pull: "c5" };
	var GUEST_LABEL = { "new": "New guest", returning: "Returning to me",
		house: "Ranch regular", unknown: "Guest unknown" };

	function kindLabelOf(t) { return KIND_LABEL[t.kind] || t.kind; }
	function guestLabelOf(t) { return GUEST_LABEL[t.guestType]; }

	/** One reading of a ticket's kind, shared by every count. */
	function kindOf(t) {
		return WALK_IN_KINDS.indexOf(t.kind) === -1 ? "appointment" : t.kind;
	}

	function tally(list) {
		var t = { n: list.length, appt: 0, req: 0, lineup: 0, bar: 0, pull: 0,
			g_new: 0, g_ret: 0, g_house: 0, g_unknown: 0,
			showed: 0, noshow: 0, a_showed: 0, a_noshow: 0, booked: 0, notbooked: 0,
			/* `amount` is your own money, shared and private together, which
			   is what your own screens should show. `sharedAmount` is the
			   part of it the floor can see — the only figure that can be
			   measured against the house totals, which are built from shared
			   prices alone. Comparing your own total against theirs would
			   flatter you by every price you kept to yourself. */
			amount: 0, sharedAmount: 0, priced: 0, omitted: 0, shared: 0, kept: 0 };
		list.forEach(function (x) {
			// Matches the server exactly: anything that is not one of the four
			// walk-in kinds is an appointment, and a walk-in cannot no-show.
			var kind = kindOf(x);
			var att = kind === "appointment" ? x.attendance : (x.attendance === "noshow" ? "showed" : x.attendance);

			if (kind === "lineup") t.lineup++;
			else if (kind === "bar") t.bar++;
			else if (kind === "pull") t.pull++;
			else if (kind === "request") t.req++;
			else t.appt++;

			if (x.guestType === "new") t.g_new++;
			else if (x.guestType === "returning") t.g_ret++;
			else if (x.guestType === "house") t.g_house++;
			else t.g_unknown++;
			if (att === "showed") t.showed++;
			if (att === "noshow") t.noshow++;

			// Only appointments can fail to show, so only appointments count
			// toward the show rate. Anything else is a guest already present.
			if (kind === "appointment") {
				if (att === "showed") t.a_showed++;
				if (att === "noshow") t.a_noshow++;
			}
			if (x.outcome === "booked") {
				t.booked++;
				/* A price counts only where the visibility was actually chosen.
				   Reading anything that is not "private" as shared meant a
				   booking with an amount but no mode — possible on tickets
				   written before the mode existed — was counted here as shared
				   while the server counted it as no price at all. That is one
				   screen disagreeing with the other about the same night. */
				var shared = x.priceMode === "included" && num(x.amount);
				var private_ = x.priceMode === "private" && num(x.amount);

				if (shared || private_) {
					// Both shared and private prices belong in your own totals.
					t.priced++;
					t.amount += num(x.amount);
					if (private_) { t.kept++; } else { t.shared++; t.sharedAmount += num(x.amount); }
				} else {
					t.omitted++;
				}
			}
			if (x.outcome === "notbooked") t.notbooked++;
		});
		t.marked = t.showed + t.noshow;
		t.aMarked = t.a_showed + t.a_noshow;
		t.decided = t.booked + t.notbooked;
		return t;
	}
	function withRates(row) {
		row.marked = row.showed + row.noshow;
		row.aMarked = (row.a_showed || 0) + (row.a_noshow || 0);
		row.decided = row.booked + row.notbooked;
		return row;
	}

	/* Build a gap-free day or week series from either own tickets or house rows. */
	/**
	 * Build the timeline. Grouping is by day, or by tour when the log has
	 * enough separation to have tours at all.
	 */
	function series(rows, mode, getDate, tickets) {
		if (!rows.length) return [];

		if (mode === "tour") {
			var tours = buildTours(tickets || rows.map(function (r) { return { date: getDate(r) }; }));
			return tours.slice(-8).map(function (t) {
				var inside = rows.filter(function (r) { return inTour(getDate(r), t); });
				var agg = inside.length && inside[0].n !== undefined ? sumRows(inside) : tally(inside);
				return Object.assign(withRates(agg), {
					key: t.key,
					label: tourLabel(t, true),
					full: tourLabel(t),
					span: t.span,
					activeDays: t.activeDays,
				});
			});
		}

		var groups = {};
		rows.forEach(function (r) { (groups[getDate(r)] = groups[getDate(r)] || []).push(r); });
		var keys = Object.keys(groups).sort();
		var out = [];
		var cur = fromISO(keys[0]), end = fromISO(keys[keys.length - 1]);
		while (cur <= end) {
			var k = isoDate(cur);
			var bucket = groups[k] || [];
			var agg = bucket.length && bucket[0].n !== undefined ? sumRows(bucket) : tally(bucket);
			out.push(Object.assign(withRates(agg), { key: k, label: shortDate(k), full: prettyDate(k) }));
			cur.setDate(cur.getDate() + 1);
		}
		return out.slice(-14);
	}

	/* ---------------- tours ----------------
	   Calendar weeks are meaningless here: a tour can start any day, so a
	   Monday-to-Sunday split cuts one in half. Instead a tour is detected
	   from the log itself — a stretch of active days, with a gap of five or more
	   days starting a new one. Nobody has to mark anything. */

	var TOUR_GAP = 5;

	function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
	function daysBetween(aISO, bISO) { return Math.round((fromISO(bISO) - fromISO(aISO)) / 86400000); }

	/**
	 * The tours this log knows about.
	 *
	 * A declared tour always wins over a guessed one. Where someone has used
	 * the toggle, the open tour is exactly what they said it was — start date
	 * to today — and closed tours come from their record. Only the stretch of
	 * log before any of that was declared is still inferred from gaps, so a
	 * person who has never touched the toggle sees what they always saw.
	 */
	function buildTours(tickets) {
		var declared = declaredTours();
		if (declared.length) {
			var earliest = declared[0].start;
			var before = tickets.filter(function (t) { return t.date < earliest; });
			return inferTours(before).concat(declared);
		}
		return inferTours(tickets);
	}

	function declaredTours() {
		var out = (state.tour.history || []).map(function (r) {
			return {
				/* Start and end both, so a tour that was reopened and closed
				   again on the same day cannot share a key with the one it
				   replaced — a collision there would scope the page to the
				   wrong set of tickets. */
				key: r.start + ".." + r.end, start: r.start, end: r.end,
				span: r.span || daysBetween(r.start, r.end) + 1,
				activeDays: r.activeDays || 0,
				declared: true,
				record: r,
			};
		});

		if (state.tour.open) {
			var today = isoDate(new Date());
			var start = state.tour.open.start;
			var endsAt = today > start ? today : start;
			out.push({
				key: start + ".." + endsAt, start: start, end: endsAt,
				span: daysBetween(start, endsAt) + 1,
				activeDays: 0, declared: true, running: true,
			});
		}

		return out.sort(function (a, b) { return a.start.localeCompare(b.start); });
	}

	function inferTours(tickets) {
		if (!tickets.length) return [];

		var days = {};
		tickets.forEach(function (t) { days[t.date] = true; });
		var dates = Object.keys(days).sort();

		var tours = [], run = [dates[0]];
		for (var i = 1; i < dates.length; i++) {
			if (daysBetween(dates[i - 1], dates[i]) >= TOUR_GAP) { tours.push(run); run = []; }
			run.push(dates[i]);
		}
		tours.push(run);

		return tours.map(function (r) {
			var start = r[0], end = r[r.length - 1];
			return {
				key: start + ".." + end,
				start: start,
				end: end,
				span: daysBetween(start, end) + 1,
				activeDays: r.length,
			};
		});
	}

	/**
	 * A kept tour record, in the shape the history table expects.
	 * The server worked these out at closing; nothing is recomputed here.
	 */
	function keptFigures(rec) {
		var aMarked = (rec.a_showed || 0) + (rec.a_noshow || 0);
		var decided = (rec.booked || 0) + (rec.notbooked || 0);
		var span = rec.span || 1;
		return {
			n: rec.n || 0,
			booked: rec.booked || 0,
			req: rec.req || 0,
			a_showed: rec.a_showed || 0,
			a_noshow: rec.a_noshow || 0,
			aMarked: aMarked,
			decided: decided,
			partiesPerDay: span ? (rec.booked || 0) / span : 0,
			pricedCount: rec.ownPriced || 0,
			// The trimmed average the server keeps with the record, so a closed
			// tour's average is the same figure here as on My insights.
			avgParty: rec.ownAvg != null ? rec.ownAvg : (rec.ownPriced ? rec.ownAmount / rec.ownPriced : 0),
			amount: rec.ownAmount || 0,
		};
	}

	function tourLabel(t, short) {
		var a = fromISO(t.start), b = fromISO(t.end);
		var opt = { month: "short", day: "numeric" };
		if (short) return a.toLocaleDateString(undefined, opt);
		return t.start === t.end
			? a.toLocaleDateString(undefined, opt)
			: a.toLocaleDateString(undefined, opt) + " – " + b.toLocaleDateString(undefined, opt);
	}

	function inTour(dateStr, tour) { return dateStr >= tour.start && dateStr <= tour.end; }

	/* ---------------- reading one tour at a time ----------------

	   The personal tabs used to read everything ever logged at once, which
	   answers a question nobody asks: across four months, is the booking rate
	   good? What a tour is worth, and whether this one is going better than
	   the last, are the questions — so the log and the insights are both
	   scoped to a single tour, and the whole log is one more choice rather
	   than the only one. */

	/**
	 * Every stretch a ticket can belong to, newest first.
	 *
	 * buildTours describes the stretches that are tours. A ticket logged
	 * while out of house falls between two of them and belongs to none — and
	 * a ticket that disappears from every screen because no bucket claimed it
	 * is a far worse outcome than an untidy bucket, so those are gathered
	 * into one of their own at the end.
	 */
	function tourScopes(tickets) {
		var tours = buildTours(tickets).slice().reverse();

		tours.forEach(function (t) {
			t.holds = function (d) { return d >= t.start && d <= t.end; };
		});

		var loose = tickets.filter(function (t) {
			for (var i = 0; i < tours.length; i++) {
				if (tours[i].holds(t.date)) return false;
			}
			return true;
		});

		if (loose.length) {
			var days = {};
			loose.forEach(function (t) { days[t.date] = true; });
			var dates = Object.keys(days).sort();
			var held = days;
			tours.push({
				key: "loose",
				loose: true,
				start: dates[0],
				end: dates[dates.length - 1],
				span: daysBetween(dates[0], dates[dates.length - 1]) + 1,
				activeDays: dates.length,
				holds: function (d) { return !!held[d]; },
			});
		}

		return tours;
	}

	/**
	 * Where a tour sits in the list.
	 *
	 * By key, never by identity: tourScopes() builds fresh objects every time
	 * it is called, so `list[i] === tour` compares two descriptions of the
	 * same tour and finds them different. That read as the arrows going dead
	 * after one step, because the position they were stepping from was always
	 * reported as zero.
	 */
	function scopeIndex(list, tour) {
		if (!tour) return -1;
		for (var i = 0; i < list.length; i++) {
			if (list[i].key === tour.key) return i;
		}
		return -1;
	}

	/** The tour the personal tabs are reading, or null when the scope is everything. */
	function activeTour(tickets) {
		if (state.scope === "all") return null;
		var list = tourScopes(tickets);
		if (!list.length) return null;
		for (var i = 0; i < list.length; i++) {
			if (list[i].key === state.scope) return list[i];
		}
		return list[0];
	}

	/** A ticket list narrowed to one tour; the same list back when the scope is everything. */
	function inScope(list, tour) {
		if (!tour) return list;
		return list.filter(function (t) { return tour.holds(t.date); });
	}

	/** What the scope is called, and what to say underneath it. */
	function scopeTitle(tour) {
		if (!tour) return "Everything you have logged";
		if (tour.loose) return "Logged outside a tour";
		return tourLabel(tour);
	}

	function scopeSub(tour, list, at, total) {
		if (!tour) {
			return list.length + (list.length === 1 ? " ticket" : " tickets") + " in all";
		}
		if (tour.loose) {
			return list.length + (list.length === 1 ? " ticket" : " tickets") +
				" on days no tour covers";
		}
		var live = tour.running || (!tour.declared && at === 0);
		return tour.span + (tour.span === 1 ? " day" : " days") +
			(live ? " · running now" : "") +
			" · tour " + (total - at) + " of " + total;
	}

	/**
	 * The control that moves between tours.
	 *
	 * Arrows step through them, newest first, and the chip steps out to the
	 * whole log. The arrows disable at each end rather than wrapping, because
	 * wrapping from the first tour to the last reads as a bug the first time
	 * it happens to you.
	 */
	function scopeBar(tickets) {
		var list = tourScopes(tickets);
		if (!list.length) return "";

		var all = state.scope === "all";
		var tour = activeTour(tickets);
		var at = Math.max(0, scopeIndex(list, tour));
		var rows = inScope(tickets, tour);

		return '<div class="sl-scopebar">' +
			'<div class="sl-scopenav">' +
				'<button type="button" class="sl-arrow" data-act="scope" data-dir="1" aria-label="Earlier tour"' +
					(all || at >= list.length - 1 ? " disabled" : "") + ">" +
					'<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
				'<div class="sl-scopenow">' +
					'<span class="sl-scopelab">' + esc(scopeTitle(all ? null : tour)) + "</span>" +
					'<span class="sl-scopesub">' + esc(scopeSub(all ? null : tour, rows, at, list.length)) + "</span>" +
				"</div>" +
				'<button type="button" class="sl-arrow" data-act="scope" data-dir="-1" aria-label="Later tour"' +
					(all || at <= 0 ? " disabled" : "") + ">" +
					'<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
			"</div>" +
			'<button type="button" class="sl-scopeall" data-act="scopeall" aria-pressed="' + all + '">' +
				(all ? "Reading everything" : "All time") + "</button>" +
			"</div>";
	}

	/** Step the scope by one tour, or jump in or out of the whole log. */
	function moveScope(dir) {
		var list = tourScopes(counted());
		if (!list.length) return;

		if (state.scope === "all") {
			state.scope = list[0].key;
		} else {
			var at = Math.max(0, scopeIndex(list, activeTour(counted())));
			var to = at + dir;
			if (to < 0 || to >= list.length) return;
			state.scope = list[to].key;
		}
		/* The carousels belong to the figures they were drawn from, so
		   reading a different tour starts them at the first finding rather
		   than at whatever slide the last tour happened to be left on. */
		state.slide = {};
		render();
	}

	/**
	 * House weeks run Wednesday to Wednesday — Wednesday morning through
	 * Wednesday night — which is the boundary the floor actually
	 * works to, rather than the calendar's. Always four buckets, so an empty
	 * week shows as empty instead of vanishing from the run of dates.
	 */
	/* 0 = Sunday, so 3 = Wednesday. The server holds the same number in
	   SL_WEEK_START_DAY; the two have to move together or the chart and the
	   totals bucket tickets into different weeks. */
	var WEEK_START_DAY = 3;

	function weekStartOf(dateStr) {
		var d = fromISO(dateStr);
		d.setDate(d.getDate() - ((d.getDay() - WEEK_START_DAY + 7) % 7));
		return isoDate(d);
	}

	function lastFourWeeks() {
		var current = weekStartOf(isoDate(new Date()));
		var out = [];
		for (var i = 3; i >= 0; i--) {
			var start = isoDate(addDays(fromISO(current), -7 * i));
			out.push({ key: start, start: start, end: isoDate(addDays(fromISO(start), 6)), current: i === 0 });
		}
		return out;
	}

	function weekLabel(w, short) {
		var a = fromISO(w.start), b = fromISO(w.end);
		var day = { day: "numeric" }, full = { month: "short", day: "numeric" };
		if (short) return a.toLocaleDateString(undefined, full);
		return a.toLocaleDateString(undefined, full) + " – " +
			b.toLocaleDateString(undefined, a.getMonth() === b.getMonth() ? day : full);
	}

	/** Fold the day rows the house endpoint sends into those four weeks. */
	function houseWeeks(byDay) {
		return lastFourWeeks().map(function (w) {
			var inside = byDay.filter(function (r) { return r.date >= w.start && r.date <= w.end; });
			return Object.assign(withRates(sumRows(inside)), {
				key: w.key,
				start: w.start,          // kept so weekLabel can be called again
				end: w.end,
				label: weekLabel(w, true),
				full: weekLabel(w) + (w.current ? " · in progress" : ""),
				current: w.current,
			});
		});
	}

	/** Percentage-point and absolute deltas, rendered with direction. */

	function rateVal(n, d) { return d > 0 ? (n / d) * 100 : null; }

	/* ==================================================================
	   Correlations
	   Two-variable comparisons across your own tickets: does one kind of
	   guest, transport, hour or ticket type book better than another.

	   Each comparison needs enough on BOTH sides before it is shown, and a
	   gap wide enough not to be noise. A difference built on two tickets
	   against three is not a finding, and presenting it as one would send
	   somebody chasing a pattern that isn't there.
	   ================================================================== */

	function splitBy(tickets, groups) {
		return groups.map(function (g) {
			var row = withRates(tally(tickets.filter(g[1])));
			row.name = g[0];
			return row;
		});
	}

	/** Best against worst on one measure, if both sides carry enough weight. */
	function compareOn(rows, metric) {
		var live = rows.filter(metric.enough);
		if (live.length < 2) return null;

		var scored = live.map(function (r) { return { name: r.name, row: r, value: metric.value(r) }; })
			.filter(function (x) { return x.value !== null; })
			.sort(function (a, b) { return b.value - a.value; });
		if (scored.length < 2) return null;

		var top = scored[0], bottom = scored[scored.length - 1];
		if (!metric.material(top.value, bottom.value)) return null;

		return { top: top, bottom: bottom, gap: top.value - bottom.value };
	}

	function correlations(tickets) {
		var isAppt = function (t) { return kindOf(t) === "appointment"; };
		var hourOf = function (t) { return parseInt(String(t.time || "0").split(":")[0], 10) || 0; };

		var dimensions = [
			{
				label: "Transport",
				groups: [
					["Limo", function (t) { return t.limo === "yes"; }],
					["An outside driver", function (t) { return t.outside === "yes"; }],
					["Driving themselves", function (t) { return t.selfDrive === "yes"; }],
				],
			},
			{
				label: "Where they are staying",
				groups: [
					["Hotel guests", function (t) { return t.hotelGuest === "yes"; }],
					["Guests not staying here", function (t) { return t.hotelGuest === "no"; }],
				],
			},
			{
				label: "Guest history",
				groups: [
					["New guests", function (t) { return t.guestType === "new"; }],
					["Guests returning to you", function (t) { return t.guestType === "returning"; }],
					["Ranch regulars new to you", function (t) { return t.guestType === "house"; }],
				],
			},
			{
				label: "How it came in",
				groups: [
					["Appointments", isAppt],
					["Requests", function (t) { return kindOf(t) === "request"; }],
					["Lineup picks", function (t) { return kindOf(t) === "lineup"; }],
					["Bar walk-ins", function (t) { return kindOf(t) === "bar"; }],
					["Pull-ins", function (t) { return kindOf(t) === "pull"; }],
				],
			},
			{
				label: "Time of night",
				groups: [
					// A night runs past midnight: 1am is the late end of it, not
					// the early end, so the small hours sit with "8pm and later".
					["Before 8pm", function (t) { var h = hourOf(t); return h >= 6 && h < 20; }],
					["8pm and later", function (t) { var h = hourOf(t); return h >= 20 || h < 6; }],
				],
			},
			{
				label: "Day",
				groups: [
					["Friday and Saturday", function (t) { var d = fromISO(t.date).getDay(); return d === 5 || d === 6; }],
					["Sunday to Thursday", function (t) { var d = fromISO(t.date).getDay(); return d !== 5 && d !== 6; }],
				],
			},
		];

		var metrics = [
			{
				key: "book",
				noun: "books",
				enough: function (r) { return r.decided >= 4; },
				value: function (r) { return rateVal(r.booked, r.decided); },
				material: function (a, b) { return a - b >= 12; },
				fmt: function (v) { return Math.round(v) + "%"; },
				detail: function (r) { return r.booked + " of " + r.decided + " decided"; },
			},
			{
				key: "show",
				noun: "keeps appointments",
				enough: function (r) { return r.aMarked >= 3; },
				value: function (r) { return rateVal(r.a_showed, r.aMarked); },
				material: function (a, b) { return a - b >= 12; },
				fmt: function (v) { return Math.round(v) + "%"; },
				detail: function (r) { return r.a_showed + " of " + r.aMarked + " appointments"; },
			},
			{
				key: "money",
				noun: "pays",
				enough: function (r) { return r.priced >= 3; },
				value: function (r) { return r.amount / r.priced; },
				material: function (a, b) { return b > 0 && a / b >= 1.2; },
				fmt: function (v) { return cash(v) || "—"; },
				detail: function (r) { return r.priced + " priced"; },
				money: true,
			},
		];

		var found = [];
		dimensions.forEach(function (dim) {
			var rows = splitBy(tickets, dim.groups);
			metrics.forEach(function (m) {
				var c = compareOn(rows, m);
				if (!c) return;

				var strength = m.key === "money" ? (c.top.value / c.bottom.value - 1) * 100 : c.gap;
				// Left as written: lowercasing the first letter mangles the
				// group names that are proper nouns, like "Friday and Saturday".
				var head = c.top.name + " " + m.noun + " " + m.fmt(c.top.value) +
					", against " + m.fmt(c.bottom.value) + " for " + c.bottom.name;

				found.push({
					tag: dim.label,
					head: head,
					detail: m.detail(c.top.row) + " against " + m.detail(c.bottom.row) + ".",
					a: { name: c.top.name, value: c.top.value, text: m.fmt(c.top.value) },
					b: { name: c.bottom.name, value: c.bottom.value, text: m.fmt(c.bottom.value) },
					money: !!m.money,
					strength: strength,
				});
			});
		});

		return found.sort(function (a, b) { return b.strength - a.strength; }).slice(0, 10);
	}

	/**
	 * Every tour so far, newest first. One row each: how long it ran, what
	 * came in, what closed and what a party was worth.
	 */
	/**
	 * What a tour was aiming at, under what it made.
	 *
	 * Only where a goal was actually set — a tour run without one did not
	 * miss anything, and marking it as though it had would be a reproach
	 * for a decision never taken.
	 */
	function goalNote(tour, f) {
		var goal = tour.record && tour.record.goal;
		if (!goal || !f.amount) return "";

		var pct = Math.round((f.amount / goal) * 100);
		var hit = f.amount >= goal;

		/* Once a goal is met the percentage stops being the point — "met 285%
		   of $11,000" reads as a riddle where "met the $11,000 goal" reads as
		   what happened. The share only carries information on a miss. */
		return '<span class="sl-sublab sl-goalmark' + (hit ? " is-hit" : "") + '">' +
			(hit
				? "met the " + (state.showMoney ? (cash(goal) || "—") : "$•••") + " goal"
				: pct + "% of the " + (state.showMoney ? (cash(goal) || "—") : "$•••") + " goal") +
			"</span>";
	}

	/** How many closed tours had a goal, and how many reached it. */
	function goalRecord(scopes) {
		var set = 0, met = 0;
		scopes.forEach(function (tour) {
			var goal = tour.record && tour.record.goal;
			if (!goal) return;
			set++;
			if (tally(inScope(counted(), tour)).amount >= goal) met++;
		});
		return { set: set, met: met };
	}

	function tourHistoryCard(tickets) {
		var tours = buildTours(tickets);
		if (tours.length < 2) {
			return '<section class="sl-card"><p class="sl-eyebrow">Tour history</p>' +
				'<div class="sl-empty"><strong>One tour so far</strong>Each tour you finish is recorded here, so you can see how one compares with the last.</div></section>';
		}

		var rows = tours.slice().reverse().slice(0, 12).map(function (tour, i) {
			/* A closed tour shows the figures worked out when it closed, not
			   figures recomputed now. Editing a ticket months later should not
			   quietly change what a finished tour reported at the time. The
			   one thing that does rework them is changing the tour's own
			   dates, since a different range is a different set of tickets. */
			var f = tour.record ? keptFigures(tour.record) : tourFigures(tickets, tour);
			var live = tour.running || (!tour.declared && i === 0);
			var closed = tour.record && tour.record.id && !live;
			var editing = closed && state.tour.editId === String(tour.record.id);

			if (editing) {
				return '<tr class="sl-histedit"><td colspan="7">' + tourDateEditor(tour) + "</td></tr>";
			}

			return "<tr>" +
				"<td>" + esc(tourLabel(tour)) +
					'<span class="sl-sublab">' + tour.span + " days" +
					(live ? " · in progress" : tour.declared ? " · closed" : "") +
					(tour.record && tour.record.editedAt ? " · dates corrected" : "") + "</span>" +
					(closed
						? '<button type="button" class="sl-linkbtn sl-histbtn" data-act="tourhistedit" data-id="' +
							esc(String(tour.record.id)) + '">Change dates</button>'
						: "") +
					"</td>" +
				"<td>" + f.n + "</td>" +
				"<td>" + f.booked + '<span class="sl-sublab">' + f.partiesPerDay.toFixed(1) +
					" a day · " + pct(f.booked, f.decided) + " of decided</span></td>" +
				"<td>" + f.req + "</td>" +
				'<td class="' + (f.a_noshow ? "sl-neg" : "sl-dim") + '">' + f.a_noshow +
					'<span class="sl-sublab">' + (f.aMarked ? pct(f.a_showed, f.aMarked) + " kept" : "no appts") + "</span></td>" +
				'<td class="' + (state.showMoney ? "" : "sl-mask") + '">' +
					(f.pricedCount ? (cash(f.avgParty) || "—") : '<span class="sl-dim">—</span>') + "</td>" +
				'<td class="' + (state.showMoney ? "" : "sl-mask") + '">' +
					(f.amount ? (cash(f.amount) || "—") : '<span class="sl-dim">—</span>') +
					/* The goal has been kept on every closed tour since the
					   switch existed and shown nowhere. Put beside what the
					   tour came to, it is the only way to find out whether
					   the goals being set are the right size. */
					goalNote(tour, f) + "</td>" +
				"</tr>";
		}).join("");

		return '<section class="sl-card"><div class="sl-cardhead">' +
				'<p class="sl-eyebrow">Tour history</p>' +
				'<span class="sl-weekrange">' + tours.length + " tours logged</span></div>" +
			'<div class="sl-scroll"><table class="sl-table"><thead><tr>' +
				"<th>Tour</th><th>Tickets</th><th>Parties</th><th>Requests</th><th>No-shows</th><th>Average party</th><th>Booked</th>" +
			"</tr></thead><tbody>" + rows + "</tbody></table></div>" +
			'<p class="sl-fn">' +
			(state.tour.history.length || state.tour.open
				? "A tour runs from the moment you mark yourself in house to the moment you mark yourself out. Closed tours show the figures worked out at the time, so editing an old ticket cannot rewrite a finished tour — but you can change a tour's dates, and its figures are then worked out again for the days you gave it."
				: "A tour is a stretch of days you logged tickets on; a gap of " + TOUR_GAP +
					" days or more starts a new one. Use the in-house switch above to mark them yourself instead.") +
			' Averages are trimmed, so one unusual night does not carry the row.</p>' +
			"</section>";
	}

	/**
	 * Correcting the dates of a tour that has already closed.
	 *
	 * Shown in place of the row it belongs to, so the dates are edited where
	 * they are read rather than in a dialog that covers the table. The
	 * figures that follow are the server's: moving the end of a tour by a day
	 * moves every ticket on that day with it, and guessing at the new totals
	 * here would put a different set of numbers on screen from the set that
	 * was saved.
	 */
	function tourDateEditor(tour) {
		var busy = state.tour.busy;
		return '<div class="sl-histform">' +
			'<div class="sl-histfields">' +
				'<label class="sl-field"><span class="sl-label">Started</span>' +
					'<input class="sl-input" type="date" data-histfield="start" value="' +
					esc(state.tour.editStart || tour.start) + '" max="' + isoDate(new Date()) + '"></label>' +
				'<label class="sl-field"><span class="sl-label">Ended</span>' +
					'<input class="sl-input" type="date" data-histfield="end" value="' +
					esc(state.tour.editEnd || tour.end) + '" max="' + isoDate(new Date()) + '"></label>' +
			"</div>" +
			'<div class="sl-histacts">' +
				'<button type="button" class="sl-save" data-act="tourhistsave"' + (busy ? " disabled" : "") + ">" +
					(busy ? "Working…" : "Save dates") + "</button>" +
				'<button type="button" class="sl-ghost" data-act="tourhistcancel">Cancel</button>' +
			"</div>" +
			(state.tour.error ? '<p class="sl-err">' + esc(state.tour.error) + "</p>" : "") +
			'<p class="sl-fn">The tour\'s figures are worked out again for the days you give it, from the tickets in your log.</p>' +
			"</div>";
	}

	function tourSaveDates(id, start, end) {
		state.tour.busy = true;
		state.tour.error = "";
		render();

		api("/tour/edit", { method: "POST", body: { id: id, start: start, end: end } })
			.then(function (res) {
				if (res) {
					state.tour.open = res.open || null;
					state.tour.history = res.history || [];
					state.tour.progress = res.progress || null;
				}
				state.tour.editId = null;
				/* The scope names a tour by its start date, and that date may
				   have just moved. Dropping back to the newest tour is better
				   than holding a key that no longer matches anything. */
				state.scope = null;
				flash("Tour dates updated.");
			})
			.catch(function (err) {
				state.tour.error = err.message || "Those dates did not work.";
			})
			.finally(function () {
				state.tour.busy = false;
				render();
			});
	}

	function correlationCard(tickets, all) {
		var MIN = 8;
		if (all.n < MIN) {
			return '<section class="sl-card"><p class="sl-eyebrow">Personal insights</p>' +
				'<div class="sl-empty"><strong>Not enough to compare yet</strong>Around ' + MIN +
				' tickets, this starts showing which guests, transport and hours actually book differently for you.</div></section>';
		}

		var found = correlations(tickets);
		if (!found.length) {
			return '<section class="sl-card"><p class="sl-eyebrow">Personal insights</p>' +
				'<div class="sl-empty"><strong>Nothing separating yet</strong>No two groups in your log differ by enough to call it a pattern. Tagging transport, guest history and party type on each ticket is what sharpens this.</div></section>';
		}

		var slides = found.map(function (f) {
				var masked = f.money && !state.showMoney;
				var hi = Math.max(f.a.value, f.b.value) || 1;
				return '<div class="sl-corritem">' +
					'<span class="sl-obstag">' + esc(f.tag) + "</span>" +
					'<p class="sl-obshead' + (masked ? " sl-mask" : "") + '">' + esc(f.head) + "</p>" +
					'<div class="sl-vs">' +
						'<div class="sl-vsrow"><span class="sl-vsname">' + esc(f.a.name) + "</span>" +
							'<span class="sl-vsbar"><span class="sl-vsfill sl-vshigh" style="width:' + (f.a.value / hi) * 100 + '%"></span></span>' +
							'<span class="sl-vsval sl-pos' + (masked ? " sl-mask" : "") + '">' + esc(f.a.text) + "</span></div>" +
						'<div class="sl-vsrow"><span class="sl-vsname">' + esc(f.b.name) + "</span>" +
							'<span class="sl-vsbar"><span class="sl-vsfill sl-vslow" style="width:' + (f.b.value / hi) * 100 + '%"></span></span>' +
							'<span class="sl-vsval sl-neg' + (masked ? " sl-mask" : "") + '">' + esc(f.b.text) + "</span></div>" +
					"</div>" +
					'<p class="sl-obstext">' + esc(f.detail) + "</p>" +
					"</div>";
			});

		return '<section class="sl-card"><p class="sl-eyebrow">Personal insights</p>' +
			carousel("corr", slides) +
			'<p class="sl-fn">' + found.length + (found.length === 1 ? " comparison" : " comparisons") +
			', strongest first. Both sides of each need enough tickets behind them before it appears here, and a gap wide enough not to be chance. A pattern is worth checking against what you already know — the log sees numbers, not the night.</p>' +
			"</section>";
	}

	/**
	 * The tour in progress, beside what the log correlates across all of it.
	 *
	 * Runs are detected from the log, so this works whether someone is on a
	 * ten-day tour or a three-week one, and whichever day it started.
	 */
	/**
	 * One tour, with the figures that describe it — including what a party
	 * was worth on that tour, which is the number that moves between one
	 * tour and the next.
	 */
	function tourFigures(tickets, tour) {
		var inside = tickets.filter(function (t) { return inTour(t.date, tour); });
		var m = withRates(tally(inside));
		var prices = ownPrices(inside);

		m.tour = tour;
		m.avgParty = prices.length ? trimmedMean(prices) : 0;
		m.pricedCount = prices.length;
		// Tickets a day says how busy the floor was, which is not the person's
		// doing. Parties a day is the figure they actually influence.
		m.partiesPerDay = tour.span ? m.booked / tour.span : 0;
		return m;
	}

	/* ==================================================================
	   In the house, or out of it

	   A tour used to be inferred from gaps in the log, which only works
	   after the fact and cannot tell a quiet Tuesday from a flight home.
	   The toggle lets someone say it plainly. Turning it off closes the
	   tour: the figures for every ticket since it was turned on are worked
	   out once, kept as they were, and the tour moves down into the record
	   of previous ones.

	   The declared tour, where there is one, is what the rest of the page
	   means by "this tour". Where there is not, the old gap detection still
	   applies, so nothing breaks for anyone who never touches the toggle.
	   ================================================================== */
	function tourToggle() {
		var open = state.tour.open;
		var busy = state.tour.busy;

		/* The switch reads as a state, not an instruction. It says where you
		   are — In house, Out of house — and keeps saying it until it is
		   changed, rather than naming the action pressing it would perform. */
		/* If the shift state never loaded, say so rather than guessing. The
		   switch is disabled meanwhile: pressing it would either start a
		   second tour on top of a running one, or close one that is not
		   there. */
		if (!state.tour.known) {
			return '<div class="sl-tourbar is-unknown">' +
				'<div class="sl-tourstate">' +
					'<span class="sl-tourdot" aria-hidden="true"></span>' +
					'<span class="sl-tourdates">Could not check whether you are in house</span>' +
				"</div>" +
				'<button type="button" class="sl-ghost" data-act="tourretry">Try again</button>' +
				"</div>";
		}

		var since = open
			? "Shift started " + esc(prettyDate(open.start)) +
				(open.startTime ? ", " + esc(prettyTime(open.startTime)) : "") +
				" · day " + (daysBetween(open.start, isoDate(new Date())) + 1)
			: "No tour running";

		/* One box. The switch, what has been booked, and the goal were three
		   stacked panels saying overlapping things; a shift is one state and
		   reads as one thing. Everything past the switch appears only once a
		   tour is running — there is nothing to book against until then. */
		return '<div class="sl-tourbar' + (open ? " is-in" : "") +
				(state.tour.moved ? " sl-moved-" + state.tour.moved : "") + '">' +
			'<span class="sl-tourglow" aria-hidden="true"></span>' +
			'<div class="sl-tourhead">' +
				'<div class="sl-tourstate">' +
					'<span class="sl-tourdot" aria-hidden="true"></span>' +
					'<span class="sl-tourdates">' + since + "</span>" +
				"</div>" +
				'<button type="button" class="sl-toursw" role="switch" aria-checked="' + (open ? "true" : "false") +
					'" data-act="' + (open ? "tourend" : "tourstart") + '"' + (busy ? " disabled" : "") +
					' aria-label="' + (open ? "You are in house. Press to go out of house and close this tour."
						: "You are out of house. Press to go in house and start a tour.") + '">' +
					'<span class="sl-swtrack"><span class="sl-swknob"></span></span>' +
					'<span class="sl-swlab">' + (busy ? "Working…" : open ? "In house" : "Out of house") + "</span>" +
				"</button>" +
			"</div>" +
			(open ? tourProgress(open) : "") +
			(open ? tourStartEditor(open) : "") +
			/* The hint belongs inside the box with everything else. Left
			   outside the closing tag it spanned the page above the two
			   columns, unboxed and overlapping the card beneath. And it is
			   one short line now rather than three: the switch says what it
			   does, so the hint only has to say what it is for. */
			(open
				? ""
				: '<p class="sl-tourhint">Everything you log between going in and coming out counts as one tour.' +
					(state.tour.history.length
						? ' <button type="button" class="sl-linkbtn" data-act="tourreopen">Reopen the last one</button>'
						: "") +
					"</p>") +
			"</div>";
	}

	/**
	 * Where the shift stands: what has been booked, and how far that is from
	 * the goal if one has been set.
	 *
	 * The figures come from the server, worked out the same way the closed
	 * tour figures are — two routes to one number is how two screens stop
	 * agreeing with each other.
	 */
	/* ==================================================================
	   Why they did not book

	   The reason has been written on every not-booked ticket since the log
	   began and read back on exactly one screen: its own ticket. Four of
	   them in a row usually name the same cause, which is no use at all
	   when they can only be read one at a time.

	   Two readings, because free text needs both. The themes catch the same
	   cause written four different ways; the verbatim list catches what the
	   themes get wrong, and is the one to trust when they disagree.
	   ================================================================== */

	/* Matched against the words actually used. Deliberately narrow: a theme
	   that catches everything tells you nothing, and a reason that matches
	   none of them is better left under its own words than filed wrongly. */
	var REASON_THEMES = [
		{ name: "The price", hint: "price, budget, what it cost",
			words: ["price", "cost", "expensive", "afford", "budget", "cheap", "money", "rate", "quote", "too much", "shopping", "haggl"] },
		{ name: "Wanted someone else", hint: "another girl, not the fit",
			words: ["another", "other girl", "someone else", "different girl", "not my type", "lineup", "picked", "chose"] },
		{ name: "Wanted something else", hint: "a party you do not offer",
			words: ["wanted", "asked for", "looking for", "do not offer", "don't offer", "not offer", "would not do", "wouldn't do"] },
		{ name: "Said he would come back", hint: "later, tomorrow, next time",
			words: ["come back", "coming back", "tomorrow", "next time", "later", "another night", "think about"] },
		{ name: "Only looking", hint: "touring, curious, first visit",
			words: ["looking", "browsing", "tour of", "curious", "first time", "nervous", "shy", "just a drink"] },
	];

	/** The reason text, reduced so two people writing the same thing agree. */
	function reasonKey(text) {
		return String(text || "")
			.toLowerCase()
			.replace(/[.!,;:"'—–-]+/g, " ")
			.replace(/\s+/g, " ")
			.trim();
	}

	function reasonsOf(tickets) {
		var given = [];
		var blank = 0;

		tickets.forEach(function (t) {
			if (t.outcome !== "notbooked") return;
			var key = reasonKey(t.reason);
			if (!key) { blank++; return; }
			given.push({ key: key, text: String(t.reason).trim() });
		});

		/* The same words, however many times they were written. */
		var seen = {};
		given.forEach(function (g) {
			if (!seen[g.key]) seen[g.key] = { text: g.text, n: 0 };
			seen[g.key].n++;
		});
		var verbatim = Object.keys(seen).map(function (k) { return seen[k]; })
			.sort(function (a, b) { return b.n - a.n; });

		/* And the same cause, however it was worded. A reason can sit under
		   more than one theme — "he wanted two girls and balked at the
		   price" is both — so the shares do not add to a hundred, and the
		   card says so rather than leaving it to be noticed. */
		var themes = REASON_THEMES.map(function (th) {
			var n = 0;
			given.forEach(function (g) {
				for (var i = 0; i < th.words.length; i++) {
					if (g.key.indexOf(th.words[i]) !== -1) { n++; return; }
				}
			});
			return { name: th.name, hint: th.hint, n: n };
		}).filter(function (th) { return th.n > 0; })
			.sort(function (a, b) { return b.n - a.n; });

		var filed = 0;
		given.forEach(function (g) {
			for (var i = 0; i < REASON_THEMES.length; i++) {
				var w = REASON_THEMES[i].words;
				for (var j = 0; j < w.length; j++) {
					if (g.key.indexOf(w[j]) !== -1) { filed++; return; }
				}
			}
		});

		return {
			given: given.length,
			blank: blank,
			notbooked: given.length + blank,
			verbatim: verbatim,
			themes: themes,
			unfiled: given.length - filed,
		};
	}

	function reasonsCard(tickets, all) {
		var r = reasonsOf(tickets);
		var avg = all.priced ? all.amount / all.priced : 0;

		if (!r.notbooked) {
			return '<section class="sl-card"><p class="sl-eyebrow">Why they did not book</p>' +
				'<div class="sl-empty"><strong>Nothing went the other way here</strong>' +
				"Every decided ticket in this stretch booked. The reasons you write on the ones that " +
				"do not are gathered here.</div></section>";
		}

		if (!r.given) {
			return '<section class="sl-card"><p class="sl-eyebrow">Why they did not book</p>' +
				'<div class="sl-empty"><strong>' + r.blank + " did not book, and none say why</strong>" +
				"The reason box on a not-booked ticket is the only place this can come from. " +
				"A line at the time is worth more than a memory a month later.</div></section>";
		}

		var themes = r.themes.map(function (th) {
			return '<div class="sl-whyrow">' +
				'<span class="sl-whyname">' + esc(th.name) +
					'<span class="sl-whyhint">' + esc(th.hint) + "</span></span>" +
				'<span class="sl-whybar"><span class="sl-whyfill" style="width:' +
					Math.round((th.n / r.given) * 100) + '%"></span></span>' +
				'<span class="sl-whyn">' + th.n + "</span></div>";
		}).join("");

		var list = r.verbatim.slice(0, 8).map(function (v) {
			return "<li>" + (v.n > 1 ? '<span class="sl-whycount">' + v.n + "×</span>" : "") +
				esc(v.text) + "</li>";
		}).join("");

		return '<section class="sl-card"><div class="sl-cardhead">' +
				'<p class="sl-eyebrow">Why they did not book</p>' +
				'<span class="sl-weekrange">' + r.given + " of " + r.notbooked + " say why</span></div>" +
			(avg
				? '<div class="sl-privrow"><span>' + r.notbooked +
					(r.notbooked === 1 ? " guest" : " guests") + " decided against booking" +
					(state.showMoney
						? ', which at your average is <span class="sl-privfig">' + (cash(avg * r.notbooked) || "—") + "</span>"
						: ", worth <span class=\"sl-privfig sl-mask\">$•••</span> at your average") +
					" that went elsewhere.</span></div>"
				: "") +
			(themes ? '<div class="sl-why">' + themes + "</div>" : "") +
			(list
				? '<p class="sl-whylead">In your own words</p><ul class="sl-whylist">' + list + "</ul>"
				: "") +
			'<p class="sl-fn">' +
			(r.blank
				? r.blank + " of them say nothing. " : "") +
			"Themes are matched on the words you used, and one reason can sit under two of them, so they do " +
			"not add to the total. Where the words match no theme they are left under themselves — " +
			(r.unfiled ? r.unfiled + " of them here. " : "none here. ") +
			"The list is what you actually wrote, most repeated first.</p>" +
			"</section>";
	}

	/**
	 * Limo money on My insights: the tour in scope, and every tour beneath it.
	 *
	 * The table is the point of this card rather than an extra — the figure
	 * worth having is what the limo took on each tour, not what it has taken
	 * since the log began.
	 */
	function limoCard(rows, whole, tour) {
		var here = limoOf(rows);
		var r = here.rates;

		if (!here.bookings && !limoOf(whole).bookings) {
			return '<section class="sl-card"><p class="sl-eyebrow">Limo money</p>' +
				'<div class="sl-empty"><strong>No limo bookings yet</strong>' +
				"Mark a ticket as arriving by limo and this works out what the " +
				r.cut + "% cut came to.</div></section>";
		}

		/* Every tour that has a limo booking in it, newest first. */
		var byTour = [];
		tourScopes(whole).forEach(function (t) {
			var f = limoOf(inScope(whole, t));
			if (f.bookings) byTour.push({ tour: t, f: f });
		});

		var totals = limoOf(whole);

		/* A tour with no limo booking in it would headline this card with
		   four noughts while the table underneath carried the figures. The
		   strip falls back to the whole log and says which it is showing. */
		var lead = here.bookings ? here : totals;
		var leadLab = here.bookings
			? (tour ? "on this tour" : "across the log")
			: "across the log · none on this tour";

		var mask = state.showMoney ? "" : " sl-mask";
		var m = function (v) { return state.showMoney ? (cash(v) || "$0") : "$•••"; };

		var rowsHtml = byTour.map(function (x) {
			return "<tr><td>" + esc(scopeTitle(x.tour)) +
					(x.tour.key === (tour && tour.key) ? '<span class="sl-sublab">in scope above</span>' : "") + "</td>" +
				"<td>" + x.f.bookings +
					(x.f.unpriced ? '<span class="sl-sublab">' + x.f.unpriced + " with no price</span>" : "") + "</td>" +
				'<td class="' + mask.trim() + '">' + m(x.f.gross) + "</td>" +
				'<td class="sl-limocell' + mask + '">' + m(x.f.cut) + "</td>" +
				'<td class="' + mask.trim() + '">' + m(x.f.share) + "</td></tr>";
		}).join("");

		return '<section class="sl-card"><div class="sl-cardhead">' +
				'<p class="sl-eyebrow">Limo money</p>' +
				'<span class="sl-weekrange">' + r.cut + "% off the top</span></div>" +
			'<div class="sl-stats sl-statsmall" data-cols="4">' +
				'<div class="sl-stat"><div class="sl-statnum">' + lead.bookings + '</div>' +
					'<div class="sl-statlab">Limo bookings</div>' +
					'<div class="sl-statsub">' + leadLab +
						(lead.unpriced ? " · " + lead.unpriced + " with no price" : "") + "</div></div>" +
				'<div class="sl-stat"><div class="sl-statnum' + mask + '">' + m(lead.gross) + "</div>" +
					'<div class="sl-statlab">Booked by limo</div>' +
					'<div class="sl-statsub">across ' + lead.priced + " priced</div></div>" +
				'<div class="sl-stat"><div class="sl-statnum sl-limonum' + mask + '">' + m(lead.cut) + "</div>" +
					'<div class="sl-statlab">The limo\'s ' + r.cut + "%</div>" +
					'<div class="sl-statsub">off the top, before any split</div></div>' +
				'<div class="sl-stat"><div class="sl-statnum' + mask + '">' + m(lead.share) + "</div>" +
					'<div class="sl-statlab">Your ' + r.share + "%</div>" +
					'<div class="sl-statsub">of what the limo brought in</div></div>' +
			"</div>" +
			(rowsHtml
				? '<div class="sl-scroll" style="margin-top:20px"><table class="sl-table"><thead><tr>' +
					"<th>Tour</th><th>Limo parties</th><th>Booked</th><th>The limo's " + r.cut +
					"%</th><th>Your " + r.share + "%</th>" +
					"</tr></thead><tbody>" + rowsHtml +
					'<tr class="sl-limototal"><td>Every tour</td><td>' + totals.bookings + "</td>" +
						'<td class="' + mask.trim() + '">' + m(totals.gross) + "</td>" +
						'<td class="sl-limocell' + mask + '">' + m(totals.cut) + "</td>" +
						'<td class="' + mask.trim() + '">' + m(totals.share) + "</td></tr>" +
					"</tbody></table></div>"
				: "") +
			'<p class="sl-fn">Only a booked ticket marked as arriving by limo counts, and only one carrying a ' +
			"price — a limo booking with the price left off is counted as a booking and left out of the money. " +
			"Nothing is stored for this: it is worked out from the limo mark and the amount, both of which have " +
			"been on every ticket from the start, so your whole log is already in it. The rates are set on the " +
			"plugin's settings page.</p>" +
			"</section>";
	}

	/** The same figures for the floor, from the pooled segment. */
	function houseLimoCard(h) {
		var r = limoRates();
		var seg = (h.segments || []).filter(function (s) { return s.name === "Limo"; })[0];

		if (!seg || !seg.booked) {
			return '<section class="sl-card"><p class="sl-eyebrow">Limo money</p>' +
				'<div class="sl-empty"><strong>No limo bookings logged</strong>' +
				"Once tickets start coming in marked as arriving by limo, the " +
				r.cut + "% cut is worked out here.</div></section>";
		}

		var gross = seg.amount || 0;
		var cut = gross * (r.cut / 100);
		var share = gross * (r.share / 100);
		var mask = state.showMoney ? "" : " sl-mask";
		var m = function (v) { return state.showMoney ? (cash(v) || "$0") : "$•••"; };
		var unpriced = Math.max(0, (seg.booked || 0) - (seg.priced || 0));

		return '<section class="sl-card"><div class="sl-cardhead">' +
				'<p class="sl-eyebrow">Limo money</p>' +
				'<span class="sl-weekrange">' + r.cut + "% off the top</span></div>" +
			'<div class="sl-stats" data-cols="4">' +
				'<div class="sl-stat"><div class="sl-statnum">' + seg.booked + "</div>" +
					'<div class="sl-statlab">Limo bookings</div>' +
					'<div class="sl-statsub">of ' + seg.n + " limo tickets" +
						(unpriced ? " · " + unpriced + " with no shared price" : "") + "</div></div>" +
				'<div class="sl-stat"><div class="sl-statnum' + mask + '">' + m(gross) + "</div>" +
					'<div class="sl-statlab">Booked by limo</div>' +
					'<div class="sl-statsub">across ' + (seg.priced || 0) + " shared prices</div></div>" +
				'<div class="sl-stat"><div class="sl-statnum sl-limonum' + mask + '">' + m(cut) + "</div>" +
					'<div class="sl-statlab">The limo\'s ' + r.cut + "%</div>" +
					'<div class="sl-statsub">off the top, before any split</div></div>' +
				'<div class="sl-stat"><div class="sl-statnum' + mask + '">' + m(share) + "</div>" +
					'<div class="sl-statlab">The floor\'s ' + r.share + "%</div>" +
					'<div class="sl-statsub">of what the limo brought in</div></div>' +
			"</div>" +
			'<p class="sl-fn">Only bookings whose price was shared with everyone can be counted here, so this is ' +
			"the floor's limo money as far as the pooled figures can see it — a price kept private is in nobody's " +
			"total but its own. The rates are set on the plugin's settings page.</p>" +
			"</section>";
	}

	function tourProgress(open) {
		var p = state.tour.progress;
		if (!p) return "";

		var money = function (v) { return state.showMoney ? (cash(v) || "—") : "$•••"; };
		var goal = p.goal;

		/* Counted up the same way the insights headline is, so the two read
		   as one figure in two places rather than two figures. */
		var figures =
			'<div class="sl-goalfig">' +
				'<span class="sl-goallab">Booked this tour</span>' +
				'<strong class="sl-goalnum' + (state.showMoney ? "" : " sl-mask") + '"' +
					(state.showMoney ? ' data-count="' + Math.round(p.amount) + '"' : "") + ">" +
					(state.showMoney ? (state.stillTour ? money(p.amount) : (cash(0) || "$0")) : "$•••") +
				"</strong>" +
				'<span class="sl-goalsub">' + p.booked + (p.booked === 1 ? " party" : " parties") +
					(p.priced < p.booked ? " · " + (p.booked - p.priced) + " with no price" : "") + "</span>" +
			"</div>";

		if (!goal) {
			return '<div class="sl-goal">' + figures +
				'<div class="sl-goalset">' +
					(state.tour.goalEditing
						? goalFields("")
						: '<button type="button" class="sl-ghost" data-act="goalon">Set a tour goal</button>') +
				"</div></div>";
		}

		var reached = p.reached;
		var pct = p.pct || 0;

		return '<div class="sl-goal' + (reached ? " is-hit" : "") + '">' +
			figures +
			'<div class="sl-goalbarwrap">' +
				'<div class="sl-goalhead">' +
					"<span>" + (reached
						? "Goal reached"
						: money(p.remaining) + " to go") + "</span>" +
					'<span class="sl-goalof">' + pct + "% of " + money(goal) + "</span>" +
				"</div>" +
				'<div class="sl-goalbar"><div class="sl-goalfill' + (state.goalFilled ? " is-live" : "") +
					'" data-fill="' + pct + '" ' +
					'style="width:' + (state.goalFilled ? pct : 0) + '%">' +
					'<span class="sl-goalwave" aria-hidden="true"></span>' +
					'<span class="sl-goalwave sl-goalwave2" aria-hidden="true"></span>' +
				"</div></div>" +
				'<p class="sl-goalnote">' +
					(reached
						? "Past your goal for this tour. Anything from here is over the line."
						: p.toGo
							? "About " + p.toGo + " more " + (p.toGo === 1 ? "party" : "parties") +
								" at your average of " + money(p.average) + "."
							: "Add a price to a booking and this will say how many more parties it takes.") +
				"</p>" +
			"</div>" +
			'<div class="sl-goalset">' +
				(state.tour.goalEditing
					? goalFields(goal)
					: '<button type="button" class="sl-linkbtn" data-act="goalon">Change goal</button>') +
			"</div>" +
			"</div>";
	}

	function goalFields(current) {
		return '<div class="sl-goalEdit">' +
			'<span class="sl-cur">$</span>' +
			'<input class="sl-input sl-mono" inputmode="decimal" data-goalfield="goal" ' +
				'placeholder="0" aria-label="Tour goal" value="' + esc(current || "") + '">' +
			'<button type="button" class="sl-save sl-savesm" data-act="goalsave"' +
				(state.tour.busy ? " disabled" : "") + ">" + (state.tour.busy ? "Saving…" : "Save") + "</button>" +
			(current ? '<button type="button" class="sl-ghost" data-act="goalclear">Clear</button>' : "") +
			'<button type="button" class="sl-ghost" data-act="goaloff">Cancel</button>' +
			"</div>";
	}

	/**
	 * Correcting when the shift began.
	 *
	 * People arrive, work, and remember the switch three hours later. The
	 * start is a statement about when the shift began, not about when the
	 * button was pressed — so it has to be correctable, or the first hours of
	 * every forgotten tour sit outside the tour they belong to.
	 */
	function tourStartEditor(open) {
		if (!state.tour.editing) {
			return '<p class="sl-tourhint">Everything you log until you go out of house counts as this tour. ' +
				'<button type="button" class="sl-linkbtn" data-act="tourediton">Adjust the start</button> ' +
				"if you turned this on late.</p>";
		}

		return '<div class="sl-tourEdit">' +
			'<p class="sl-tourEditlab">When did this shift actually start?</p>' +
			'<div class="sl-tourEditrow">' +
				'<input type="date" class="sl-input sl-mono" data-tourfield="start" ' +
					'value="' + esc(open.start) + '" max="' + esc(isoDate(new Date())) + '" aria-label="Shift start day">' +
				'<input type="time" class="sl-input sl-mono" data-tourfield="startTime" ' +
					'value="' + esc(open.startTime || "00:00") + '" aria-label="Shift start time">' +
				'<button type="button" class="sl-save sl-savesm" data-act="toursave"' +
					(state.tour.busy ? " disabled" : "") + ">" + (state.tour.busy ? "Saving…" : "Save") + "</button>" +
				'<button type="button" class="sl-ghost" data-act="toureditoff">Cancel</button>' +
			"</div>" +
			(state.tour.error ? '<p class="sl-aderr">' + esc(state.tour.error) + "</p>" : "") +
			'<p class="sl-fn">Tickets are counted into this tour by their own day, so moving the start earlier pulls in anything you already logged on those days.</p>' +
			"</div>";
	}

	/**
	 * The tour just closed, shown once so the numbers are not simply filed
	 * away where nobody looks at them.
	 */
	function tourClosedCard(rec) {
		if (!rec) return "";

		var avg = rec.ownAvg != null ? rec.ownAvg : (rec.ownPriced ? rec.ownAmount / rec.ownPriced : 0);
		var aMarked = (rec.a_showed || 0) + (rec.a_noshow || 0);
		var decided = (rec.booked || 0) + (rec.notbooked || 0);

		return '<section class="sl-card sl-feature sl-tourdone">' +
			'<div class="sl-cardhead"><p class="sl-eyebrow">Tour closed</p>' +
				'<span class="sl-weekrange">' + esc(prettyDate(rec.start)) + " – " + esc(prettyDate(rec.end)) +
				" · " + rec.span + (rec.span === 1 ? " day" : " days") + "</span></div>" +
			'<div class="sl-stats" data-cols="5" style="margin-bottom:0">' +
				'<div class="sl-stat"><div class="sl-statnum">' + rec.n + '</div><div class="sl-statlab">Tickets</div>' +
					'<div class="sl-statsub">' + rec.activeDays + " active " + (rec.activeDays === 1 ? "day" : "days") + "</div></div>" +
				'<div class="sl-stat"><div class="sl-statnum sl-pos">' + pct(rec.a_showed, aMarked) +
					'</div><div class="sl-statlab">Appt show rate</div>' +
					'<div class="sl-statsub">' + rec.a_showed + " of " + aMarked + " appts</div></div>" +
				'<div class="sl-stat"><div class="sl-statnum">' + rec.booked + '</div><div class="sl-statlab">Parties</div>' +
					'<div class="sl-statsub">' + pct(rec.booked, decided) + " of decided</div></div>" +
				'<div class="sl-stat"><div class="sl-statnum' + (state.showMoney ? "" : " sl-mask") + '">' +
					(avg ? (cash(avg) || "—") : "—") + '</div><div class="sl-statlab">Average party</div>' +
					'<div class="sl-statsub">' + (rec.ownPriced ? "across " + rec.ownPriced + " priced" : "no prices") + "</div></div>" +
				'<div class="sl-stat"><div class="sl-statnum' + (state.showMoney ? "" : " sl-mask") + '">' +
					(rec.ownAmount ? (cash(rec.ownAmount) || "—") : "—") + '</div><div class="sl-statlab">Tour total</div>' +
					'<div class="sl-statsub">' + ((rec.weeks || []).length || 1) +
					((rec.weeks || []).length === 1 ? " week" : " weeks") + "</div></div>" +
			"</div>" +
			((rec.weeks || []).length > 1 ? tourWeekTable(rec) : "") +
			'<p class="sl-fn">Worked out at the moment you went out of house and kept as it was. ' +
			'It sits in your tour history from now on. <button type="button" class="sl-linkbtn" data-act="tourdismiss">Got it</button></p>' +
			"</section>";
	}

	/** Week by week inside one tour, since a tour can run over several. */
	function tourWeekTable(rec) {
		var rows = (rec.weeks || []).map(function (w) {
			var aM = (w.a_showed || 0) + (w.a_noshow || 0);
			var dec = (w.booked || 0) + (w.notbooked || 0);
			/* Own money, so the weeks add up to the tour total above them.
			   `amount` is the shared-only figure the Everyone tab uses and
			   would leave every private price out of these rows. */
			var wPriced = w.ownPriced || 0;
			var wAmount = w.ownAmount || 0;
			return "<tr><td>" + esc(prettyDate(w.start)) + " – " + esc(prettyDate(w.end)) + "</td>" +
				"<td>" + w.n + "</td>" +
				'<td class="' + (aM ? "sl-pos" : "sl-dim") + '">' + pct(w.a_showed, aM) + "</td>" +
				"<td>" + pct(w.booked, dec) + "</td>" +
				'<td class="' + (state.showMoney ? "" : "sl-mask") + '">' +
					(wPriced ? (cash(wAmount / wPriced) || "—") : '<span class="sl-dim">—</span>') + "</td>" +
				'<td class="' + (state.showMoney ? "" : "sl-mask") + '">' +
					(wAmount ? (cash(wAmount) || "—") : '<span class="sl-dim">—</span>') + "</td></tr>";
		}).join("");

		return '<div class="sl-scroll" style="margin-top:20px"><table class="sl-table"><thead><tr>' +
			"<th>Week</th><th>Tickets</th><th>Appt show rate</th><th>Book rate</th><th>Average party</th><th>Week total</th>" +
			"</tr></thead><tbody>" + rows + "</tbody></table></div>" +
			'<p class="sl-fn">Weeks run Wednesday morning to Wednesday night. A tour rarely starts or ends on one, so the first and last weeks here are usually part weeks.</p>';
	}

	function tourSaveGoal(value) {
		var was = state.tour.progress && state.tour.progress.reached;

		state.tour.busy = true;
		render();

		api("/tour/goal", { method: "POST", body: { goal: value } })
			.then(function (res) {
				if (res) {
					state.tour.open = res.open || null;
					state.tour.history = res.history || [];
					state.tour.progress = res.progress || null;
				}
				state.tour.goalEditing = false;
				/* Setting a goal you have already passed is a reason to
				   celebrate too — but only if you were not already past one. */
				maybeCelebrateGoal(was);
			})
			.catch(function (err) {
				state.tour.error = (err && err.message) || "That did not save.";
			})
			.finally(function () {
				state.tour.busy = false;
				render();
			});
	}

	/**
	 * The moment a goal is met.
	 *
	 * Fired once per crossing, not once per render — otherwise every ticket
	 * saved afterwards, and every tab change, would set it off again and the
	 * thing would become an irritation rather than a moment.
	 */
	function maybeCelebrateGoal(wasReached) {
		var p = state.tour.progress;
		if (!p || !p.goal) { state.tour.celebrated = false; return; }

		if (p.reached && !wasReached && !state.tour.celebrated) {
			state.tour.celebrated = true;
			state.tour.moved = "goal";
			setTimeout(function () {
				state.tour.moved = null;
				var bar = root.querySelector(".sl-goal");
				if (bar) bar.classList.remove("sl-moved-goal");
			}, 3200);
			/* The same gilded light a big ticket gets, thrown from the goal
			   bar rather than the save button. */
			celebrate(root.querySelector(".sl-goalbar") || root.querySelector(".sl-tourbar"),
				{ outcome: "booked", amount: p.goal });
		}
		if (!p.reached) state.tour.celebrated = false;
	}

	function tourRefresh() {
		return api("/tour")
			.then(function (res) {
				state.tour.open = (res && res.open) || null;
				state.tour.history = (res && res.history) || [];
				state.tour.progress = (res && res.progress) || null;
				state.tour.known = true;
				render();
			})
			.catch(function () {
				/* Only unknown if the page did not carry it either. */
				if (!D.tour) { state.tour.known = false; render(); }
			});
	}

	function tourSaveStart() {
		var d = root.querySelector('[data-tourfield="start"]');
		var t = root.querySelector('[data-tourfield="startTime"]');
		if (!d) return;

		state.tour.busy = true;
		state.tour.error = "";
		render();

		api("/tour/adjust", { method: "POST", body: { start: d.value, startTime: t ? t.value : "" } })
			.then(function (res) {
				if (res) {
					state.tour.open = res.open || null;
					state.tour.history = res.history || [];
					state.tour.progress = res.progress || null;
				}
				state.tour.editing = false;
			})
			.catch(function (err) {
				/* Kept open on failure, with the reason beside the fields, so
				   the correction is not simply thrown away. */
				state.tour.error = (err && err.message) || "That did not save.";
			})
			.finally(function () {
				state.tour.busy = false;
				render();
			});
	}

	function tourAction(path, body) {
		var wasOpen = !!state.tour.open;
		state.tour.busy = true;
		render();

		return api(path, { method: "POST", body: body || {} })
			.then(function (res) {
				if (!res) return;
				state.tour.open = res.open || null;
				state.tour.history = res.history || [];
				state.tour.progress = res.progress || null;
				/* The tour's figures live on Past tours now, so closing one
				   goes there rather than leaving its summary on a tab the
				   person may not open next. */
				if (res.closed) {
					state.tour.just = res.closed;
					state.tab = "past";
					state.open.past = "tours";
				}

				/* Mark which way it moved so the bar can play the right
				   arrival or departure, then clear it — the animation belongs
				   to the moment of change, not to the state that follows. */
				var nowOpen = !!state.tour.open;
				if (nowOpen !== wasOpen) {
					state.tour.moved = nowOpen ? "in" : "out";
					setTimeout(function () {
						state.tour.moved = null;
						var bar = root.querySelector(".sl-tourbar");
						if (bar) bar.classList.remove("sl-moved-in", "sl-moved-out");
					}, 1500);
				}
			})
			.catch(function (err) {
				state.status = { msg: err.message || "That did not work.", ok: false };
			})
			.finally(function () {
				state.tour.busy = false;
				render();
			});
	}



	/** Own tickets, one row per party type, ranked by volume. */
	function partyRows(tickets) {
		return Object.keys(PARTY).map(function (k) {
			var row = withRates(tally(tickets.filter(function (t) {
				return (t.partyTypes || []).indexOf(k) !== -1;
			})));
			row.name = PARTY[k];
			return row;
		}).filter(function (r) { return r.n > 0; })
		  .sort(function (a, b) { return b.n - a.n; });
	}

	/** The house sends segments by label; pull out the party-type ones. */
	function housePartyRows(h) {
		var labels = {};
		Object.keys(PARTY).forEach(function (k) { labels[PARTY[k]] = true; });
		return (h.segments || [])
			.filter(function (seg) { return labels[seg.name]; })
			.map(withRates)
			.sort(function (a, b) { return b.n - a.n; });
	}

	/**
	 * The same trimmed mean the house view uses, so a personal average and a
	 * group average are calculated the same way: set aside the top and bottom
	 * tenth, average the rest. Under ten prices there is nothing to trim.
	 */
	function trimmedMean(values) {
		var v = values.slice().sort(function (a, b) { return a - b; });
		if (!v.length) return 0;
		var cut = v.length >= 10 ? Math.floor(v.length * 0.1) : 0;
		var core = cut ? v.slice(cut, v.length - cut) : v;
		return core.reduce(function (a, b) { return a + b; }, 0) / core.length;
	}

	/**
	 * Quartiles of a set of prices, matching what the server computes for the
	 * house so a personal range and a group range mean the same thing.
	 */
	function priceQuartiles(values) {
		var v = values.slice().sort(function (a, b) { return a - b; });
		if (!v.length) return { n: 0, p25: 0, median: 0, p75: 0, trimmed: 0 };
		// Read between neighbours, as a spreadsheet's PERCENTILE does. Taking the
		// nearest lower price pulled both ends of every "likely" range down.
		var at = function (q) {
			var pos = q * (v.length - 1), lo = Math.floor(pos), hi = Math.ceil(pos);
			return v[lo] + (v[hi] - v[lo]) * (pos - lo);
		};
		return { n: v.length, p25: at(0.25), median: at(0.5), p75: at(0.75), trimmed: trimmedMean(v) };
	}

	/** Own booked prices, which several figures are built from. */
	/**
	 * Does this ticket's price count toward your own figures?
	 *
	 * One rule, named once. `!== "omitted"` reads as "shared or private" and
	 * is not: it also lets through a booking whose visibility was never
	 * chosen, which tally() has never counted. Written out separately in
	 * three places, the two drifted apart and the headline disagreed with
	 * the goal bar about the same tour. It mirrors sl_own_price() on the
	 * server exactly.
	 */
	function ownPriceOf(t) {
		if (t.outcome !== "booked") return 0;
		if (t.priceMode !== "included" && t.priceMode !== "private") return 0;
		return num(t.amount) || 0;
	}

	function ownPrices(tickets) {
		return tickets.map(ownPriceOf).filter(function (v) { return v > 0; });
	}

	/* ==================================================================
	   Limo money

	   A booking that arrived by limo carries a cut off the top before
	   anything else is split. On the house's figures that is 30% to the
	   limo and 35% kept by the courtesan, which is what leaves 65% on the
	   house's side of a limo booking once its own half of the remainder is
	   counted with it.

	   The rates come from the settings page rather than from here, so a
	   house on different terms is not stuck with somebody else's.

	   Nothing about this is stored. It is worked out from the limo flag and
	   the amount, both of which have been on every ticket since the log
	   began — so every ticket ever written already counts, with nothing to
	   backfill and no migration to run.
	   ================================================================== */
	function limoRates() {
		var cut = typeof D.limoCut === "number" ? D.limoCut : 30;
		var share = typeof D.limoShare === "number" ? D.limoShare : 35;
		return {
			cut: Math.max(0, Math.min(100, cut)),
			share: Math.max(0, Math.min(100, share)),
		};
	}

	/**
	 * What a limo booking is worth, broken into its parts.
	 *
	 * Only a booked ticket marked as arriving by limo counts, and only one
	 * carrying a price — a limo booking with no figure on it is still a limo
	 * booking, so it is counted separately rather than silently dropped.
	 */
	function limoOf(tickets, priceFn) {
		var r = limoRates();
		var price = priceFn || ownPriceOf;
		var out = { bookings: 0, unpriced: 0, gross: 0, cut: 0, share: 0, rates: r };

		tickets.forEach(function (t) {
			if (t.limo !== "yes" || t.outcome !== "booked") return;
			out.bookings++;
			var amount = price(t);
			if (!amount) { out.unpriced++; return; }
			out.gross += amount;
		});

		out.cut = out.gross * (r.cut / 100);
		out.share = out.gross * (r.share / 100);
		out.priced = out.bookings - out.unpriced;
		return out;
	}


	/**
	 * What the appointments that never arrived might have been worth.
	 *
	 * Valued at the trimmed average of the prices actually booked, with the
	 * middle half of those prices carried alongside as the likely span. It is
	 * a potential figure: a guest who never turned up was never money in hand.
	 */
	function noShowValue(tickets, totals, groupPrices) {
		var missed = totals.a_noshow || 0;
		var q = groupPrices && groupPrices.n
			? { n: groupPrices.n, p25: groupPrices.p25, p75: groupPrices.p75, trimmed: groupPrices.trimmed }
			: priceQuartiles(ownPrices(tickets));

		if (!missed || !q.n || !q.trimmed) {
			return { missed: missed, value: 0, avg: 0, low: 0, high: 0, from: q.n || 0 };
		}
		return {
			missed: missed,
			avg: q.trimmed,
			value: missed * q.trimmed,
			low: q.n >= 4 ? missed * q.p25 : 0,
			high: q.n >= 4 ? missed * q.p75 : 0,
			from: q.n,
		};
	}

	/** Book rate for one ticket type. */
	function bookRateFor(tickets, kind) {
		var t = withRates(tally(tickets.filter(function (x) { return kindOf(x) === kind; })));
		return { booked: t.booked, decided: t.decided, rate: rateVal(t.booked, t.decided) };
	}

	function segmentsOf(tickets) {
		var anyIs = function (t, v) { return t.limo === v || t.outside === v || t.selfDrive === v; };
		var defs = [
			["Appointments", function (t) { return kindOf(t) === "appointment"; }],
			["Requests / walk-ins", function (t) { return kindOf(t) === "request"; }],
			["Picked from lineup", function (t) { return kindOf(t) === "lineup"; }],
			["Walk-in from bar", function (t) { return kindOf(t) === "bar"; }],
			["Pull-ins", function (t) { return kindOf(t) === "pull"; }],
			["New guests", function (t) { return t.guestType === "new"; }],
			["Returning to me", function (t) { return t.guestType === "returning"; }],
			["New to me, ranch regular", function (t) { return t.guestType === "house"; }],
			["Guest history unknown", function (t) { return !t.guestType || t.guestType === "unknown"; }],
			["Hotel guests", function (t) { return t.hotelGuest === "yes"; }],
			["Not staying here", function (t) { return t.hotelGuest === "no"; }],
			["Limo", function (t) { return t.limo === "yes"; }],
			["Outside driver", function (t) { return t.outside === "yes"; }],
			["Self drive", function (t) { return t.selfDrive === "yes"; }],
			["Transport unknown", function (t) { return !anyIs(t, "yes") && anyIs(t, "unknown"); }],
			["Transport not recorded", function (t) { return !anyIs(t, "yes") && !anyIs(t, "unknown"); }],
		];
		return defs.map(function (d) {
			var s = tally(tickets.filter(d[1]));
			s.name = d[0];
			return s;
		}).filter(function (s) { return s.n > 0; });
	}

	/* ---------------- view fragments ---------------- */
	/**
	 * A field as a dropdown.
	 *
	 * The form used rows of pills, which grew unwieldy once a field carried
	 * five choices and pushed the form long on a phone. A native select is one
	 * line whatever it holds, and on a phone it opens the system picker, which
	 * is easier to hit than a row of small targets.
	 *
	 * The chosen value's tone is carried on the element so the closed control
	 * still shows its colour, the way the pills did.
	 */
	function pick(name, value, options, placeholder) {
		var chosen = options.filter(function (o) { return o.value === value; })[0];

		return '<div class="sl-pickwrap' + (chosen ? " is-set" : "") + '" data-tone="' + (chosen ? (chosen.tone || "pos") : "none") + '">' +
			'<select class="sl-select" data-field="' + esc(name) + '" aria-label="' + esc(name.replace(/_/g, " ")) + '">' +
				'<option value=""' + (chosen ? "" : " selected") + ">" + esc(placeholder || "Choose…") + "</option>" +
				options.map(function (o) {
					return '<option value="' + esc(o.value) + '"' + (o.value === value ? " selected" : "") + ">" + esc(o.label) + "</option>";
				}).join("") +
			"</select>" +
			'<span class="sl-pickcaret" aria-hidden="true"></span>' +
		"</div>";
	}

	function seg(name, value, options, mini) {
		return '<div class="sl-seg" role="group" aria-label="' + esc(name) + '">' + options.map(function (o) {
			return '<button type="button" class="sl-opt' + (mini ? " sl-mini" : "") + '" data-tone="' + (o.tone || "pos") +
				'" data-field="' + esc(name) + '" data-value="' + esc(o.value) + '" aria-pressed="' + (value === o.value) + '">' + esc(o.label) + "</button>";
		}).join("") + "</div>";
	}



	/**
	 * Party types ranked by volume, with the rates that matter beside each.
	 * Works from own tickets or from the house segment rows.
	 */
	function partyCard(rows, total, whose) {
		if (!rows.length) {
			return '<section class="sl-card"><p class="sl-eyebrow">Party types</p>' +
				'<div class="sl-empty">No party types recorded yet. Tag a few tickets and they rank here.</div></section>';
		}

		var top = Math.max.apply(null, [1].concat(rows.map(function (r) { return r.n; })));

		return '<section class="sl-card"><p class="sl-eyebrow">Party types</p>' +
			'<div class="sl-ptlist">' + rows.map(function (r) {
				return '<div class="sl-ptrow">' +
					'<div class="sl-pthead"><span class="sl-ptname">' + esc(r.name) + "</span>" +
						'<span class="sl-ptcount">' + r.n + " · " + pct(r.n, total) + " of tickets</span></div>" +
					'<div class="sl-ptbar"><div class="sl-ptfill" style="width:' + (r.n / top) * 100 + '%"></div></div>' +
					'<div class="sl-ptrates">' +
						'<span>Appts kept <strong class="sl-pos">' + (r.aMarked ? pct(r.a_showed, r.aMarked) : "n/a") + "</strong></span>" +
						'<span>Booked <strong>' + pct(r.booked, r.decided) + "</strong></span>" +
						// What a party type earns is your own business, so the
						// figure is dropped from the pooled view entirely.
						(whose === "house" ? "" :
							'<span class="' + (state.showMoney ? "" : "sl-mask") + '">' + (cash(r.amount) || "—") + "</span>") +
					"</div></div>";
			}).join("") + "</div>" +
			'<p class="sl-fn">Ranked by how often each is logged. A ticket can carry several, so these add to more than 100%.' +
			(whose === "house" ? " Prices are not broken down by type here — that is on your own insights." : "") + "</p></section>";
	}

	/**
	 * How each finding is worked out, in plain terms. Shown on hover and on
	 * keyboard focus, because a number without its method is a number you
	 * have to take on trust.
	 */
	var HOW = {
		"Stacking": "Separates your priced bookings into those tagged with one party type and those tagged with two or more, and compares the average of each. Each side needs three prices and the gap must be at least 15%.",
		"Time of night": "Splits your tickets into those logged before 8pm and those from 8pm on, and compares the share of decided tickets that booked. Anything before 6am counts as late, not early. Each side needs six tickets, four of them decided, and the gap must be twelve points.",
		"Your best night": "Adds up the priced bookings on each night and finds the largest. It is shown when that night came to at least 1.8 times a typical night with a booking, and you have five or more such nights to compare.",
		"Ten appointments": "Takes every appointment the floor marked as kept or missed to get the share that arrive, then the share of decided appointments that booked, and multiplies the two. Scaling it to ten makes it easy to hold in your head. Walk-ins are left out because they are already through the door.",
		"Which way in closes": "For each way a ticket comes in, divides the ones that booked by the ones decided either way. A kind needs five decided tickets, and the best and worst must be eight points apart.",
		"Limo or own car": "Compares the share of decided tickets that booked for guests who came by limo with the share for guests who drove themselves. Each side needs five decided tickets and the gap must be eight points.",
		"The hour that closes": "Groups decided tickets by the hour they were logged and finds the hour with the highest share booked. An hour needs eight decided tickets, and must beat the whole night's book rate by eight points.",
		"New faces": "Splits the last four weeks into the most recent fourteen days and the fourteen before, and compares new guests as a share of tickets where guest history was recorded. Shown when the share has moved six points or more.",
		"Most popular": "Counts how many of your tickets carry each party type, ranked by that count. A ticket carrying several is counted once under each, so the shares add to more than 100%. Needs at least three tickets on the leading type before it appears.",
		"Most profitable": "Takes every booked ticket whose price you entered, groups them by party type, and averages each group. Needs at least three priced tickets on a type, and the leader must average at least 15% above the rest before it is called out.",
		"Worth a look": "Compares how often a party type is logged against what it averages. A type that comes up frequently but averages below your other work is flagged — it is not necessarily a problem, but it is where a rate change would move the most money.",
		"Books best": "Splits your tickets by party type and compares the share of decided tickets that booked. Only types with at least four decided tickets on each side count, and the gap must be at least 15 points.",
		"Your guests": "Counts tickets by guest history — new, returning to you, or a ranch regular new to you. Tickets where it was not recorded are left out of the split rather than guessed at.",
		"New vs returning": "Compares the share of decided tickets that booked for new guests against returning ones. Both sides need at least four decided tickets, and the gap must be at least 10 points.",
		"Your week": "Groups every ticket by day of the week, then compares the busiest day by ticket count against the day that booked the most money. Needs at least eight tickets across three or more distinct days.",
		"Where it comes from": "Splits tickets by how they arrived — appointment, request, lineup pick, bar walk-in or pull-in — and averages the prices within each. Needs at least three priced tickets on each side being compared.",
		"No-shows": "Multiplies the appointments that were not kept by the middle range of your own booked prices. It is what those slots might have been worth, not money you had and lost.",
		"Your range": "Sorts every price you have entered, shared and private together, and takes the 25th and 75th percentile — the middle half. Needs at least eight priced parties.",
		"Momentum": "Compares the share of decided tickets that booked on the tour in progress against the same rate across every earlier tour. The current tour needs at least five decided tickets, earlier tours at least ten between them, and the gap must be at least 8 points.",
		"Price trend": "Takes the trimmed average of the prices you entered on this tour against the trimmed average across every earlier tour. Needs at least three priced parties this tour and five before, and the move must be at least 12% either way.",
		"Follow-through": "Reads your appointments as a chain: how many arrive, then how many of the decided arrivals book. Whichever step loses the larger share is named. Needs at least eight marked appointments and five decided arrivals.",
		"Prime hours": "Groups your tickets by the hour on them. The busiest hour is the one with the most tickets; the best paid is the one with the highest average price. Hours with fewer than three tickets are ignored, and this only appears when the two differ.",
		"Repeat value": "Trimmed average of prices from returning guests (to you, or ranch regulars) against the same figure for new guests. Each side needs at least three priced parties, and the gap must be at least 20%.",
		"Staying here": "Compares how many appointments were kept by guests marked as staying on the property against those marked as not. Each side needs at least three marked appointments, and the gap must be at least 12 points.",
		"Room upstairs": "Trimmed average of the prices you entered for guests staying on the property against those who were not. Each side needs at least three priced parties, and the gap must be at least 15%.",
		"Streak": "Walks your decided tickets in the order they happened and counts how many booked in a row, ending at the most recent. Shows from three.",

		"The usual range": "Sorts every shared price and takes the 25th and 75th percentile — the middle half. Half of all parties fall inside this range, which makes it more use than an average when deciding what to quote. Needs at least eight shared prices.",
		"Where the money is": "Sorts every shared price, takes the largest tenth, and expresses their combined value as a share of all money booked. A high figure means the floor depends on a few big nights rather than steady work.",
		"Busiest against best paid": "Groups tickets by the hour they were logged. The busiest hour is the one with the most tickets; the best paid is the one with the highest average price. Hours with fewer than three tickets are ignored, and this only appears when the two are different hours.",
		"The night that closes": "Groups tickets by day of the week and compares the share of decided tickets that booked. Each day needs at least five decided tickets, and the best and worst must differ by at least 10 points.",
		"Where no-shows land": "Groups appointments by day of the week and finds the day with the highest share that were not kept. Needs at least four appointments on that day, and only appears once it passes 25%.",
		"Requests booked": "Counts requests that booked against requests that were decided either way, then sets that beside the same figure for appointments. Undecided tickets are excluded from both.",
		"New guests": "Compares what share of tickets came from new guests against what share of the money they account for. A gap of at least 8 points in either direction is worth naming.",
		"Repeat business": "Counts tickets from guests returning to the person who logged them, or already known to the house, as a share of tickets where guest history was recorded.",
		"Prices shared": "Counts booked tickets carrying a price shared with everyone, against all booked tickets. Prices kept private or left off are counted in the total but not the shared figure — this is about how complete the group picture is, not about anyone's takings.",
		"Potential no-show value": "Multiplies the appointments the floor did not keep by the group's middle range of shared prices. A potential figure: an appointment that was never kept was never money in hand.",
		"Week over week": "Compares the last completed Wednesday-to-Wednesday week against the one before it — ticket volume as a percentage move, book rate in points. Both weeks need at least five tickets, and the week in progress is left out.",
		"The floor's weekend": "Counts everyone's Friday and Saturday tickets as a share of all tickets. Needs at least twenty tickets across the floor.",
		"A room upstairs": "Compares the book rate of everyone's hotel-guest tickets against those marked as not staying on the property. Each side needs at least five decided tickets and the gap must be at least 8 points.",
		"What a hotel guest spends": "Average of the shared prices on hotel-guest bookings against the same for guests not staying here. Each side needs at least four shared prices and the gap must be at least 15%.",
		"Staying on the property": "Hotel-guest tickets as a share of the tickets where the question was answered either way. Tickets left unmarked are not counted on either side.",
	};

	/* ==================================================================
	   Observations
	   Plain-language findings drawn from your own tickets. Every finding
	   carries its own minimum sample — a rate built on three tickets is
	   noise, and presenting it as a pattern would be worse than silence.
	   ================================================================== */

	var DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

	function observations(tickets, all) {
		var out = [];
		var rows = partyRows(tickets);
		// The trimmed average, the same one the headline shows. This used to be
		// the plain mean, so a finding could quote "your overall average" as a
		// different figure from the Average party directly above it.
		var avgAll = trimmedMean(ownPrices(tickets));

		/* --- most logged party type --- */
		if (rows.length && rows[0].n >= 3) {
			var top = rows[0];
			var runner = rows[1];
			out.push({
				tag: "Most popular",
				head: top.name + " leads, on " + pct(top.n, all.n) + " of your tickets",
				text: "Logged " + top.n + " times" +
					(runner ? ", ahead of " + runner.name + " at " + runner.n + "." : ".") +
					" Worth knowing what you're best known for when you decide what to lead with.",
				moves: [
					"Lead with " + top.name + " when you write your own description — you are already known for it, and the ticket that matches the pitch is the one that closes.",
					(runner ? "Offer " + runner.name + " as the natural step up from " + top.name + " rather than a separate choice, so the second option is an addition and not a decision." : "Name a second option you would be happy to run, so there is somewhere to go when the first is not the fit."),
					"Check this against your best-paying type below — the party you are asked for most is not always the one worth steering toward.",
				],
			});
		}

		/* --- highest average price --- */
		var priced = rows.filter(function (r) { return r.priced >= 3; });
		if (priced.length && avgAll) {
			var rich = priced.slice().sort(function (a, b) { return (b.amount / b.priced) - (a.amount / a.priced); })[0];
			var richAvg = rich.amount / rich.priced;
			var ratio = richAvg / avgAll;
			if (ratio >= 1.15) {
				out.push({
					tag: "Most profitable",
					head: rich.name + " averages " + (cash(richAvg) || "—") + ", " + ratio.toFixed(1) + "× your overall average",
					text: "Across " + rich.priced + " priced " + (rich.priced === 1 ? "ticket" : "tickets") +
						", against an overall average of " + (cash(avgAll) || "—") + ". Popular and profitable are not always the same list.",
					money: true,
					moves: [
						"Raise what you quote on " + rich.name + " first — it already carries your highest average, so it takes the increase most easily.",
						"Mention " + rich.name + " early rather than waiting to be asked, while there is still room in the conversation to shape the booking.",
						"If a party is heading toward your " + (cash(avgAll) || "—") + " average, ask whether " + rich.name + " is on the table before settling the price.",
					],
				});
			}
		}

		/* --- popular but underpriced, or profitable but rare --- */
		if (rows.length >= 2 && priced.length >= 2 && avgAll) {
			var byAvg = priced.slice().sort(function (a, b) { return (b.amount / b.priced) - (a.amount / a.priced); });
			var best = byAvg[0];
			if (rows[0].name !== best.name && best.n < rows[0].n) {
				out.push({
					tag: "Worth a look",
					head: best.name + " earns more per party than " + rows[0].name + " but comes up less often",
					text: (cash(best.amount / best.priced) || "—") + " against " +
						(cash(rows[0].priced ? rows[0].amount / rows[0].priced : 0) || "—") + " per party, on " +
						best.n + " tickets against " + rows[0].n + ". Room to steer more conversations that way.",
					money: true,
					moves: [
						"Bring " + best.name + " up in conversations that are drifting toward " + rows[0].name + " — the gap per party is worth the sentence it takes to ask.",
						"Work out why it comes up less often: if it is not listed, not mentioned, or not priced clearly, that is a fixable reason rather than a lack of demand.",
						"Try leading with " + best.name + " for a week and watch whether the average moves — this is a small enough change to test cleanly.",
					],
				});
			}
		}

		/* --- best booking party type --- */
		var converts = rows.filter(function (r) { return r.decided >= 4; });
		if (converts.length >= 2) {
			var bestConv = converts.slice().sort(function (a, b) { return pctNum(b.booked, b.decided) - pctNum(a.booked, a.decided); })[0];
			var worstConv = converts.slice().sort(function (a, b) { return pctNum(a.booked, a.decided) - pctNum(b.booked, b.decided); })[0];
			if (bestConv.name !== worstConv.name && pctNum(bestConv.booked, bestConv.decided) - pctNum(worstConv.booked, worstConv.decided) >= 15) {
				out.push({
					tag: "Books best",
					head: bestConv.name + " books at " + pct(bestConv.booked, bestConv.decided) + ", against " + pct(worstConv.booked, worstConv.decided) + " for " + worstConv.name,
					text: "From " + bestConv.decided + " and " + worstConv.decided + " decided tickets. The conversations that close are worth having more of.",
					moves: [
						"Steer toward " + bestConv.name + " earlier in the conversation — it is where your yes rate is already highest.",
						"Look at what you say differently on a " + worstConv.name + " ticket; the gap is more often in the framing than the party.",
						"When a " + worstConv.name + " looks unlikely to land, offer " + bestConv.name + " as an alternative rather than letting the conversation end.",
					],
				});
			}
		}

		/* --- new vs returning --- */
		var known = all.g_new + all.g_ret + all.g_house;
		if (known >= 5) {
			var returning = all.g_ret + all.g_house;
			out.push({
				tag: "Your guests",
				head: pct(all.g_new, known) + " new, " + pct(returning, known) + " returning",
				text: all.g_new + " new " + (all.g_new === 1 ? "guest" : "guests") + ", " + all.g_ret + " returning to you and " +
					all.g_house + " new to you but known to the ranch" +
					(all.g_unknown ? ". " + all.g_unknown + " tickets have no guest history recorded, so this leaves them out." : "."),
				moves: [
					(pctNum(all.g_new, known) >= 60
						? "You are living on new guests — a short message to past guests before a tour is the cheapest booking you will get."
						: "Your returning guests are carrying you — keep the list warm between tours, since a returning guest costs nothing to find."),
					"Ask every new guest one thing worth remembering and note it privately; a specific detail on the second visit is what turns one party into a habit.",
					(all.g_unknown ? "Tag guest history on the " + all.g_unknown + " tickets missing it — this reading gets sharper the moment they are filled in." : "Keep tagging guest history on every ticket; it is what makes the repeat-value figures below trustworthy."),
				],
			});
		}

		/* --- do returning guests book better? --- */
		var newT = withRates(tally(tickets.filter(function (t) { return t.guestType === "new"; })));
		var retT = withRates(tally(tickets.filter(function (t) { return t.guestType === "returning" || t.guestType === "house"; })));
		if (newT.decided >= 4 && retT.decided >= 4) {
			var gap = pctNum(retT.booked, retT.decided) - pctNum(newT.booked, newT.decided);
			if (Math.abs(gap) >= 10) {
				out.push({
					tag: "New vs returning",
					head: (gap > 0 ? "Returning guests book " : "New guests book ") + Math.abs(Math.round(gap)) + " points better",
					text: "Returning " + pct(retT.booked, retT.decided) + " against new " + pct(newT.booked, newT.decided) + ". " +
						(gap > 0
							? "Repeat business is doing the heavy lifting — worth protecting."
							: "First meetings are converting well; the follow-through is where the gap is."),
					moves: [
						(gap > 0
							? "Put your effort into the message after a party rather than the pitch before one — the second booking is where your rate is best."
							: "Your first meetings land; the drop is on the return, so treat the goodbye as the start of the next booking."),
						(gap > 0
							? "Give returning guests a reason that is specific to them — a remembered preference beats a discount and costs nothing."
							: "Ask returning guests directly what would bring them back; a low return rate usually has one reason behind it."),
						"Track this again after the next tour — a gap this size is worth watching rather than acting on once.",
					],
				});
			}
		}


		/* --- busiest and best-earning day --- */
		if (all.n >= 8) {
			var days = {};
			tickets.forEach(function (t) {
				var d = fromISO(t.date).getDay();
				days[d] = days[d] || { n: 0, amount: 0, booked: 0 };
				days[d].n++;
				days[d].amount += ownPriceOf(t);
				if (t.outcome === "booked") days[d].booked++;
			});
			var keys = Object.keys(days);
			if (keys.length >= 3) {
				var busiest = keys.slice().sort(function (a, b) { return days[b].n - days[a].n; })[0];
				var richest = keys.slice().sort(function (a, b) { return days[b].amount - days[a].amount; })[0];
				out.push({
					tag: "Your week",
					head: DOW[busiest] + " is your busiest day" + (richest !== busiest ? ", but " + DOW[richest] + " earns most" : ""),
					text: days[busiest].n + " tickets on " + DOW[busiest] + "s" +
						(richest !== busiest
							? ", while " + DOW[richest] + "s bring in " + (cash(days[richest].amount) || "—") + ". The busiest day and the best-paying day are not the same."
							: ", and they bring in the most too."),
					money: richest !== busiest,
					moves: [
						(richest !== busiest
							? "Hold your best availability for " + DOW[richest] + "s — the money is landing there, not on your busiest day."
							: DOW[busiest] + "s are carrying both volume and money — protect them and do not fill them with low-value bookings."),
						(richest !== busiest
							? "Quote a little higher on " + DOW[richest] + "s and see if it holds; a day that already earns more will bear it first."
							: "Try adding capacity around " + DOW[busiest] + "s, since the demand is proven there."),
						"Look at what makes your quietest day quiet — a slow day is either the wrong day or an unpromoted one, and those need different fixes.",
					],
				});
			}
		}

		/* --- which ticket type earns --- */
		var kinds = [
			["Appointments", "appointment"], ["Requests", "request"],
			["Lineup picks", "lineup"], ["Bar walk-ins", "bar"], ["Pull-ins", "pull"],
		].map(function (d) {
			var r = withRates(tally(tickets.filter(function (t) { return (t.kind || "appointment") === d[1]; })));
			r.name = d[0];
			return r;
		}).filter(function (r) { return r.priced >= 3; });

		if (kinds.length >= 2) {
			var bestKind = kinds.slice().sort(function (a, b) { return (b.amount / b.priced) - (a.amount / a.priced); })[0];
			out.push({
				tag: "Where it comes from",
				head: bestKind.name + " bring your highest average at " + (cash(bestKind.amount / bestKind.priced) || "—"),
				text: "Across " + bestKind.priced + " priced tickets, out of " + bestKind.n + " logged. Useful when you're deciding where your effort goes.",
				money: true,
				moves: [
					"Put more hours into whatever produces " + bestKind.name.toLowerCase() + " — it is your best-paying source per party.",
					"Work out what feeds it: if " + bestKind.name.toLowerCase() + " come from a listing, a referral, or the floor, that is the thing to spend time on.",
					"Compare the effort each source costs you, not only what it pays — the highest average is only better if it does not take three times as long to get.",
				],
			});
		}

		/* --- your usual range: the middle half of your own prices --- */
		var q = priceQuartiles(ownPrices(tickets));
		if (q.n >= 8) {
			out.push({
				tag: "Your range",
				head: (cash(q.p25) || "—") + " – " + (cash(q.p75) || "—") + " is where half your parties land",
				text: "Midpoint " + (cash(q.median) || "—") + ", across " + q.n + " priced parties. A range is more use than an average when you are deciding what to quote.",
				money: true,
				moves: [
					"Open at " + (cash(q.p75) || "—") + " rather than your midpoint — a quarter of your parties already land at or above it, so it is a proven number, not an ambitious one.",
					"Treat " + (cash(q.p25) || "—") + " as your floor and stop negotiating below it; the parties under it are the ones costing you the most per hour.",
					"Watch this range after any price change — the middle half moving up is the sign it held, and it moves before the average does.",
				],
			});
		}

		/* --- momentum: this tour against everything before it --- */
		var toursAll = buildTours(tickets);
		if (toursAll.length >= 2) {
			var curTour = toursAll[toursAll.length - 1];
			var curT = withRates(tally(tickets.filter(function (t) { return inTour(t.date, curTour); })));
			var beforeT = withRates(tally(tickets.filter(function (t) { return !inTour(t.date, curTour); })));
			if (curT.decided >= 5 && beforeT.decided >= 10) {
				var mGap = pctNum(curT.booked, curT.decided) - pctNum(beforeT.booked, beforeT.decided);
				if (Math.abs(mGap) >= 8) {
					out.push({
						tag: "Momentum",
						head: "This tour is booking " + Math.abs(Math.round(mGap)) + " points " + (mGap > 0 ? "above" : "below") + " your usual",
						text: pct(curT.booked, curT.decided) + " of decided tickets this tour, against " + pct(beforeT.booked, beforeT.decided) +
							" across every earlier tour. " + (mGap > 0 ? "Whatever is different this run is working." : "Worth thinking about what is different this run."),
						moves: [
							(mGap > 0
								? "Write down what you changed this run while it is fresh — the tour that works is only useful if you can repeat it."
								: "List what is different this run: the town, the hours, the pricing, the mood. One of them is usually the whole gap."),
							(mGap > 0
								? "This is the run to raise your quote on — a book rate this far above your usual means you have room."
								: "Before dropping your price, check the follow-through reading: a low rate is often arrivals rather than closing."),
							"Give it another week of tickets before you act on it — a tour can move eight points on a handful of nights.",
						],
					});
				}
			}

			/* --- price trend: what a party is worth now against before --- */
			var curPrices = ownPrices(tickets.filter(function (t) { return inTour(t.date, curTour); }));
			var oldPrices = ownPrices(tickets.filter(function (t) { return !inTour(t.date, curTour); }));
			if (curPrices.length >= 3 && oldPrices.length >= 5) {
				var curAvg = trimmedMean(curPrices), oldAvg = trimmedMean(oldPrices);
				if (oldAvg > 0 && (curAvg / oldAvg >= 1.12 || curAvg / oldAvg <= 0.88)) {
					var move = Math.round((curAvg / oldAvg - 1) * 100);
					out.push({
						tag: "Price trend",
						head: "Your average party is " + (move > 0 ? "up " : "down ") + Math.abs(move) + "% this tour",
						text: (cash(curAvg) || "—") + " this tour against " + (cash(oldAvg) || "—") + " across earlier tours, both trimmed so one unusual night does not carry the figure.",
						money: true,
						moves: [
							(move > 0
								? "Hold the new number. An average that has moved up " + Math.abs(move) + "% is the price working, not a run of luck."
								: "Find where the drop is coming from — a lower average is usually one party type or one discount you started offering, not the whole tour."),
							(move > 0
								? "Raise your opening quote to match what you are already getting; the average moves after the ask does, not before."
								: "Stop quoting below your usual floor for the rest of this tour and watch whether the volume actually falls — often it does not."),
							"Check this against your book rate before deciding: a higher average with the same rate is a win, a higher average with a falling rate is a warning.",
						],
					});
				}
			}
		}

		/* --- follow-through: where appointments leak --- */
		if (all.aMarked >= 8) {
			var arrived = withRates(tally(tickets.filter(function (t) {
				return kindOf(t) === "appointment" && t.attendance === "showed";
			})));
			if (arrived.decided >= 5) {
				var showRate = pctNum(all.a_showed, all.aMarked);
				var closeRate = pctNum(arrived.booked, arrived.decided);
				var arriveLeak = 100 - showRate, closeLeak = 100 - closeRate;
				out.push({
					tag: "Follow-through",
					head: arriveLeak >= closeLeak
						? "More is lost at the door than in the room: " + Math.round(arriveLeak) + "% of appointments do not arrive"
						: "More is lost in the room than at the door: " + Math.round(closeLeak) + "% of guests who arrive do not book",
					text: pct(all.a_showed, all.aMarked) + " of appointments arrive, and " + pct(arrived.booked, arrived.decided) +
						" of the decided ones that arrive go on to book. Two different problems with two different fixes — this is which one is costing more.",
					moves: [
						(arriveLeak >= closeLeak
							? "Confirm the day before. Most appointments that never arrive were never really booked, and a reply the day before tells you which."
							: "The people are turning up — the gap is in the room. Work on the first five minutes rather than on getting more appointments."),
						(arriveLeak >= closeLeak
							? "Ask for something small at booking — a time confirmed in their own words, a deposit if you can take one. A guest who has committed to something turns up."
							: "Note the reason every time one walks; three or four entries usually show one repeated objection you can answer earlier."),
						"Work on the bigger loss first and leave the other alone — working on both at once makes it impossible to tell what helped.",
					],
				});
			}
		}

		/* --- your own hours: busiest against best paid --- */
		if (all.n >= 8) {
			var hrs = {};
			tickets.forEach(function (t) {
				var hh = parseInt(String(t.time || "0").split(":")[0], 10) || 0;
				hrs[hh] = hrs[hh] || { hour: hh, n: 0, priced: 0, amount: 0 };
				hrs[hh].n++;
				if (ownPriceOf(t) > 0) {
					hrs[hh].priced++; hrs[hh].amount += num(t.amount);
				}
			});
			var hourRows = Object.keys(hrs).map(function (k) { return hrs[k]; }).filter(function (r) { return r.n >= 3; });
			if (hourRows.length >= 3) {
				var busyH = hourRows.slice().sort(function (a, b) { return b.n - a.n; })[0];
				var richH = hourRows.filter(function (r) { return r.priced >= 3; })
					.sort(function (a, b) { return (b.amount / b.priced) - (a.amount / a.priced); })[0];
				if (richH && richH.hour !== busyH.hour) {
					out.push({
						tag: "Prime hours",
						head: hourLabel(busyH.hour) + " is your busiest hour, but " + hourLabel(richH.hour) + " pays best",
						text: busyH.n + " tickets land around " + hourLabel(busyH.hour) + ", while " + hourLabel(richH.hour) +
							" averages " + (cash(richH.amount / richH.priced) || "—") + " a party. Where the volume is and where the money is are not the same hour.",
						money: true,
						moves: [
							"Protect " + hourLabel(richH.hour) + ". If you are tired or already booked by then, your best-paying hour is being spent on nothing.",
							"Try moving one booking a night from " + hourLabel(busyH.hour) + " to " + hourLabel(richH.hour) + " and watch what it does to the night's total.",
							"Quote a little higher at " + hourLabel(richH.hour) + " — guests arriving in your best hour are already paying more than the rest.",
						],
					});
				}
			}
		}

		/* --- repeat value: what a returning guest is worth against a new one --- */
		var newPrices = ownPrices(tickets.filter(function (t) { return t.guestType === "new"; }));
		var retPrices = ownPrices(tickets.filter(function (t) { return t.guestType === "returning" || t.guestType === "house"; }));
		if (newPrices.length >= 3 && retPrices.length >= 3) {
			var newAvg = trimmedMean(newPrices), retAvg = trimmedMean(retPrices);
			if (newAvg > 0 && retAvg > 0 && (retAvg / newAvg >= 1.2 || newAvg / retAvg >= 1.2)) {
				var retUp = retAvg >= newAvg;
				out.push({
					tag: "Repeat value",
					head: (retUp ? "Returning guests" : "New guests") + " pay " +
						Math.round((Math.max(retAvg, newAvg) / Math.min(retAvg, newAvg) - 1) * 100) + "% more per party",
					text: "Returning average " + (cash(retAvg) || "—") + " against " + (cash(newAvg) || "—") + " for new guests. " +
						(retUp ? "The relationship is where the money grows — worth the upkeep between visits."
							: "First meetings are outearning the repeats; the second visit is where the price is slipping."),
					moves: [
						(retUp
							? "A returning guest is worth more than a new one — spend the time between tours keeping that list warm rather than only chasing new."
							: "Stop discounting the second visit. Familiarity is turning into a lower price, and that is a habit rather than a rule."),
						(retUp
							? "Quote returning guests at the same level as new ones or higher; they already know what they are buying."
							: "Ask returning guests for the same party they booked first rather than assuming they want something smaller."),
						"Watch the pair of figures each tour — the gap between them tells you whether your repeat business is growing or eroding.",
					],
					money: true,
				});
			}
		}

		/* --- staying here or not: the same guest, a different journey home --- */
		var hotelT = tickets.filter(function (t) { return t.hotelGuest === "yes"; });
		var awayT = tickets.filter(function (t) { return t.hotelGuest === "no"; });
		var hotel = withRates(tally(hotelT));
		var away = withRates(tally(awayT));

		/* Keeping the appointment. Someone already upstairs has nothing to
		   drive through to get here, which is the whole reason to look. */
		if (hotel.aMarked >= 3 && away.aMarked >= 3) {
			var hShow = pctNum(hotel.a_showed, hotel.aMarked);
			var aShow = pctNum(away.a_showed, away.aMarked);
			if (Math.abs(hShow - aShow) >= 12) {
				var hotelKeeps = hShow > aShow;
				out.push({
					tag: "Staying here",
					head: hotelKeeps
						? "Hotel guests keep " + Math.round(hShow - aShow) + " points more of their appointments"
						: "Hotel guests keep " + Math.round(aShow - hShow) + " points fewer of their appointments",
					text: pct(hotel.a_showed, hotel.aMarked) + " of appointments with guests staying here are kept, against " +
						pct(away.a_showed, away.aMarked) + " for guests coming from off the property.",
					moves: [
						hotelKeeps
							? "Take appointments from guests already on the property with more confidence — they have nothing to drive through to reach you."
							: "Confirm hotel guests the same way you confirm anyone else. Being upstairs makes an appointment easy to keep and just as easy to put off.",
						hotelKeeps
							? "For guests coming in from elsewhere, hold the slot more loosely, or ask for something small at booking to make it real."
							: "Give a hotel guest a reason the time matters — an evening arranged around a moment is kept more often than one that can happen any time.",
						"Watch this again after the next tour. Attendance moves with the weather and the calendar as much as with the guest.",
					],
				});
			}
		}

		/* What each is worth. A room upstairs is not the same wallet. */
		var hotelPrices = ownPrices(hotelT);
		var awayPrices = ownPrices(awayT);
		if (hotelPrices.length >= 3 && awayPrices.length >= 3) {
			var hAvg = trimmedMean(hotelPrices);
			var aAvg = trimmedMean(awayPrices);
			if (hAvg > 0 && aAvg > 0 && (hAvg / aAvg >= 1.15 || aAvg / hAvg >= 1.15)) {
				var hotelPays = hAvg >= aAvg;
				var spendGap = Math.round((Math.max(hAvg, aAvg) / Math.min(hAvg, aAvg) - 1) * 100);
				out.push({
					tag: "Room upstairs",
					head: (hotelPays ? "Hotel guests" : "Guests not staying here") + " spend " + spendGap + "% more a party",
					text: (cash(hAvg) || "—") + " from guests staying on the property against " + (cash(aAvg) || "—") +
						" from those arriving from elsewhere, across " + hotelPrices.length + " and " + awayPrices.length +
						" priced parties. Both figures are trimmed, so one unusual night does not carry either.",
					money: true,
					moves: [
						hotelPays
							? "Quote hotel guests at the top of your range. They are already spending on the stay, and the evening is the reason they booked the room."
							: "Do not assume a room upstairs means a bigger budget — on your log it does not. Quote hotel guests the same as anyone else.",
						hotelPays
							? "A guest staying over has time. Offer the longer version of the evening rather than the standard one."
							: "Guests travelling in are spending more per party — worth making the journey feel accounted for rather than discounting it away.",
						"Check this against the booking rate above before you act: the group that pays more is not always the group that says yes more.",
					],
				});
			}
		}

		/* --- streak: the run you are on right now --- */
		var decidedRun = tickets.slice().sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); })
			.filter(function (t) { return t.outcome === "booked" || t.outcome === "notbooked"; });
		var streak = 0;
		for (var si = decidedRun.length - 1; si >= 0; si--) {
			if (decidedRun[si].outcome === "booked") streak++; else break;
		}
		if (streak >= 3) {
			out.push({
				tag: "Streak",
				head: streak + " booked in a row and counting",
				text: "Your last " + streak + " decided tickets all closed. Streaks end — but while one is running, whatever you are doing is worth noticing.",
				moves: [
					"This is the moment to quote higher. Testing a bigger number costs least when the last several have all said yes.",
					"Write down what you are saying right now while it is still fresh — a streak is a script you have not written down yet.",
					"Do not read a streak as a new normal; keep an eye on your overall book rate, which moves slowly and lies less.",
				],
			});
		}

		/* --- one thing asked for, or several --- */
		var single = [], multi = [];
		tickets.forEach(function (t) {
			var p = ownPriceOf(t);
			if (!p) return;
			if ((t.partyTypes || []).length >= 2) multi.push(p);
			else if ((t.partyTypes || []).length === 1) single.push(p);
		});
		if (single.length >= 3 && multi.length >= 3) {
			var oneAvg = single.reduce(function (a, b) { return a + b; }, 0) / single.length;
			var manyAvg = multi.reduce(function (a, b) { return a + b; }, 0) / multi.length;
			var stackGap = Math.round(((manyAvg / oneAvg) - 1) * 100);
			if (Math.abs(stackGap) >= 15) {
				out.push({
					tag: "Stacking",
					money: true,
					head: stackGap > 0
						? "Parties with more than one thing in them pay " + stackGap + "% more"
						: "Parties with more than one thing in them pay " + Math.abs(stackGap) + "% less",
					text: (cash(manyAvg) || "—") + " across " + multi.length + " with two or more, against " +
						(cash(oneAvg) || "—") + " across " + single.length + " with one. " +
						(stackGap > 0
							? "The second thing asked for is where the money is, not the first."
							: "Adding to a party is costing you rather than paying you — the second thing is being given away."),
					moves: stackGap > 0
						? [
							"Offer the second thing before the price is settled, not after. Once a figure is agreed, an addition reads as something that should be free.",
							"Quote the pair as one party rather than as a party and an extra, so there is one number to say yes to.",
							"Look at which pairs come up most — those are the two you should be naming together by default.",
						]
						: [
							"Price the second thing separately and say so. A party that grows without the figure growing is one you are discounting without deciding to.",
							"Check whether the longer parties are the ones being agreed late in the night, when the room is emptying and the price is softest.",
						],
				});
			}
		}

		/* --- early and late --- */
		var early = [], late = [];
		tickets.forEach(function (t) {
			var hr = parseInt(String(t.time || "").slice(0, 2), 10);
			if (!isFinite(hr)) return;
			// 1am is the late end of a night, not the early end of one.
			((hr >= 6 && hr < 20) ? early : late).push(t);
		});
		if (early.length >= 6 && late.length >= 6) {
			var e = tally(early), l = tally(late);
			if (e.decided >= 4 && l.decided >= 4) {
				var eRate = (e.booked / e.decided) * 100;
				var lRate = (l.booked / l.decided) * 100;
				var nightGap = Math.round(eRate - lRate);
				if (Math.abs(nightGap) >= 12) {
					var better = nightGap > 0 ? "before 8pm" : "after 8pm";
					var worse = nightGap > 0 ? "after 8pm" : "before 8pm";
					out.push({
						tag: "Time of night",
						head: "You close better " + better + ", by " + Math.abs(nightGap) + " points",
						text: Math.round(eRate) + "% of what you see before 8pm books, against " +
							Math.round(lRate) + "% after. " +
							"The same guest is a different guest depending on how long the evening has been going.",
						moves: [
							"Be on the floor for " + better + " deliberately rather than by accident. It is the cheaper half of your night.",
							"Treat " + worse + " as the half to try a higher opening figure on — you are closing less of it anyway, so there is less at risk.",
						],
					});
				}
			}
		}

		/* --- the best single night --- */
		var nights = {};
		tickets.forEach(function (t) {
			var p = ownPriceOf(t);
			if (!p) return;
			nights[t.date] = nights[t.date] || { amount: 0, n: 0 };
			nights[t.date].amount += p;
			nights[t.date].n++;
		});
		var nightKeys = Object.keys(nights);
		if (nightKeys.length >= 5 && avgAll) {
			var bestNight = nightKeys.sort(function (a, b) { return nights[b].amount - nights[a].amount; })[0];
			var bn = nights[bestNight];
			var typical = ownPrices(tickets).length
				? all.amount / Math.max(1, nightKeys.length)
				: 0;
			if (typical && bn.amount >= typical * 1.8) {
				out.push({
					tag: "Your best night",
					money: true,
					head: prettyDate(bestNight) + " came to " + (cash(bn.amount) || "—"),
					text: bn.n + " priced " + (bn.n === 1 ? "party" : "parties") + " in one night, against " +
						(cash(typical) || "—") + " on a typical night with a booking. Worth knowing what that one had in it.",
					moves: [
						"Open that night's tickets and read them together. A night like that usually has one thing in common across all of it.",
						"Whatever was different — the day, the hour, what you led with — is the thing to repeat before anything else on this page.",
					],
				});
			}
		}

		/* --- how often the guest's history goes unrecorded --- */
		if (all.n >= 15 && all.g_unknown / all.n >= 0.3) {
			var knownRows = tickets.filter(function (t) {
				return t.guestType && t.guestType !== "unknown";
			});
			out.push({
				tag: "Worth recording",
				head: pct(all.g_unknown, all.n) + " of your tickets do not say whether you had met the guest",
				text: "Whether a guest is new to you is the single thing that moves your book rate most, and it is " +
					"missing from " + all.g_unknown + " of " + all.n + " tickets. Every comparison below is being " +
					"made on the " + knownRows.length + " that have it.",
				moves: [
					"It is one tap at the time of writing the ticket, and it is the field that pays for itself fastest.",
					"If you cannot remember, mark it unknown deliberately rather than leaving it blank — the two look the same here but mean different things to you later.",
				],
			});
		}

		/* ==============================================================
		   3.28 — six further readings. Each one is a comparison a person
		   could act on tonight, and each leads with the single most
		   specific thing to do about it.
		   ============================================================== */
		var hourOfT = function (t) { return parseInt(String(t.time || "0").split(":")[0], 10) || 0; };
		var lc = function (str) { return str.charAt(0).toLowerCase() + str.slice(1); };
		var rateOf = function (m) { return m.decided ? m.booked / m.decided : 0; };
		var grp = function (name, list) {
			var m = withRates(tally(list));
			var prices = ownPrices(list);
			return { name: name, m: m, avg: trimmedMean(prices), priced: prices.length };
		};
		var range = priceQuartiles(ownPrices(tickets));

		/* --- what one ticket is worth, by how it came in --- */
		var sources = [
			["appointment", "Appointments", "An appointment"], ["request", "Requests", "A request"],
			["lineup", "Lineup picks", "A lineup pick"], ["bar", "Bar walk-ins", "A bar walk-in"], ["pull", "Pull-ins", "A pull-in"],
		].map(function (d) {
			var g = grp(d[1], tickets.filter(function (t) { return kindOf(t) === d[0]; }));
			g.one = d[2];
			g.arrive = d[0] === "appointment" && g.m.aMarked ? g.m.a_showed / g.m.aMarked : 1;
			g.worth = g.arrive * rateOf(g.m) * g.avg;
			return g;
		}).filter(function (g) { return g.m.decided >= 4 && g.priced >= 3; })
		  .sort(function (a, b) { return b.worth - a.worth; });

		if (sources.length >= 2 && sources[sources.length - 1].worth > 0 &&
				sources[0].worth / sources[sources.length - 1].worth >= 1.15) {
			var sTop = sources[0], sLow = sources[sources.length - 1];
			out.push({
				tag: "Worth per ticket",
				head: sTop.one + " is worth about " + (cash(sTop.worth) || "—") + " to you each time one comes in",
				text: "That counts the ones that came to nothing: " +
					(sTop.arrive < 1 ? Math.round(sTop.arrive * 100) + "% arrive, " : "") +
					pct(sTop.m.booked, sTop.m.decided) + " book, at an average of " + (cash(sTop.avg) || "—") + ". " +
					sLow.name + " come to " + (cash(sLow.worth) || "—") + " each.",
				money: true,
				how: "For each way a ticket comes in, three things are multiplied: the share that arrive (always all of them for a walk-in, who is already here), the share of decided tickets that book, and your average party for that kind. The answer is what one ticket of that kind has been worth to you on average, including the ones that came to nothing. A kind needs four decided tickets and three prices to be ranked.",
				moves: [
					"When two guests want you at once, take the " + lc(sTop.one.replace(/^An? /, "")) + " — on your own numbers it is worth about " +
						(sTop.worth / sLow.worth).toFixed(1) + " times " + lc(sLow.one) + ".",
					"Spend your effort where it brings more " + lc(sTop.name) + ": that is the kind of ticket that pays you most for the time it takes.",
				],
			});
		}

		/* --- who misses appointments --- */
		var marked = tickets.filter(function (t) {
			return kindOf(t) === "appointment" && (t.attendance === "showed" || t.attendance === "noshow");
		});
		var missedIn = function (list) { return list.filter(function (t) { return t.attendance === "noshow"; }).length; };
		var risks = [
			{ a: "New guests", b: "guests you have seen before", key: "new",
				inA: function (t) { return t.guestType === "new"; }, inB: function (t) { return t.guestType === "returning" || t.guestType === "house"; } },
			{ a: "Guests driving themselves", b: "guests coming by limo", key: "drive",
				inA: function (t) { return t.selfDrive === "yes"; }, inB: function (t) { return t.limo === "yes"; } },
			{ a: "Guests not staying on the property", b: "hotel guests", key: "hotel",
				inA: function (t) { return t.hotelGuest === "no"; }, inB: function (t) { return t.hotelGuest === "yes"; } },
		].map(function (r) {
			var A = marked.filter(r.inA), B = marked.filter(r.inB);
			var xa = missedIn(A), xb = missedIn(B);
			if (A.length < 5 || B.length < 5 || xa < 2 || xb < 1) return null;
			var ratio = (xa / A.length) / (xb / B.length);
			return ratio >= 1.4 ? { r: r, na: A.length, nb: B.length, xa: xa, xb: xb, ratio: ratio } : null;
		}).filter(Boolean).sort(function (x, y) { return y.ratio - x.ratio; });

		if (risks.length) {
			var rk = risks[0];
			var slot = avgAll ? " An empty slot costs you about " + (cash(avgAll) || "—") + "." : "";
			out.push({
				tag: "Who does not arrive",
				head: rk.r.a + " miss appointments " + rk.ratio.toFixed(1) + " times as often as " + rk.r.b,
				text: rk.xa + " of " + rk.na + " did not arrive (" + pct(rk.xa, rk.na) + "), against " +
					rk.xb + " of " + rk.nb + " (" + pct(rk.xb, rk.nb) + ").",
				money: !!avgAll,
				how: "Takes only appointments marked as kept or missed and splits them three ways: new guests against guests you have seen before, self-drive against limo, and guests not staying on the property against hotel guests. For each split, one side's no-show rate is divided by the other's, and the widest gap is shown. Both sides need five appointments, and the higher rate must be at least 1.4 times the lower.",
				moves: [
					rk.r.key === "new"
						? "Ask a new guest to confirm on the day, and do not hold your best hour for one who has not." + slot
						: rk.r.key === "drive"
							? "When a guest who would drive himself books ahead, offer the limo — it is the surest way to get him here." + slot
							: "A guest coming from off the property has further to travel: confirm before he sets out." + slot,
					"When an appointment like this is on the book, keep a walk-in in mind for that hour rather than turning one away.",
				],
			});
		}

		/* --- the strongest guest-and-source pairing --- */
		var cells = [];
		[["new", "New guests"], ["returning", "Returning guests"], ["house", "Ranch regulars"]].forEach(function (g) {
			[["appointment", "by appointment"], ["request", "on request"], ["lineup", "from the lineup"], ["bar", "from the bar"], ["pull", "as pull-ins"]].forEach(function (k) {
				var c = grp(g[1] + " " + k[1], tickets.filter(function (t) { return t.guestType === g[0] && kindOf(t) === k[0]; }));
				if (c.m.decided >= 4) cells.push(c);
			});
		});
		cells.sort(function (a, b) { return rateOf(b.m) - rateOf(a.m); });
		if (cells.length >= 3 && all.decided && rateOf(cells[0].m) - all.booked / all.decided >= 0.1) {
			var cTop = cells[0], cLow = cells[cells.length - 1];
			out.push({
				tag: "Best pairing",
				head: cTop.name + " book " + pct(cTop.m.booked, cTop.m.decided) + " of the time — your surest booking",
				text: cTop.m.booked + " of " + cTop.m.decided + " decided, against " + pct(all.booked, all.decided) +
					" across everything. Your hardest is " + lc(cLow.name) + ", at " + pct(cLow.m.booked, cLow.m.decided) + ".",
				money: range.n >= 8,
				how: "Crosses who the guest is (new, returning to you, or a ranch regular) with how the ticket came in, giving up to fifteen pairings. Each pairing with four or more decided tickets gets a book rate. The best is shown when it beats your overall book rate by ten points or more.",
				moves: [
					range.n >= 8
						? "This guest is likely to book whatever you quote, so quote from the top of your range — " + (cash(range.p75) || "—") + " — rather than the middle."
						: "This guest is likely to book, so there is no need to discount to close — hold your price.",
					"With " + lc(cLow.name) + ", expect to work harder: lead with what you are best known for rather than a list of options.",
				],
			});
		}

		/* --- which stretch of the night pays --- */
		var stretches = [
			["Before 8pm", function (h) { return h >= 6 && h < 20; }],
			["8pm to 11pm", function (h) { return h >= 20 && h < 23; }],
			["After 11pm", function (h) { return h >= 23 || h < 6; }],
		].map(function (d) {
			var g = grp(d[0], tickets.filter(function (t) { return d[1](hourOfT(t)); }));
			g.worth = rateOf(g.m) * g.avg;
			return g;
		}).filter(function (g) { return g.m.decided >= 4 && g.priced >= 3; })
		  .sort(function (a, b) { return b.worth - a.worth; });

		if (stretches.length >= 2 && stretches[stretches.length - 1].worth > 0 &&
				stretches[0].worth / stretches[stretches.length - 1].worth >= 1.15) {
			var hTop = stretches[0], hLow = stretches[stretches.length - 1];
			out.push({
				tag: "Hours that pay",
				head: hTop.name + " is your best-paying stretch: about " + (cash(hTop.worth) || "—") + " a ticket",
				text: pct(hTop.m.booked, hTop.m.decided) + " book, at an average of " + (cash(hTop.avg) || "—") + ". " +
					hLow.name + " comes to " + (cash(hLow.worth) || "—") + " a ticket (" + pct(hLow.m.booked, hLow.m.decided) +
					" book, at " + (cash(hLow.avg) || "—") + ").",
				money: true,
				how: "Splits the night into three stretches — before 8pm, 8 to 11, and after 11 — and for each multiplies the share of decided tickets that booked by your average party. Anything before 6am counts as the end of the night before. A stretch needs four decided tickets and three prices.",
				moves: [
					"If you take a break or start late, do it " + lc(hLow.name) + " and be on the floor " + lc(hTop.name) + " — a ticket then is worth about " +
						(hTop.worth / hLow.worth).toFixed(1) + " times as much.",
					"Book appointments into " + lc(hTop.name) + " when a guest gives you the choice of time.",
				],
			});
		}

		/* --- the first half of a tour against the second --- */
		var early = [], later = [];
		buildTours(tickets).forEach(function (tour) {
			if (!tour.start || !tour.end || tour.loose) return;
			var span = Math.round((fromISO(tour.end) - fromISO(tour.start)) / 86400000) + 1;
			if (span < 4) return;
			tickets.forEach(function (t) {
				if (!inTour(t.date, tour)) return;
				var day = Math.round((fromISO(t.date) - fromISO(tour.start)) / 86400000);
				(day < span / 2 ? early : later).push(t);
			});
		});
		var eT = withRates(tally(early)), lT = withRates(tally(later));
		if (eT.decided >= 6 && lT.decided >= 6 && Math.abs(rateOf(eT) - rateOf(lT)) >= 0.08) {
			var lateBetter = rateOf(lT) > rateOf(eT);
			out.push({
				tag: "Early or late in a tour",
				head: "You book better in the " + (lateBetter ? "second" : "first") + " half of a tour: " +
					pct(lateBetter ? lT.booked : eT.booked, lateBetter ? lT.decided : eT.decided) + " against " +
					pct(lateBetter ? eT.booked : lT.booked, lateBetter ? eT.decided : lT.decided),
				text: eT.booked + " of " + eT.decided + " decided in the first half, " + lT.booked + " of " + lT.decided + " in the second.",
				how: "Every tour that ran four days or longer is cut at its midpoint by date. Tickets from the first halves are pooled, and the second halves, and the two book rates compared. Each side needs six decided tickets and the gap must be eight points.",
				moves: [
					lateBetter
						? "Do not discount in the first days to get a tour going — your numbers say the bookings come once it is under way, at full price."
						: "Your book rate fades as a tour goes on. A shorter tour, or a day off in the middle, may be worth more than extra days at the end.",
					lateBetter
						? "Judge a tour by its second half before deciding whether the town or the timing was wrong."
						: "Line up returning guests for the back half of a tour, when new bookings are harder to come by.",
				],
			});
		}

		/* --- bookings with no price on them --- */
		var unpriced = all.booked - all.priced;
		if (all.booked >= 5 && unpriced >= 2 && avgAll) {
			out.push({
				tag: "Missing prices",
				head: unpriced + " of your " + all.booked + " bookings have no price on them",
				text: "At your average of " + (cash(avgAll) || "—") + " that is about " + (cash(unpriced * avgAll) || "—") +
					" missing from every total and every average here.",
				money: true,
				how: "Counts booked tickets with no price entered and multiplies them by your average party to estimate what is missing. It is an estimate: the real figure is whatever those parties actually were.",
				moves: [
					"Edit those tickets and add the price, privately if you prefer — a private price counts only in your own figures and is never shown to anyone else.",
					"Until then, read your totals as a floor: the true figure is higher by roughly the amount above.",
				],
			});
		}

		// The readings that change what to do tonight come first.
		var FIRST = ["Worth per ticket", "Follow-through", "Who does not arrive", "Best pairing", "Your range", "Hours that pay"];
		out.sort(function (a, b) {
			var ia = FIRST.indexOf(a.tag), ib = FIRST.indexOf(b.tag);
			return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
		});

		return out.slice(0, 24);
	}

	/* ==================================================================
	   Insight carousel
	   One finding on screen at a time, moved with the arrows either side
	   of the counter. All slides render up front; moving between them is
	   a transform on the track, so nothing is rebuilt and nothing jumps.
	   ================================================================== */
	function carousel(cid, slides) {
		var at = Math.max(0, Math.min(slides.length - 1, state.slide[cid] || 0));
		state.slide[cid] = at;

		var dots = slides.map(function (u, i) {
			return '<button type="button" class="sl-dot2' + (i === at ? " is-on" : "") +
				'" data-act="slideto" data-cid="' + cid + '" data-at="' + i +
				'" aria-label="Insight ' + (i + 1) + '"></button>';
		}).join("");

		return '<div class="sl-carousel" data-carousel="' + cid + '" data-count="' + slides.length + '">' +
			'<div class="sl-slides"><div class="sl-slidetrack" style="transform:translateX(' + (at * -100) + '%)">' +
				slides.map(function (html) { return '<div class="sl-slide">' + html + "</div>"; }).join("") +
			"</div></div>" +
			'<div class="sl-slidenav">' +
				'<button type="button" class="sl-arrow" data-act="slide" data-cid="' + cid + '" data-dir="-1" aria-label="Previous insight"' + (at === 0 ? " disabled" : "") + '>' +
					'<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
				'<span class="sl-slidecount" aria-live="polite"><strong>' + (at + 1) + "</strong> of " + slides.length + "</span>" +
				'<button type="button" class="sl-arrow" data-act="slide" data-cid="' + cid + '" data-dir="1" aria-label="Next insight"' + (at === slides.length - 1 ? " disabled" : "") + '>' +
					'<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
				'<span class="sl-dotnav" aria-hidden="true">' + dots + "</span>" +
			"</div></div>";
	}

	/**
	 * Move a carousel without re-rendering anything. The track slides, the
	 * counter and dots update, and the rest of the page is left alone —
	 * which keeps the scroll position and the open panel exactly as they were.
	 */
	function moveSlide(cid, to) {
		var wrap = root.querySelector('.sl-carousel[data-carousel="' + cid + '"]');
		if (!wrap) return;
		var count = +wrap.dataset.count || 1;
		var at = Math.max(0, Math.min(count - 1, to));
		state.slide[cid] = at;

		wrap.querySelector(".sl-slidetrack").style.transform = "translateX(" + (at * -100) + "%)";
		var counter = wrap.querySelector(".sl-slidecount");
		if (counter) counter.innerHTML = "<strong>" + (at + 1) + "</strong> of " + count;

		var arrows = wrap.querySelectorAll(".sl-arrow");
		if (arrows[0]) arrows[0].disabled = at === 0;
		if (arrows[1]) arrows[1].disabled = at === count - 1;

		var dots = wrap.querySelectorAll(".sl-dot2");
		for (var i = 0; i < dots.length; i++) dots[i].classList.toggle("is-on", i === at);
	}

	/* ==================================================================
	   What to work on

	   This replaced a library of written sales tips. The tips were sound
	   and said nothing about you: everyone on the floor read the same
	   seventy, in the same order, whatever their log said. What follows is
	   worked out from your own tickets, ranked by what it is worth, and
	   anything the log cannot support simply does not appear.
	   ================================================================== */

	function coaching(tickets, all) {
		var out = [];
		var avg = all.priced ? all.amount / all.priced : 0;
		var rows = partyRows(tickets);

		/* ---- appointments that were not kept ---- */
		if (all.a_noshow >= 2 && all.aMarked >= 6) {
			var keepRate = (all.a_showed / all.aMarked) * 100;
			out.push({
				worth: avg * all.a_noshow,
				label: "Appointments not kept",
				head: all.a_noshow + " booked " + (all.a_noshow === 1 ? "appointment" : "appointments") +
					" did not arrive",
				money: true,
				figure: avg ? cash(avg * all.a_noshow) : null,
				figureLab: "at your average party",
				text: "You keep " + Math.round(keepRate) + "% of the appointments you take. The ones that fall " +
					"through are the cheapest thing on this page to fix, because the guest had already said yes.",
				moves: [
					"Take something concrete at the booking — the hotel, the arrival time, how they are getting here. A guest who has told you the details turns up more often than one who has not.",
					"The longer the gap between booking and night, the more of them go. If a booking is more than a couple of days out, find a reason to be in touch before it.",
					"Log the reason when one does not arrive. Four of those in a row usually name the same cause.",
				],
			});
		}

		/* ---- bookings with no price on them ---- */
		var unpriced = all.booked - all.priced;
		if (unpriced >= 3) {
			out.push({
				worth: avg * unpriced * 0.5,
				label: "Prices left off",
				head: unpriced + " " + (unpriced === 1 ? "booking has" : "bookings have") + " no price on them",
				text: "Every average on this page is built from the " + all.priced + " that do. Each one you leave " +
					"off makes your own figures less use to you — and the house average less use to everyone.",
				moves: [
					"Put the figure in while you are still writing the ticket. Going back for it later almost never happens.",
					"If the price is one you would rather not show the floor, mark it private — it still counts in everything on your own screens and stays out of the pooled view.",
				],
			});
		}

		/* ---- the type that pays, against the type you are asked for ---- */
		var priced = rows.filter(function (r) { return r.priced >= 3; });
		if (priced.length >= 2 && rows.length && avg) {
			var rich = priced.slice().sort(function (a, b) { return (b.amount / b.priced) - (a.amount / a.priced); })[0];
			var common = rows[0];
			var richAvg = rich.amount / rich.priced;
			if (rich.name !== common.name && richAvg > avg * 1.12) {
				out.push({
					worth: (richAvg - avg) * Math.max(1, Math.round(all.booked * 0.25)),
					label: "Where the money is",
					head: rich.name + " pays best; " + common.name + " is what you are asked for most",
					money: true,
					figure: cash(richAvg - avg),
					figureLab: "a party above your average",
					text: rich.name + " averages " + (cash(richAvg) || "—") + " across " + rich.priced +
						" priced, against " + (cash(avg) || "—") + " overall. Popular and profitable are rarely the same list.",
					moves: [
						"Name " + rich.name + " yourself, early, rather than waiting to be asked for it.",
						"When a party is heading toward your average, ask whether " + rich.name + " is on the table before the figure is settled.",
						"Raise what you quote on " + rich.name + " first. It already carries your highest average, so it takes an increase most easily.",
					],
				});
			}
		}

		/* ---- the nights that are worth being on the floor for ---- */
		var byDay = {};
		tickets.forEach(function (t) {
			var d = fromISO(t.date).getDay();
			byDay[d] = byDay[d] || { n: 0, booked: 0, amount: 0, priced: 0 };
			byDay[d].n++;
			if (t.outcome === "booked") byDay[d].booked++;
			var p = ownPriceOf(t);
			if (p) { byDay[d].priced++; byDay[d].amount += p; }
		});
		/* Four priced parties on a night before it is called your best one.
		   At two, a single big booking decides which day of the week you are
		   told to build your month around. */
		var days = Object.keys(byDay).filter(function (d) { return byDay[d].priced >= 4; });
		if (days.length >= 4) {
			var DOWN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
			var ranked = days.sort(function (a, b) {
				return (byDay[b].amount / byDay[b].priced) - (byDay[a].amount / byDay[a].priced);
			});
			var best = ranked[0], worst = ranked[ranked.length - 1];
			var bestAvg = byDay[best].amount / byDay[best].priced;
			var worstAvg = byDay[worst].amount / byDay[worst].priced;
			if (bestAvg > worstAvg * 1.25) {
				out.push({
					worth: (bestAvg - worstAvg) * 2,
					label: "Your week",
					head: DOWN[best] + " is worth " + Math.round(((bestAvg / worstAvg) - 1) * 100) + "% more a party than " + DOWN[worst],
					money: true,
					figure: cash(bestAvg),
					figureLab: "a party on " + DOWN[best],
					text: "Across " + byDay[best].priced + " priced on " + DOWN[best] + " and " +
						byDay[worst].priced + " on " + DOWN[worst] + ". Which nights you are on the floor is " +
						"worth more than what you do once you are on it.",
					moves: [
						"Be in house for " + DOWN[best] + " before you fill anything else in around it.",
						"If " + DOWN[worst] + " has to be worked, it is the night to try a higher opening figure on — there is less to lose.",
					],
				});
			}
		}

		/* ---- the spread of your own prices ---- */
		var ps = ownPrices(tickets);
		if (ps.length >= 8) {
			var q = priceQuartiles(ps);
			if (q && q.p25 && q.p75 / q.p25 >= 1.6) {
				out.push({
					worth: (q.median - q.p25) * Math.max(1, Math.round(ps.length * 0.25)),
					label: "Your floor price",
					head: "Half your parties land between " + (cash(q.p25) || "—") + " and " + (cash(q.p75) || "—"),
					money: true,
					figure: cash(q.p25),
					figureLab: "the bottom of your range",
					text: "That is a wide spread for one person's work. The bottom quarter is where a figure gets " +
						"agreed before the conversation has had a chance to move it.",
					moves: [
						"Decide what your floor is away from the room, so it is a number you already hold rather than one you arrive at while someone is waiting.",
						"Quote nearer " + (cash(q.median) || "your middle") + " first. The ones who were going to pay it do; the ones who were not will say so.",
					],
				});
			}
		}

		/* ---- requests against appointments ---- */
		var reqRows = tickets.filter(function (t) { return kindOf(t) === "request"; });
		var apptRows = tickets.filter(function (t) { return kindOf(t) === "appointment"; });
		var reqT = tally(reqRows), apptT = tally(apptRows);
		if (reqT.decided >= 5 && apptT.decided >= 5) {
			var reqRate = (reqT.booked / reqT.decided) * 100;
			var apptRate = (apptT.booked / apptT.decided) * 100;
			if (apptRate - reqRate >= 15) {
				out.push({
					worth: avg * Math.round(reqT.decided * ((apptRate - reqRate) / 100)),
					label: "Walk-ins",
					head: "Requests book at " + Math.round(reqRate) + "%, appointments at " + Math.round(apptRate) + "%",
					text: "A guest who asked for you by name is already most of the way there; one who walked in has " +
						"decided nothing yet. The gap is " + Math.round(apptRate - reqRate) + " points of people standing in front of you.",
					moves: [
						"Treat a request as the start of a conversation rather than the end of one. Nothing has been agreed yet.",
						"Ask what brought them in before you quote. A walk-in who names what they want is a different ticket from one who is looking.",
					],
				});
			}
		}

		/* ---- who comes back ---- */
		var known = all.g_new + all.g_ret + all.g_house;
		if (known >= 10) {
			var retShare = (all.g_ret / known) * 100;
			if (retShare < 20) {
				out.push({
					worth: avg * Math.max(1, Math.round(all.booked * 0.1)),
					label: "Coming back",
					head: Math.round(retShare) + "% of your guests had seen you before",
					text: "Almost everyone in your log is meeting you for the first time, which means every party " +
						"starts from nothing. A returning guest is the cheapest booking there is.",
					moves: [
						"Put something specific in the private note after each one — what he talked about, what he liked. In three months that line is what lets you open halfway through a conversation.",
						"Give a reason to come back that is yours rather than the house's: a night you are usually on, something you said you would remember.",
					],
				});
			}
		}

		return out.sort(function (a, b) { return (b.worth || 0) - (a.worth || 0); }).slice(0, 6);
	}

	function coachingCard(tickets, all) {
		var found = coaching(tickets, all);

		if (!found.length) {
			return '<section class="sl-card"><p class="sl-eyebrow">What to work on</p>' +
				'<div class="sl-empty"><strong>Nothing standing out</strong>' +
				"Either this stretch is running cleanly or there is not enough in it yet. " +
				"These are worked out from your own tickets, so they appear as the log fills.</div></section>";
		}

		var slides = found.map(function (f) {
			var masked = f.money && !state.showMoney;
			return '<div class="sl-coachitem">' +
				'<span class="sl-coachlabel">' + esc(f.label) + "</span>" +
				'<h3 class="sl-coachhead">' + esc(f.head) + "</h3>" +
				(f.figure
					? '<div class="sl-coachfig"><span class="sl-coachnum' + (masked ? " sl-mask" : "") + '">' +
						esc(f.figure) + '</span><span class="sl-coachfiglab">' + esc(f.figureLab || "") + "</span></div>"
					: "") +
				'<p class="sl-coachtext' + (masked ? " sl-mask" : "") + '">' + esc(f.text) + "</p>" +
				'<ul class="sl-moves"><li class="sl-moveslab">What you could try</li>' +
					f.moves.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("") +
				"</ul></div>";
		});

		return '<section class="sl-card"><div class="sl-cardhead">' +
				'<p class="sl-eyebrow">What to work on</p>' +
				'<span class="sl-weekrange">' + found.length + " from your whole log</span></div>" +
			carousel("coach", slides) +
			'<p class="sl-fn">Worked out from your whole log rather than the tour above, and ordered by what each ' +
			"one looks to be worth, so the first is the one with the most behind it. Nothing here is advice in " +
			"general — where your log does not support a reading, it does not appear.</p>" +
			"</section>";
	}

	function observationsCard(tickets, all) {
		var MIN = 5;
		if (all.n < MIN) {
			return '<section class="sl-card"><p class="sl-eyebrow">What your log suggests</p>' +
				'<div class="sl-empty"><strong>Not enough yet</strong>Findings appear once you have logged around ' + MIN +
				' tickets. Anything drawn from fewer would be guesswork dressed as insight.</div></section>';
		}

		var found = observations(tickets, all);
		if (!found.length) {
			return '<section class="sl-card"><p class="sl-eyebrow">What your log suggests</p>' +
				'<div class="sl-empty"><strong>Nothing stands out yet</strong>No pattern in your log is strong enough to call yet. Tagging party types and guest history on each ticket is what sharpens this.</div></section>';
		}

		var slides = found.map(function (o) {
			var how = o.how || HOW[o.tag];
			var masked = o.money && !state.showMoney;
			return '<div class="sl-obsitem' + (how ? " sl-explains" : "") + '"' + (how ? ' tabindex="0"' : "") + ">" +
				'<span class="sl-obstag">' + esc(o.tag) + "</span>" +
				'<p class="sl-obshead' + (masked ? " sl-mask" : "") + '">' + esc(o.head) + "</p>" +
				'<p class="sl-obstext' + (masked ? " sl-mask" : "") + '">' + esc(o.text) + "</p>" +
				((o.moves && o.moves.length)
					? '<div class="sl-moves' + (masked ? " sl-mask" : "") + '">' +
						'<p class="sl-moveslab">What to do with this</p><ul class="sl-moveslist sl-moveslead">' +
						o.moves.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("") +
						"</ul></div>"
					: "") +
				(how ? '<p class="sl-how"><span class="sl-howlab">How this is worked out</span>' + esc(how) + "</p>" : "") +
				"</div>";
		});

		return '<section class="sl-card"><p class="sl-eyebrow">What your log suggests</p>' +
			carousel("obs", slides) +
			'<p class="sl-fn">' + found.length + (found.length === 1 ? " finding" : " findings") +
			', drawn only from your own tickets and only where there is enough to mean something. Move through them with the arrows; hover or tab onto one to see how it was worked out. The figures come from your log; what to try with them is a suggestion, not an instruction — you know the night and the guest, and the log does not.</p>' +
			"</section>";
	}


	/**
	 * @param noToggle  true when the split is fixed, so the Day/Tour switch
	 *                  is left off — and, since the only fixed split is a run
	 *                  of tours, it also names what each bar is.
	 */
	function chart(periods, title, noToggle) {
		var unit = noToggle || state.mode === "tour" ? "tour's" : "day's";
		var peak = Math.max.apply(null, [1].concat(periods.map(function (p) { return p.n; })));
		var cols = periods.map(function (p) {
			var part = function (v) { return p.n ? (v / p.n) * 100 : 0; };
			return '<div class="sl-col" title="' + esc(p.full + ": " + p.n + " tickets · " + p.a_showed + " of " + p.aMarked + " appts kept · " + p.a_noshow + " missed") + '">' +
				'<div class="sl-colrate">' + (p.aMarked ? pct(p.a_showed, p.aMarked) : "") + "</div>" +
				'<div class="sl-coltrack" style="height:' + (p.n / peak) * 100 + '%">' +
					'<div class="sl-colpart" data-part="unmarked" style="height:' + part(p.n - p.marked) + '%"></div>' +
					'<div class="sl-colpart" data-part="noshow" style="height:' + part(p.noshow) + '%"></div>' +
					'<div class="sl-colpart" data-part="showed" style="height:' + part(p.showed) + '%"></div>' +
				"</div></div>";
		}).join("");

		return '<section class="sl-card"><div class="sl-cardhead">' +
			'<p class="sl-eyebrow">' + esc(title) + "</p>" +
			(noToggle ? "" : seg("mode", state.mode, [{ value: "day", label: "Day" }, { value: "tour", label: "Tour" }], true)) +
			'</div><div class="sl-chart">' + cols + "</div>" +
			'<div class="sl-xaxis">' + periods.map(function (p) { return '<div class="sl-xlab">' + esc(p.label) + "</div>"; }).join("") + "</div>" +
			'<div class="sl-keys" style="margin-top:14px">' +
				'<span class="sl-key"><span class="sl-swatch" data-tone="pos"></span>Showed up</span>' +
				'<span class="sl-key"><span class="sl-swatch" data-tone="caution"></span>No show</span>' +
				'<span class="sl-key"><span class="sl-swatch" data-tone="muted"></span>Not marked</span>' +
			"</div>" +
			'<p class="sl-fn">Bar height is ticket volume; the figure above each bar is that ' + unit + " show rate.</p></section>";
	}

	/* ==================================================================
	   The headline of your own figures

	   Six identical cells tell you nothing about what matters — every
	   number the same size means every number the same weight. These
	   pieces vary deliberately: one figure leads, rates are drawn as
	   rings you can read at a glance, the ticket mix is a bar rather
	   than a list of abbreviations, and anything remarkable is called
	   out as a badge rather than left for you to notice.
	   ================================================================== */

	/**
	 * A rate as a ring.
	 *
	 * A percentage read as a number takes a moment; read as a filled arc it
	 * takes none. The arc is drawn with stroke-dasharray on a circle, so it
	 * scales cleanly and needs no library.
	 */
	function arcId(tone) {
		return { good: "Good", pink: "Pink", gold: "Gold" }[tone] || "Pink";
	}

	function rateRing(value, label, sub, tone) {
		var pctv = Math.max(0, Math.min(100, Math.round(value || 0)));
		var r = 36, c = 2 * Math.PI * r;
		var on = (pctv / 100) * c;

		/* Drawn empty, then filled after the browser has painted it — a
		   dasharray that starts at its final value has nothing to animate
		   from, so the arc would simply appear. The true value rides on a
		   data attribute for the filling pass to read. */
		var still = state.stillRings;

		return '<div class="sl-ring" data-tone="' + (tone || "pink") + '">' +
			'<div class="sl-ringart">' +
				'<svg viewBox="0 0 88 88" width="88" height="88" aria-hidden="true" ' +
						'shape-rendering="geometricPrecision">' +
					'<circle cx="44" cy="44" r="' + r + '" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="9"/>' +
					'<circle cx="44" cy="44" r="' + r + '" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="8"/>' +
					'<circle class="sl-ringarc" cx="44" cy="44" r="' + r + '" fill="none" ' +
						'stroke="url(#slArc' + arcId(tone) + ')" ' +
						'stroke-width="8" stroke-linecap="round" ' +
						'data-on="' + on.toFixed(1) + '" data-c="' + c.toFixed(1) + '" ' +
						'stroke-dasharray="' + (still ? on.toFixed(1) : "0") + " " + (still ? (c - on).toFixed(1) : c.toFixed(1)) + '" ' +
						'transform="rotate(-90 44 44)"/>' +
				"</svg>" +
				'<span class="sl-ringpct" data-to="' + pctv + '">' + (still ? pctv : 0) + "<i>%</i></span>" +
			"</div>" +
			'<div class="sl-ringtext"><strong>' + esc(label) + "</strong><span>" + esc(sub) + "</span></div>" +
			"</div>";
	}

	/** The ticket mix as one bar rather than five abbreviations. */
	function mixBar(all) {
		var parts = [
			["appt", all.appt, "Appointments"],
			["req", all.req, "Requests"],
			["lineup", all.lineup, "Lineup"],
			["bar", all.bar, "Bar"],
			["pull", all.pull, "Pull-ins"],
		].filter(function (p) { return p[1] > 0; });
		if (!parts.length) return "";

		var total = all.n || 1;
		return '<div class="sl-mix">' +
			'<div class="sl-mixbar">' + parts.map(function (p) {
				return '<span class="sl-mixseg" data-kind="' + p[0] + '" style="width:' + ((p[1] / total) * 100) + '%" ' +
					'title="' + esc(p[2] + ": " + p[1]) + '"></span>';
			}).join("") + "</div>" +
			'<div class="sl-mixkeys">' + parts.map(function (p) {
				return '<span class="sl-mixkey" data-kind="' + p[0] + '"><i></i>' + esc(p[2]) +
					"<b>" + p[1] + "</b></span>";
			}).join("") + "</div>" +
			"</div>";
	}

	/**
	 * Anything worth saying out loud, said briefly.
	 *
	 * These are the moments a log should notice on your behalf — a run of
	 * bookings, a personal best, a tour beating the last one. Nothing appears
	 * unless it is true, so an empty row is honest rather than padded.
	 */
	function badges(tickets, all) {
		var out = [];

		/* A run of booked tickets, right now. */
		var decided = tickets.slice().sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); })
			.filter(function (t) { return t.outcome === "booked" || t.outcome === "notbooked"; });
		var streak = 0;
		for (var i = decided.length - 1; i >= 0; i--) {
			if (decided[i].outcome === "booked") streak++; else break;
		}
		if (streak >= 3) {
			out.push({ tone: "hot", icon: "flame", text: streak + " booked in a row" });
		}

		/* Parties worth naming. Each carries the ticket it came from, so the
		   badge can open the night rather than only describing it. */
		var priced = tickets.filter(function (t) { return ownPriceOf(t) > 0; })
			.sort(function (a, b) { return ownPriceOf(b) - ownPriceOf(a); });

		if (priced.length >= 4 && state.showMoney) {
			var best = priced[0];
			var rest = trimmedMean(priced.slice(1).map(ownPriceOf));
			if (rest > 0 && ownPriceOf(best) / rest >= 1.5) {
				out.push({ tone: "gold", icon: "crown", text: "Best party " + (cash(ownPriceOf(best)) || "—"),
					ticket: best.id });
			}

			/* The most recent party well above your usual — a good night that
			   is not your best ever still deserves saying. */
			var recent = tickets.filter(function (t) {
				return t.id !== best.id && ownPriceOf(t) >= rest * 1.25;
			}).sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); })[0];
			if (recent) {
				out.push({ tone: "pink", icon: "spark",
					text: "Big night " + esc(prettyDate(recent.date)), ticket: recent.id });
			}
		}

		/* Every appointment kept, once there are enough to mean it. */
		if (all.aMarked >= 4 && all.a_noshow === 0) {
			out.push({ tone: "good", icon: "check", text: "Every appointment kept" });
		}

		/* This tour against the one before it. */
		var tours = buildTours(tickets);
		if (tours.length >= 2) {
			var cur = tourFigures(tickets, tours[tours.length - 1]);
			var prev = tourFigures(tickets, tours[tours.length - 2]);
			if (cur.pricedCount >= 2 && prev.pricedCount >= 2 && prev.avgParty > 0) {
				var move = Math.round((cur.avgParty / prev.avgParty - 1) * 100);
				if (Math.abs(move) >= 10) {
					out.push({
						tone: move > 0 ? "good" : "cool",
						icon: move > 0 ? "up" : "down",
						text: Math.abs(move) + "% " + (move > 0 ? "up" : "down") + " on last tour",
					});
				}
			}
		}

		/* A day that stands out. */
		if (all.n >= 8) {
			var byDay = {};
			tickets.forEach(function (t) {
				if (t.outcome !== "booked") return;
				byDay[t.date] = (byDay[t.date] || 0) + 1;
			});
			var top = Object.keys(byDay).sort(function (a, b) { return byDay[b] - byDay[a]; })[0];
			if (top && byDay[top] >= 3) {
				/* Opens the day rather than one ticket, since the point of it
				   is that there were several. */
				out.push({ tone: "pink", icon: "star", text: byDay[top] + " parties on " + prettyDate(top),
					day: top });
			}
		}

		if (!out.length) return "";

		/* Anything that names a night is a button, because it opens one.
		   Anything that names a rate stays a label — there is nothing behind
		   it to look at, and a button that does nothing is worse than a
		   label that never claimed to. */
		return '<div class="sl-badges">' + out.slice(0, 4).map(function (b) {
			var opens = b.ticket || b.day;
			var attrs = ' data-tone="' + b.tone + '"';
			if (b.ticket) attrs += ' data-act="badge" data-ticket="' + b.ticket + '"';
			else if (b.day) attrs += ' data-act="badge" data-day="' + esc(b.day) + '"';

			return opens
				? '<button type="button" class="sl-badge is-open"' + attrs + '>' +
					'<span class="sl-badgegloss" aria-hidden="true"></span>' +
					badgeIcon(b.icon) + "<span>" + esc(b.text) + "</span>" + badgeIcon("open") + "</button>"
				: '<span class="sl-badge"' + attrs + ">" + badgeIcon(b.icon) + "<span>" + esc(b.text) + "</span></span>";
		}).join("") + "</div>";
	}

	/* ==================================================================
	   A night, opened from its badge

	   The badges name particular nights, so they should be able to show
	   them. Built into document.body rather than the app root for the same
	   reason as everything else that outlives a render: root.innerHTML is
	   replaced constantly and anything inside it would vanish underneath
	   the person reading it.
	   ================================================================== */
	var peekHost = null;

	/**
	 * Fill the rings and run the headline figure up to its total.
	 *
	 * Called after a render, and only the first time the headline appears.
	 * The rings are a CSS transition on the dasharray; the number is counted
	 * in JavaScript because there is nothing about text a transition can
	 * interpolate.
	 */
	function playHeadline() {
		if (state.stillRings) return;
		var hero = root.querySelector(".sl-hero");
		if (!hero) return;

		state.stillRings = true;

		var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

		var arcs = root.querySelectorAll(".sl-ringarc");
		var pcts = root.querySelectorAll(".sl-ringpct");
		var num = root.querySelector(".sl-heronum[data-count]");

		if (still) {
			settleHeadline(arcs, pcts, num);
			return;
		}

		/* The money first, then the rings.
		   Everything moving at once is a lot to look at and nothing leads.
		   The figure is the headline, so it runs alone; the rings follow once
		   it has almost landed, and stagger among themselves. */
		var MONEY_MS = 1150;

		requestAnimationFrame(function () {
			requestAnimationFrame(function () {
				if (num) {
					countUp(num, parseInt(num.dataset.count, 10) || 0, MONEY_MS, function (el, v) {
						el.textContent = cash(v) || "$0";
					});
				}

				setTimeout(function () {
					for (var i = 0; i < arcs.length; i++) {
						var a = arcs[i];
						var on = parseFloat(a.dataset.on) || 0;
						var c = parseFloat(a.dataset.c) || 1;
						a.style.transitionDelay = (i * 130) + "ms";
						a.setAttribute("stroke-dasharray", on.toFixed(1) + " " + (c - on).toFixed(1));
					}
					for (var j = 0; j < pcts.length; j++) {
						countUp(pcts[j], parseInt(pcts[j].dataset.to, 10) || 0, 850 + j * 130, function (el, v) {
							el.innerHTML = v + "<i>%</i>";
						});
					}
				}, num ? MONEY_MS * 0.72 : 0);
			});
		});
	}

	/**
	 * The tour box arriving: the figure runs up, then the goal bar fills and
	 * is left breathing. Separate from the headline because they are on
	 * different tabs and each should play when its own tab is first seen.
	 */
	function playTourBox() {
		var box = root.querySelector(".sl-goal");
		if (!box) return;

		var num = box.querySelector(".sl-goalnum[data-count]");
		var fill = box.querySelector(".sl-goalfill[data-fill]");
		var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

		/* The figure runs up once, on first sight. The bar is separate,
		   because a goal can be set long after the box first appeared — the
		   play-once flag would leave that bar filled but dead. Each is asked
		   whether it has already played rather than sharing one answer. */
		var firstNumber = !state.stillTour;
		state.stillTour = true;

		var target = fill ? (parseFloat(fill.dataset.fill) || 0) : 0;
		var freshBar = fill && !fill.classList.contains("is-live");

		if (still) {
			if (num) num.textContent = cash(parseInt(num.dataset.count, 10) || 0) || "$0";
			if (fill) { fill.style.width = target + "%"; fill.classList.add("is-live"); }
			return;
		}

		requestAnimationFrame(function () {
			requestAnimationFrame(function () {
				if (num && firstNumber) {
					countUp(num, parseInt(num.dataset.count, 10) || 0, 1050, function (el, v) {
						el.textContent = cash(v) || "$0";
					});
				}

				if (!freshBar) return;

				setTimeout(function () {
					fill.style.width = target + "%";
					/* The waves only start once the bar has stopped growing —
					   liquid sloshing while its own container is still moving
					   reads as a glitch rather than as a surface. */
					setTimeout(function () {
						fill.classList.add("is-live");
						state.goalFilled = true;
					}, 1150);
				}, (num && firstNumber) ? 700 : 60);
			});
		});
	}

	function settleHeadline(arcs, pcts, num) {
		for (var i = 0; i < arcs.length; i++) {
			var on = parseFloat(arcs[i].dataset.on) || 0;
			var c = parseFloat(arcs[i].dataset.c) || 1;
			arcs[i].setAttribute("stroke-dasharray", on.toFixed(1) + " " + (c - on).toFixed(1));
		}
		for (var j = 0; j < pcts.length; j++) {
			pcts[j].innerHTML = (pcts[j].dataset.to || 0) + "<i>%</i>";
		}
		if (num) num.textContent = cash(parseInt(num.dataset.count, 10) || 0) || "$0";
	}

	/**
	 * Run a number up to its value.
	 *
	 * Eased out, so it moves quickly and lands softly rather than ticking at
	 * a constant rate — and it always finishes on the exact figure rather
	 * than wherever the last frame happened to fall.
	 */
	function countUp(el, to, ms, write) {
		if (!el || !to) { if (el) write(el, to || 0); return; }

		var started = null;
		function step(now) {
			if (started === null) started = now;
			var p = Math.min(1, (now - started) / ms);
			var eased = 1 - Math.pow(1 - p, 3);
			write(el, Math.round(to * eased));
			if (p < 1) requestAnimationFrame(step);
			else write(el, to);
		}
		requestAnimationFrame(step);
	}

	function badgePeek(opts) {
		var picked = opts.ticket
			? state.tickets.filter(function (t) { return String(t.id) === String(opts.ticket); })
			: state.tickets.filter(function (t) { return t.date === opts.day && !t.isTest; });

		if (!picked.length) return;

		if (!peekHost) {
			peekHost = document.createElement("div");
			peekHost.className = "sl-peek sl-app";
			document.body.appendChild(peekHost);

			peekHost.addEventListener("click", function (e) {
				if (e.target === peekHost || (e.target.closest && e.target.closest("[data-peek=\"close\"]"))) {
					closePeek();
				}
			});
			document.addEventListener("keydown", function (e) {
				if (e.key === "Escape" && peekHost.classList.contains("is-on")) closePeek();
			});
		}

		var title = opts.ticket
			? "That night"
			: picked.length + (picked.length === 1 ? " party on " : " parties on ") + prettyDate(opts.day);

		peekHost.innerHTML =
			'<div class="sl-peeksheet" role="dialog" aria-label="' + esc(title) + '">' +
				'<button type="button" class="sl-peekclose" data-peek="close" aria-label="Close">' +
					'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
						'stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>' +
				"</button>" +
				'<p class="sl-eyebrow">' + esc(title) + "</p>" +
				'<div class="sl-peekbody">' + picked.map(peekTicket).join("") + "</div>" +
			"</div>";

		peekHost.classList.add("is-on");
		var close = peekHost.querySelector(".sl-peekclose");
		if (close) setTimeout(function () { close.focus(); }, 60);
	}

	function closePeek() {
		if (!peekHost) return;
		peekHost.classList.remove("is-on");
		setTimeout(function () { if (peekHost) peekHost.innerHTML = ""; }, 220);
	}

	/** One ticket, written out the way the log writes it. */
	function peekTicket(t) {
		var kindLabel = kindLabelOf(t);
		var guestLabel = guestLabelOf(t);

		var chips = ['<span class="sl-chip" data-tone="c1">' + esc(kindLabel) + "</span>"];
		(t.partyTypes || []).forEach(function (k) {
			if (PARTY[k]) chips.push('<span class="sl-chip" data-tone="c2">' + esc(PARTY[k]) + "</span>");
		});
		if (guestLabel) chips.push('<span class="sl-chip">' + esc(guestLabel) + "</span>");
		if (t.hotelGuest === "yes") chips.push('<span class="sl-chip" data-tone="c1">Hotel guest</span>');
		if (t.attendance === "showed") chips.push('<span class="sl-chip" data-tone="pos">Showed up</span>');
		if (t.attendance === "noshow") chips.push('<span class="sl-chip" data-tone="caution">No show</span>');
		if (t.outcome === "booked") chips.push('<span class="sl-chip" data-tone="pos">Booked</span>');
		if (t.outcome === "notbooked") chips.push('<span class="sl-chip" data-tone="caution">Did not book</span>');
		if (t.limo === "yes") chips.push('<span class="sl-chip">Limo</span>');
		if (t.outside === "yes") chips.push('<span class="sl-chip">Outside driver</span>');
		if (t.selfDrive === "yes") chips.push('<span class="sl-chip">Self drive</span>');

		var priced = ownPriceOf(t) > 0;

		return '<article class="sl-peekticket">' +
			'<div class="sl-peektop">' +
				'<span class="sl-peekid">#' + t.id + "</span>" +
				'<span class="sl-peekwhen">' + esc(prettyDate(t.date)) + " · " + esc(prettyTime(t.time)) + "</span>" +
				(priced
					? '<span class="sl-peekmoney' + (state.showMoney ? "" : " sl-mask") + '">' +
						(state.showMoney ? (cash(ownPriceOf(t)) || "—") : "$•••") +
						(t.priceMode === "private" ? '<i>private</i>' : "") + "</span>"
					: "") +
			"</div>" +
			'<div class="sl-chips">' + chips.join("") + "</div>" +
			(t.reason ? '<p class="sl-peekreason">' + esc(t.reason) + "</p>" : "") +
			(t.note ? '<p class="sl-pnote">' + esc(t.note) + "</p>" : "") +
			"</article>";
	}

	function badgeIcon(name) {
		var d = {
			flame: '<path d="M12 3s5 4.2 5 8.4A5 5 0 0 1 7 11.4C7 7.2 12 3 12 3Z"/><path d="M12 21a3.4 3.4 0 0 0 3.4-3.4c0-2.3-3.4-4.6-3.4-4.6s-3.4 2.3-3.4 4.6A3.4 3.4 0 0 0 12 21Z"/>',
			crown: '<path d="M4 18h16M4 18 3 7l5 4 4-6 4 6 5-4-1 11"/>',
			check: '<path d="m20 6.5-10.5 10.5L4 11.5"/>',
			up: '<path d="M5 15.5 12 8.5l7 7"/>',
			down: '<path d="M5 8.5 12 15.5l7-7"/>',
			star: '<path d="m12 3.5 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 10l6.1-.9Z"/>',
			spark: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6.4 6.4l3 3M14.6 14.6l3 3M17.6 6.4l-3 3M9.4 14.6l-3 3"/>',
			open: '<path d="M9 6.5 14.5 12 9 17.5"/>',
		}[name] || "";
		return '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" ' +
			'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + "</svg>";
	}

	/** The one figure that leads, with movement against the last tour. */
	function heroFigure(tickets, all, reqRate) {
		var tours = buildTours(tickets);
		var cur = tours.length ? tourFigures(tickets, tours[tours.length - 1]) : null;
		var prev = tours.length > 1 ? tourFigures(tickets, tours[tours.length - 2]) : null;

		var lead = cur && cur.amount ? cur.amount : all.amount;
		var leading = cur && cur.amount ? "this tour" : "across your log";

		/* The tour's own shape, said once here rather than repeated in a card
		   below that would carry the same money and the same party count. */
		var shape = "";
		if (cur && tours.length) {
			var t = tours[tours.length - 1];
			shape = '<span class="sl-heroshape">' + esc(tourLabel(t)) +
				(cur.activeDays ? " · " + cur.activeDays + " of " + t.span + " days worked" : "") +
				(cur.partiesPerDay ? " · " + cur.partiesPerDay.toFixed(1) + " a day" : "") + "</span>";
		}

		var move = "";
		if (cur && prev && prev.amount > 0 && cur.amount > 0) {
			var d = Math.round((cur.amount / prev.amount - 1) * 100);
			if (d !== 0) {
				move = '<span class="sl-heromove" data-dir="' + (d > 0 ? "up" : "down") + '">' +
					badgeIcon(d > 0 ? "up" : "down") + Math.abs(d) + "% on last tour</span>";
			}
		}

		return '<div class="sl-hero">' +
			'<div class="sl-heromain">' +
				'<span class="sl-herolab">Booked ' + leading + "</span>" +
				'<strong class="sl-heronum' + (state.showMoney ? "" : " sl-mask") + '"' +
					(state.showMoney ? ' data-count="' + Math.round(lead) + '"' : "") + ">" +
					(state.showMoney ? (state.stillRings ? (cash(lead) || "$0") : (cash(0) || "$0")) : "$•••") +
					"</strong>" +
				'<span class="sl-herosub">' +
					(cur && cur.amount ? cur.booked + (cur.booked === 1 ? " party" : " parties") + " on this tour"
						: all.booked + (all.booked === 1 ? " party" : " parties") + " logged") +
					"</span>" +
				shape +
				move +
			"</div>" +
			'<div class="sl-herorings">' +
				rateRing(pctNum(all.a_showed, all.aMarked), "Appointments kept",
					all.a_showed + " of " + all.aMarked, "good") +
				rateRing(pctNum(all.booked, all.decided), "Booked",
					all.booked + " of " + all.decided + " decided", "pink") +
				/* A rate, not a figure scaled against an invented ceiling —
				   a ring needs a real denominator or the arc means nothing. */
				rateRing(pctNum(reqRate.booked, reqRate.decided), "Requests booked",
					reqRate.decided ? reqRate.booked + " of " + reqRate.decided + " decided" : "none yet", "gold") +
			"</div>" +
			"</div>";
	}

	/**
	 * @param quiet  leave the show/hide control off. One switch governs the
	 *               whole page, so a second copy of it further down is a
	 *               second thing to read that does nothing new.
	 */
	function moneyRow(context, quiet) {
		return '<div class="sl-privrow"><span>' +
			(state.showMoney
				? context + (quiet ? "" : ' <span class="sl-lock">Figures stay on the record they came from.</span>')
				: 'Amounts hidden <span class="sl-lock">— visible only when you ask</span>') +
			"</span>" +
			(quiet ? "" : '<button class="sl-link" data-act="money">' +
				(state.showMoney ? "Hide amounts" : "Show amounts") + "</button>") +
			"</div>";
	}


	function segmentTable(segs, total, whose) {
		var withMoney = whose !== "house";

		return '<section class="sl-card"><p class="sl-eyebrow">Every segment</p>' +
			'<div class="sl-scroll"><table class="sl-table"><thead><tr>' +
			"<th>Segment</th><th>Tickets</th><th>Showed</th><th>No show</th><th>Booked</th>" +
			(withMoney ? "<th>Total</th>" : "") + "</tr></thead><tbody>" +
			segs.map(function (s) {
				return "<tr><td>" + esc(s.name) + '<span class="sl-sublab">' + pct(s.n, total) + " of all tickets</span></td>" +
					"<td>" + s.n + "</td>" +
					'<td>' + (s.aMarked
						? '<span class="sl-pos">' + pct(s.a_showed, s.aMarked) + '</span><span class="sl-sublab">' + s.a_showed + " of " + s.aMarked + " appts</span>" +
						  '<div class="sl-track"><div class="sl-fill" style="width:' + pctNum(s.a_showed, s.aMarked) + '%"></div></div>'
						: '<span class="sl-dim">n/a</span><span class="sl-sublab">no appointments</span>') + "</td>" +
					'<td>' + (s.aMarked ? '<span class="sl-neg">' + pct(s.a_noshow, s.aMarked) + '</span><span class="sl-sublab">' + s.a_noshow + " missed</span>" : '<span class="sl-dim">—</span>') + "</td>" +
					"<td>" + pct(s.booked, s.decided) + '<span class="sl-sublab">' + s.booked + " of " + s.decided + "</span></td>" +
					(withMoney
						? '<td class="' + (state.showMoney ? "" : "sl-mask") + '">' + (cash(s.amount) || '<span class="sl-dim">—</span>') + "</td>"
						: "") + "</tr>";
			}).join("") +
			"</tbody></table></div>" +
			'<p class="sl-fn">Transport rows overlap when more than one applied on the same ticket, so they add to more than 100%.' +
			(withMoney ? "" : " Prices per segment are on your own insights, not here.") + "</p></section>";
	}

	/* ==================================================================
	   Collapsing sections

	   Each breakdown becomes a panel with a heading you can press. One is
	   open at a time: opening another closes the one before it, and pressing
	   the open one closes it. The tour and the week are never panels — they
	   are what the page is for, and hiding them behind a press would be
	   asking people to work for the thing they came to see.

	   A closed panel renders no body at all, so a log with a long history
	   costs nothing to display until it is asked for.
	   ================================================================== */

	/**
	 * Find a card's head, closing tag included, however deep it goes.
	 *
	 * A non-greedy `<div …>([\s\S]*?)</div>` stops at the first closing tag
	 * it meets, which is the wrong one the moment the head contains anything
	 * nested — the Day/Tour toggle, for instance. The head was then cut short,
	 * its own `</div>` left orphaned at the front of the body, and in the
	 * browser that stray tag closed the panel body early: everything after it
	 * fell outside, and the chart rendered as nothing at all.
	 *
	 * Counting opens and closes finds the tag that actually matches.
	 * Returns [whole, inner] like a match, or null.
	 */
	function matchCardHead(html) {
		var open = '<div class="sl-cardhead">';
		var at = html.indexOf(open);
		if (at === -1) return null;

		var i = at + open.length;
		var depth = 1;
		var tag = /<(\/?)div\b/g;
		tag.lastIndex = i;

		var m;
		while ((m = tag.exec(html))) {
			depth += m[1] ? -1 : 1;
			if (depth === 0) {
				var end = m.index + m[0].length;
				end = html.indexOf(">", end) + 1;
				return [html.slice(at, end), html.slice(at + open.length, m.index)];
			}
		}
		return null;
	}

	function panelParts(cardHtml) {
		var title = "", meta = "", body = cardHtml;

		// lift the heading out of the card so the panel button can carry it
		var head = matchCardHead(body);
		if (head) {
			var inner = head[1];
			var eyebrow = inner.match(/<p class="sl-eyebrow">([\s\S]*?)<\/p>/);
			var range = inner.match(/<span class="sl-weekrange">([\s\S]*?)<\/span>/);
			title = eyebrow ? eyebrow[1] : "";
			meta = range ? range[1] : "";

			/* Whatever else was in the head — the Day/Tour toggle on the
			   chart — is a control, not decoration. Taking the head away
			   wholesale removed it from the page altogether, so anything
			   left after the title and the date range is put back at the
			   top of the body where it can still be reached. */
			var rest = inner;
			if (eyebrow) rest = rest.replace(eyebrow[0], "");
			if (range) rest = rest.replace(range[0], "");
			rest = rest.trim();

			body = body.replace(head[0], rest ? '<div class="sl-panelctl">' + rest + "</div>" : "");
		} else {
			var solo = body.match(/<p class="sl-eyebrow">([\s\S]*?)<\/p>/);
			if (solo) {
				title = solo[1];
				body = body.replace(solo[0], "");
			}
		}

		// and drop the card's own frame, since the panel provides one
		body = body.replace(/^\s*<section class="sl-card[^"]*">/, "");
		body = body.replace(/<\/section>\s*$/, "");

		return { title: title, meta: meta, body: body };
	}

	/**
	 * Each panel carries a mark and a line of its own, so a closed one reads
	 * as a card worth opening rather than a bar with a word on it. The marks
	 * are drawn rather than typed — an emoji would fight the typeface.
	 */
	var PANEL_FACE = {
		coach: {
			line: "Drawn from your own figures, worth most first",
			icon: '<path d="M9 18h6M10 21.5h4"/><path d="M12 2.5a6.2 6.2 0 0 1 3.8 11.1c-.6.5-.9 1.1-.9 1.7v.2H9.1v-.2c0-.6-.3-1.2-.9-1.7A6.2 6.2 0 0 1 12 2.5Z"/>',
		},
		observations: {
			line: "Patterns drawn from your own tickets",
			icon: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3M5.4 5.4l2.1 2.1M16.5 16.5l2.1 2.1M18.6 5.4l-2.1 2.1M7.5 16.5l-2.1 2.1"/>',
		},
		correlations: {
			line: "One thing measured against another",
			icon: '<path d="M4 19V9M10 19V4M16 19v-7M22 19H2"/>',
		},
		chart: {
			line: "Appointments kept, period by period",
			icon: '<path d="M3 20h18M6 20V9M11 20V5M16 20v-8"/><circle cx="6" cy="6" r="1.6"/>',
		},
		party: {
			line: "What you are asked for most",
			icon: '<path d="M12 20.5S3.5 15 3.5 9.2A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.5 2.8c0 5.8-8.5 11.3-8.5 11.3Z"/>',
		},
		why: {
			line: "What the ones that got away said",
			icon: '<path d="M12 16.2v.01"/><path d="M12 13.2v-1a3 3 0 1 0-3-3"/><circle cx="12" cy="12" r="9.2"/>',
		},
		limo: {
			line: "What the limo takes off the top",
			icon: '<path d="M3 14.5h18M5 14.5l1.7-4.2A2 2 0 0 1 8.6 9h6.8a2 2 0 0 1 1.9 1.3l1.7 4.2"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/>',
		},
		segments: {
			line: "Every slice of the log, side by side",
			icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18M9.5 9.5V20"/>',
		},
		tours: {
			line: "Every tour you have logged",
			icon: '<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
		},
		group: {
			line: "Patterns across the whole floor",
			icon: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.4 19.4a5.9 5.9 0 0 1 11.2 0"/><path d="M16.2 6.1a3.2 3.2 0 0 1 .9 6.2M17.8 14.2a5.6 5.6 0 0 1 3 4.4"/>',
		},
		weeks: {
			line: "The floor, week by week",
			icon: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M7.5 14.5h3M13.5 14.5h3"/>',
		},
	};

	/**
	 * @param own  a face of this panel's own, for panels there is one of per
	 *             tour rather than one of in the whole app.
	 */
	function panel(id, cardHtml, group, own) {
		var parts = panelParts(cardHtml);
		var isOpen = state.open[group] === id;
		var face = own || PANEL_FACE[id] || { line: "", icon: '<circle cx="12" cy="12" r="8"/>' };

		return '<section class="sl-panel' + (isOpen ? " is-open" : "") + '">' +
			'<button type="button" class="sl-panelhead" data-act="panel" data-id="' + esc(id) +
				'" data-group="' + esc(group) + '" aria-expanded="' + isOpen + '">' +
				'<span class="sl-panelicon" aria-hidden="true">' +
					'<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" ' +
						'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + face.icon + "</svg>" +
				"</span>" +
				'<span class="sl-paneltext">' +
					'<span class="sl-paneltitle">' + parts.title + "</span>" +
					(face.line ? '<span class="sl-panelline">' + esc(face.line) + "</span>" : "") +
				"</span>" +
				(parts.meta ? '<span class="sl-panelmeta">' + parts.meta + "</span>" : "") +
				'<span class="sl-panelsign" aria-hidden="true">' +
					'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
						'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
						'<path d="M6 9.5 12 15l6-5.5"/></svg>' +
				"</span>" +
			"</button>" +
			(isOpen ? '<div class="sl-panelbody">' + parts.body + "</div>" : "") +
			"</section>";
	}

	/* ---------------- tabs ---------------- */
	/**
	 * Party type — a dropdown holding a multi-select. Collapsed it shows a
	 * summary so the form stays short; open it lists every option and any
	 * number can be on at once.
	 */
	function partyPicker(f) {
		var chosen = f.party_types || [];
		var summary = chosen.length
			? chosen.map(function (k) { return PARTY[k] || k; }).join(" · ")
			: "None selected";

		var panel = "";
		if (state.partyOpen) {
			panel = '<div class="sl-ddpanel sl-reveal">' +
				Object.keys(PARTY).map(function (k) {
					var on = chosen.indexOf(k) !== -1;
					return '<button type="button" class="sl-opt sl-ddopt" data-tone="c4" data-multi="party_types" data-value="' + k + '" aria-pressed="' + on + '">' +
						'<span class="sl-tick" aria-hidden="true"></span>' + esc(PARTY[k]) + "</button>";
				}).join("") +
				(chosen.length ? '<button type="button" class="sl-link sl-ddclear" data-act="clearparty">Clear all</button>' : "") +
				"</div>";
		}

		return '<div class="sl-field"><span class="sl-label">Party type <span class="sl-hint">choose any that applied</span></span>' +
			'<button type="button" class="sl-dd" data-act="party" aria-expanded="' + state.partyOpen + '">' +
				'<span class="sl-ddsum' + (chosen.length ? " is-set" : "") + '">' + esc(summary) + "</span>" +
				'<span class="sl-ddmeta">' + (chosen.length ? chosen.length + " selected" : "Select") + '<span class="sl-caret" aria-hidden="true"></span></span>' +
			"</button>" + panel + "</div>";
	}

	function renderForm() {
		var f = state.form;
		var editing = state.editing !== null;
		var out = '<section class="sl-card' + (editing ? " is-editing" : "") + '">' +
			'<div class="sl-cardhead"><p class="sl-eyebrow">' + (editing ? "Editing ticket" : "New ticket") + "</p>" +
			(editing ? '<button type="button" class="sl-link" data-act="canceledit">Cancel</button>' : "") +
			"</div>";

		out += '<div class="sl-field"><label class="sl-label" for="sl-date">Day and time</label><div class="sl-pair">' +
			'<input id="sl-date" class="sl-input sl-mono" type="date" data-input="date" value="' + esc(f.date) + '">' +
			'<input aria-label="Time" class="sl-input sl-mono" type="time" data-input="time" value="' + esc(f.time) + '"></div></div>';

		out += '<div class="sl-field"><span class="sl-label">This ticket is an <span class="sl-hint">request = walk-in or call-in</span></span>' +
			pick("kind", f.kind, [
				{ value: "appointment", label: "Appointment", tone: "c1" },
				{ value: "request", label: "Request", tone: "c2" },
				{ value: "lineup", label: "Picked from lineup", tone: "c3" },
				{ value: "bar", label: "Walk-in from bar", tone: "c4" },
				{ value: "pull", label: "Pull-in", tone: "c5" }
			]) + "</div>";

		out += partyPicker(f);

		out += '<div class="sl-field"><span class="sl-label">Guest <span class="sl-hint">have they been here before?</span></span>' +
			pick("guest_type", f.guest_type, [
				{ value: "new", label: "New guest", tone: "c4" },
				{ value: "returning", label: "Returning to me", tone: "c1" },
				{ value: "house", label: "New to me, ranch regular", tone: "c2" },
				{ value: "unknown", label: "Unknown", tone: "muted" },
			]) + "</div>";

		out += '<div class="sl-field"><span class="sl-label">Hotel guest <span class="sl-hint">staying on the property?</span></span>' +
			pick("hotel_guest", f.hotel_guest, [
				{ value: "yes", label: "Yes", tone: "c1" },
				{ value: "no", label: "No", tone: "c3" },
				{ value: "unknown", label: "Unknown", tone: "muted" },
			]) + "</div>";

		out += '<div class="sl-field"><span class="sl-label">Transport <span class="sl-hint">how they got here</span></span>' +
			pick("transport", f.transport, [
				{ value: "limo", label: "Limo", tone: "c1" },
				{ value: "outside", label: "Outside driver", tone: "c2" },
				{ value: "self", label: "Self drive", tone: "c3" },
				{ value: "unknown", label: "Unknown", tone: "muted" }
			]) + "</div>";

		if (f.kind === "appointment") {
			out += '<div class="sl-field"><span class="sl-label">Attendance</span>' +
				pick("attendance", f.attendance, [
					{ value: "showed", label: "Showed up", tone: "pos" },
					{ value: "noshow", label: "No show", tone: "caution" }
				]) + "</div>";
		} else {
			// A request, a lineup pick and a bar walk-in all mean the guest is
			// already standing there, so there is nothing to ask.
			out += '<div class="sl-field sl-reveal"><span class="sl-label">Attendance</span>' +
				'<div class="sl-skip">Guest was already here, so this counts as kept. Only appointments can be a no-show, which is why the show rate is measured on appointments alone.</div></div>';
		}

		if (f.kind === "appointment" && f.attendance === "noshow") {
			out += '<div class="sl-field sl-reveal"><span class="sl-label">Outcome</span>' +
				'<div class="sl-skip">No show — nothing to book, so this ticket is ready to save.</div></div>';
		} else {
			out += '<div class="sl-field"><span class="sl-label">Outcome</span>' +
				pick("outcome", f.outcome, [{ value: "booked", label: "Booked", tone: "pos" }, { value: "notbooked", label: "Did not book", tone: "caution" }]) + "</div>";

			if (f.outcome === "booked") {
				out += '<div class="sl-field sl-reveal"><span class="sl-label">Party price <span class="sl-hint">yours to share or keep</span></span>' +
					pick("price_mode", f.price_mode, [
						{ value: "included", label: "Add & share", tone: "c2" },
						{ value: "private", label: "Add, keep private", tone: "c1" },
						{ value: "omitted", label: "Leave it off", tone: "muted" }
					]);
				if (f.price_mode === "included" || f.price_mode === "private") {
					out += '<div class="sl-pricebox sl-reveal">' +
						'<span class="sl-cur">$</span>' +
						'<input class="sl-input sl-mono sl-price" inputmode="decimal" placeholder="0" aria-label="Party price" data-input="amount" value="' + esc(f.amount) + '">' +
						"</div>";
					out += '<p class="sl-fn sl-reveal">' + (f.price_mode === "private"
						? "Counts in your own totals only. Left out of every figure on the Everyone tab."
						: "Counts in your totals and in the shared house total.") + "</p>";
				} else if (f.price_mode === "omitted") {
					out += '<div class="sl-skip sl-reveal" style="margin-top:12px">Price left off. The ticket still counts as booked everywhere — no figure goes anywhere.</div>';
				}
				out += "</div>";
			}

			if (f.outcome === "notbooked") {
				out += '<div class="sl-field sl-reveal"><label class="sl-label" for="sl-why">Reason <span class="sl-hint">optional</span></label>' +
					'<textarea id="sl-why" class="sl-area" data-input="reason" placeholder="What got in the way?">' + esc(f.reason) + "</textarea></div>";
			}
		}

		out += '<div class="sl-field"><span class="sl-label">Test ticket <span class="sl-hint">for trying the site out</span></span>' +
			pick("is_test", f.is_test ? "yes" : "no", [
				{ value: "no", label: "Real ticket", tone: "c1" },
				{ value: "yes", label: "Just testing", tone: "muted" }
			], "Real ticket") +
			(f.is_test
				? '<div class="sl-skip sl-reveal" style="margin-top:12px">Saves and edits like any other ticket, and stays in your log — but it is left out of every figure, yours and the house\'s.</div>'
				: "") +
			"</div>";

		out += '<div class="sl-field"><label class="sl-label" for="sl-pnote">Private note <span class="sl-hint">optional, only ever yours</span></label>' +
			'<textarea id="sl-pnote" class="sl-area" data-input="note" placeholder="Anything worth remembering about this one.">' + esc(f.note) + "</textarea>" +
			'<p class="sl-fn">Stays on this ticket and on your account alone. Never counted, never aggregated, never visible on the Everyone tab.</p></div>';

		out += '<div class="sl-actions"><button type="button" class="sl-save" data-act="save">' +
				(editing ? "Update ticket" : "Save ticket") + "</button>" +
			'<button type="button" class="sl-ghost" data-act="' + (editing ? "canceledit" : "clearform") + '">' +
				(editing ? "Cancel" : "Reset") + "</button>" +
			(state.status ? '<span class="sl-note" data-ok="' + state.status.ok + '">' + esc(state.status.msg) + "</span>" : "") +
			"</div></section>";
		return out;
	}

	/**
	 * One ticket, as it appears in the log.
	 *
	 * Written once because it is drawn in two places now — the tour in hand,
	 * and each earlier tour in the section beneath it. Two copies of this
	 * markup would describe the same ticket two different ways the first time
	 * either one was edited.
	 *
	 * @param no  the ticket's number in the whole log, so it does not change
	 *            depending on which list it is being read in.
	 */
	function ticketStub(t, no) {
		var guestLabel = guestLabelOf(t);
		var kindLabel = kindLabelOf(t);
		var kindTone = KIND_TONE[t.kind] || "c1";
		var chips = [];
		if (t.isTest) chips.push('<span class="sl-chip" data-tone="muted">Test</span>');
		chips.push('<span class="sl-chip" data-tone="' + kindTone + '">' + esc(kindLabel) + "</span>");
		(t.partyTypes || []).forEach(function (k) {
			chips.push('<span class="sl-chip" data-tone="c4">' + esc(PARTY[k] || k) + "</span>");
		});
		if (guestLabel) chips.push('<span class="sl-chip" data-tone="' + ({ "new": "c4", returning: "c1", house: "c2" }[t.guestType] || "muted") + '">' + guestLabel + "</span>");
		if (t.attendance) chips.push('<span class="sl-chip" data-tone="' + (t.attendance === "showed" ? "pos" : "caution") + '">' + (t.attendance === "showed" ? "Showed up" : "No show") + "</span>");
		if (t.outcome) chips.push('<span class="sl-chip" data-tone="' + (t.outcome === "booked" ? "pos" : "caution") + '">' + (t.outcome === "booked" ? "Booked" : "Did not book") + "</span>");
		if (t.outcome === "booked" && t.priceMode === "omitted") chips.push('<span class="sl-chip">Price left off</span>');
		if (t.outcome === "booked" && t.priceMode === "private") chips.push('<span class="sl-chip" data-tone="c1">Price private</span>');
		if (t.limo === "yes") chips.push('<span class="sl-chip">Limo</span>');
		if (t.outside === "yes") chips.push('<span class="sl-chip">Outside driver</span>');
		if (t.selfDrive === "yes") chips.push('<span class="sl-chip">Self drive</span>');
		if (t.hotelGuest === "yes") chips.push('<span class="sl-chip" data-tone="c1">Hotel guest</span>');
		if (t.hotelGuest === "no") chips.push('<span class="sl-chip">Not staying</span>');
		if (t.limo !== "yes" && t.outside !== "yes" && t.selfDrive !== "yes" &&
			(t.limo === "unknown" || t.outside === "unknown" || t.selfDrive === "unknown")) chips.push('<span class="sl-chip">Transport unknown</span>');

		return '<article class="sl-stub' + (t.isTest ? " is-test" : "") + '" data-id="' + t.id + '">' +
			'<div class="sl-stubside"><div class="sl-stubno">#' + pad(no) + '</div><div class="sl-stubtime">' + prettyTime(t.time) + "</div></div>" +
			'<div class="sl-stubbody">' +
				'<div class="sl-stubtools">' +
					'<button class="sl-tool" data-act="edit" data-id="' + t.id + '" aria-label="Edit this ticket">edit</button>' +
					'<button class="sl-tool sl-tool-del" data-act="remove" data-id="' + t.id + '" aria-label="Remove this ticket">remove</button>' +
				"</div>" +
				'<div class="sl-stubhead"><span class="sl-stubdate">' + prettyDate(t.date) + "</span>" +
				(t.outcome === "booked" && cash(t.amount) ? '<span class="sl-amount' + (state.showMoney ? "" : " sl-mask") + '">' + cash(t.amount) + "</span>" : "") +
				'</div><div class="sl-chips">' + chips.join("") + "</div>" +
				(t.outcome === "notbooked" && t.reason ? '<p class="sl-reason">' + esc(t.reason) + "</p>" : "") +
			(t.note ? '<p class="sl-pnote"><span class="sl-pnotetag">Private</span>' + esc(t.note).replace(/\n/g, "<br>") + "</p>" : "") +
			"</div></article>";
	}

	/** Where each ticket sits in the whole log, so its number never moves. */
	function ticketNumbers() {
		var map = {};
		state.tickets.forEach(function (t, i) { map[t.id] = state.tickets.length - i; });
		return map;
	}

	/**
	 * The tickets of one earlier tour, with the figures that tour came to.
	 *
	 * These are drawn from the log as it stands rather than from the record
	 * kept at closing: this is the list of tickets, and a list has to agree
	 * with the tickets in it.
	 */
	function pastTourCard(tour, tickets, numbers) {
		var rows = tickets.filter(function (t) { return tour.holds(t.date); });
		var f = tally(rows.filter(function (t) { return !t.isTest; }));

		return '<section class="sl-card"><div class="sl-cardhead">' +
			'<p class="sl-eyebrow">' + esc(scopeTitle(tour)) + "</p>" +
			// The heading counts what the figures count. It used to include test
			// tickets, so a tour read "50 tickets" here and 48 in the history.
			'<span class="sl-weekrange">' + f.n + (f.n === 1 ? " ticket" : " tickets") +
				(rows.length > f.n ? " · " + (rows.length - f.n) + " test" : "") + "</span></div>" +
			'<div class="sl-stats sl-statsmall" data-cols="4">' +
				'<div class="sl-stat"><div class="sl-statnum">' + f.n + '</div><div class="sl-statlab">Tickets</div></div>' +
				'<div class="sl-stat"><div class="sl-statnum sl-pos">' + pct(f.a_showed, f.aMarked) + '</div><div class="sl-statlab">Appts kept</div></div>' +
				'<div class="sl-stat"><div class="sl-statnum">' + f.booked + '</div><div class="sl-statlab">Parties</div></div>' +
				'<div class="sl-stat"><div class="sl-statnum' + (state.showMoney ? "" : " sl-mask") + '">' +
					(f.amount ? (cash(f.amount) || "—") : "—") + '</div><div class="sl-statlab">Booked</div></div>' +
			"</div>" +
			'<div class="sl-scrollbox">' +
				'<div class="sl-stack">' +
					rows.map(function (t) { return ticketStub(t, numbers[t.id]); }).join("") +
				"</div>" +
			"</div></section>";
	}

	/**
	 * The tours that are over — every one but the shift running now.
	 *
	 * The tour in hand belongs on the log, where tickets are still being
	 * written into it. Everything before it belongs on its own tab, which is
	 * where this list is read.
	 */
	function pastScopes() {
		var running = state.tour.open ? state.tour.open.start : null;
		var list = tourScopes(counted());
		if (!list.length) return [];

		return list.filter(function (t) {
			if (t.loose) return true;
			/* With a declared tour open, that one is the live one. Without,
			   the newest inferred stretch is the one being worked. */
			return running ? t.start !== running : t.key !== list[0].key;
		});
	}

	/** What every closed tour comes to, read together. */
	function pastSummary(scopes) {
		var totals = { tours: 0, n: 0, booked: 0, amount: 0, priced: 0, days: 0 };
		var best = null;

		scopes.forEach(function (tour) {
			if (tour.loose) return;
			var rows = inScope(counted(), tour);
			var f = tally(rows);
			totals.tours++;
			totals.n += f.n;
			totals.booked += f.booked;
			totals.amount += f.amount;
			totals.priced += f.priced;
			totals.days += tour.span;
			if (!best || f.amount > best.amount) best = { amount: f.amount, tour: tour };
		});

		totals.best = best;
		return totals;
	}

	function renderPast() {
		var scopes = pastScopes();

		if (!scopes.length) {
			return '<p class="sl-scope">Tours you have finished</p>' +
				'<div class="sl-empty"><strong>No finished tours yet</strong>' +
				"Every tour you close is kept here with its figures and its tickets, " +
				"so you can read one against the last.</div>";
		}

		var numbers = ticketNumbers();
		var sum = pastSummary(scopes);
		var avgTour = sum.tours ? sum.amount / sum.tours : 0;
		var goals = goalRecord(scopes);

		var strip = sum.tours
			? '<div class="sl-stats" data-cols="' + (goals.set ? 6 : 5) + '">' +
				'<div class="sl-stat"><div class="sl-statnum">' + sum.tours + '</div><div class="sl-statlab">Tours closed</div>' +
					'<div class="sl-statsub">' + sum.days + " days worked</div></div>" +
				'<div class="sl-stat"><div class="sl-statnum">' + sum.booked + '</div><div class="sl-statlab">Parties</div>' +
					'<div class="sl-statsub">across ' + sum.n + " tickets</div></div>" +
				'<div class="sl-stat"><div class="sl-statnum' + (state.showMoney ? "" : " sl-mask") + '">' +
						(sum.amount ? (cash(sum.amount) || "—") : "—") + '</div><div class="sl-statlab">Booked in all</div>' +
					'<div class="sl-statsub">across ' + sum.priced + " priced</div></div>" +
				'<div class="sl-stat"><div class="sl-statnum' + (state.showMoney ? "" : " sl-mask") + '">' +
						(avgTour ? (cash(avgTour) || "—") : "—") + '</div><div class="sl-statlab">A tour, on average</div>' +
					'<div class="sl-statsub">across ' + sum.tours + " closed</div></div>" +
				'<div class="sl-stat"><div class="sl-statnum' + (state.showMoney ? "" : " sl-mask") + '">' +
						(sum.best && sum.best.amount ? (cash(sum.best.amount) || "—") : "—") + '</div><div class="sl-statlab">Best tour</div>' +
					'<div class="sl-statsub">' + (sum.best ? esc(tourLabel(sum.best.tour)) : "—") + "</div></div>" +
				(goals.set
					? '<div class="sl-stat"><div class="sl-statnum' + (goals.met === goals.set ? " sl-pos" : "") + '">' +
							goals.met + " of " + goals.set + '</div><div class="sl-statlab">Goals met</div>' +
						'<div class="sl-statsub">of the tours you set one on</div></div>'
					: "") +
			"</div>"
			: "";

		return '<p class="sl-scope">Tours you have finished</p>' +
			strip +
			tourClosedCard(state.tour.just) +
			'<div class="sl-panels">' +
				panel("tours", tourHistoryCard(counted()), "past") +
			"</div>" +
			'<section class="sl-pastwrap">' +
				'<div class="sl-pasthead">' +
					'<p class="sl-eyebrow">Tour by tour</p>' +
					/* Counted without the loose bucket, so this does not say
					   four tours directly beneath a strip saying three. */
					'<span class="sl-weekrange">' + sum.tours +
						(sum.tours === 1 ? " tour" : " tours") +
						(scopes.length > sum.tours ? " · and loose days" : "") + "</span>" +
				"</div>" +
				'<div class="sl-panels">' +
					scopes.map(function (tour) {
						var rows = state.tickets.filter(function (t) { return tour.holds(t.date); });
						var parties = tally(rows.filter(function (t) { return !t.isTest; })).booked;
						/* The count is already on the right of the row, so this
						   line carries what the count does not. */
						return panel("past-" + tour.key, pastTourCard(tour, state.tickets, numbers), "pastlist", {
							line: tour.loose
								? "Days that fall outside every tour"
								: tour.span + (tour.span === 1 ? " day" : " days") + " · " +
									parties + (parties === 1 ? " party" : " parties"),
							icon: '<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
						});
					}).join("") +
				"</div></section>";
	}

	function renderLog() {
		var whole = counted();
		var tour = activeTour(whole);
		var scoped = inScope(state.tickets, tour);
		var all = tally(inScope(whole, tour));
		var numbers = ticketNumbers();
		var list;

		if (state.loading) {
			list = '<div class="sl-empty">Opening your log…</div>';
		} else if (!state.tickets.length) {
			list = '<div class="sl-empty"><strong>Nothing logged yet</strong>Fill in the ticket beside this and it will appear here.</div>';
		} else if (!scoped.length) {
			list = '<div class="sl-empty"><strong>Nothing on this tour yet</strong>The first ticket you save lands here.</div>';
		} else {
			var shown = scoped.slice(0, state.visible);
			var hidden = scoped.length - shown.length;

			list = '<div class="sl-stack">' + shown.map(function (t) {
				return ticketStub(t, numbers[t.id]);
			}).join("") + "</div>" +
				(hidden
					? '<div class="sl-more"><button type="button" class="sl-ghost" data-act="more">Show ' +
						Math.min(hidden, 40) + ' more</button><span class="sl-morecount">' +
						shown.length + " of " + scoped.length + "</span></div>"
					: "");

			/* The log gets its own window. Without this the column simply grows
			   with the number of tickets, and the form beside it ends up a short
			   panel floating against a very long page. */
			list = '<div class="sl-logwrap"><div class="sl-logscroll" tabindex="0" ' +
				'aria-label="Your tickets, scrollable">' + list + "</div></div>";
		}

		/* The switch that reveals amounts belongs where the first hidden
		   figure is, which is the top of the page — on the log that is the
		   tour's booked total, two lines down. Left where it used to sit,
		   halfway down the column beside the tickets, it had to be hunted
		   for every time. */
		return moneyRow('Booked total <span class="sl-privfig">' + (money(all.amount) || "$0") + "</span>" +
				(all.priced ? " across " + all.priced + " priced " + (all.priced === 1 ? "ticket" : "tickets") : "") +
				(all.kept ? " · " + all.kept + " kept private" : "") + ".") +
			tourToggle() +
			scopeBar(whole) +
			'<div class="sl-grid"><div id="sl-formhost">' + renderForm() + "</div>" +
			'<section><div class="sl-cardhead"><p class="sl-eyebrow">' +
				(tour ? "This tour" : "Your log") + "</p>" +
				'<span class="sl-weekrange">' + esc(scopeTitle(tour)) + "</span></div>" +
			'<div class="sl-stats">' +
				'<div class="sl-stat"><div class="sl-statnum">' + all.n + '</div><div class="sl-statlab">Tickets</div></div>' +
				'<div class="sl-stat"><div class="sl-statnum sl-pos">' + pct(all.a_showed, all.aMarked) + '</div><div class="sl-statlab">Appts kept</div></div>' +
				'<div class="sl-stat"><div class="sl-statnum">' + pct(all.booked, all.decided) + '</div><div class="sl-statlab">Booked</div></div>' +
			"</div>" +
			list +
			'<div class="sl-foot"><span>Only your account can open this log.</span>' +
			(state.tickets.length ? '<button class="sl-link" data-act="csv">Download CSV</button>' : "") +
			"</div></section></div>";
	}

	function renderMine() {
		if (!state.tickets.length) {
			return '<div class="sl-empty"><strong>No tickets to measure yet</strong>Save a few tickets and every rate here fills in on its own.</div>';
		}
		/* Everything below reads one tour unless the scope says otherwise.
		   `whole` is kept for the few places that are about the log rather
		   than about this tour: the tour history table, and the comparison a
		   finding makes between this tour and your usual. */
		var whole = counted();
		var tour = activeTour(whole);
		var rows = inScope(whole, tour);

		if (!rows.length) {
			return scopeBar(whole) +
				'<div class="sl-empty"><strong>Nothing logged on this tour</strong>' +
				"Step back with the arrows to read an earlier one, or read the whole log.</div>";
		}

		var all = tally(rows);
		var reqRate = bookRateFor(rows, "request");
		var noShow = noShowValue(rows, all);

		// Two averages sit up top: what a party is worth across what is in
		// scope, and what it is worth across the whole log — the second is
		// what tells you whether this tour is running high or low.
		var avgScope = trimmedMean(ownPrices(rows));
		var avgEver = trimmedMean(ownPrices(whole));

		/* A tour is a handful of days, so a run of tours is the only split
		   with enough bars to read when one tour is in scope. Day by day is
		   the right split for the whole log. */
		var byTour = !!tour;
		var periods = byTour
			? series(whole, "tour", function (t) { return t.date; }, whole)
			: series(whole, state.mode, function (t) { return t.date; }, whole);

		var tests = state.tickets.filter(function (t) {
			return t.isTest && (!tour || tour.holds(t.date));
		}).length;

		return moneyRow(all.priced
				? all.shared + " shared · " + (all.kept || 0) + " private"
				: "No prices added yet") +
			scopeBar(whole) +
			heroFigure(rows, all, reqRate) +
			badges(rows, all) +
			mixBar(all) +
			/* What is left after the rings: the figures that are counts and
			   amounts rather than rates, so nothing here repeats what the
			   rings above already say. */
			'<div class="sl-stats sl-statsmall" data-cols="4">' +
			/* Booked and not booked do not add up to the total on their own —
			   a no-show or a ticket nobody has marked yet is neither. Leaving
			   the remainder off made the figures look wrong when they were
			   not, so whatever is left is named. */
			'<div class="sl-stat"><div class="sl-statnum">' + all.n + '</div><div class="sl-statlab">Tickets</div>' +
				'<div class="sl-statsub">' + all.booked + " booked · " + all.notbooked + " not" +
					(all.n - all.decided > 0 ? " · " + (all.n - all.decided) + " open" : "") +
				"</div></div>" +
			'<div class="sl-stat"><div class="sl-statnum' + (state.showMoney ? "" : " sl-mask") + '">' +
					(avgScope ? (cash(avgScope) || "—") : "—") + '</div><div class="sl-statlab">Average party</div>' +
				'<div class="sl-statsub">' + (all.priced
					? (tour && avgEver ? "your usual " + (cash(avgEver) || "—") : "across " + all.priced + " priced")
					: "no prices added") + "</div></div>" +
			'<div class="sl-stat"><div class="sl-statnum' + (state.showMoney ? "" : " sl-mask") + '">' +
					(all.amount ? (cash(all.amount) || "—") : "—") + '</div><div class="sl-statlab">Booked in total</div>' +
				'<div class="sl-statsub">' + (all.priced
					? "across " + all.priced + " priced" +
						(all.booked - all.priced > 0 ? " · " + (all.booked - all.priced) + " unpriced" : "")
					: "no prices yet") + "</div></div>" +
			'<div class="sl-stat"><div class="sl-statnum' + (state.showMoney ? "" : " sl-mask") + '">' +
					(noShow.value ? (cash(noShow.value) || "—") : "—") + '</div>' +
				'<div class="sl-statlab">Missed value</div>' +
				'<div class="sl-statsub">' + (noShow.value
					? all.a_noshow + " missed at your average"
					: all.a_noshow ? "no prices to value them at" : "none missed") +
				"</div></div>" +
			"</div>" +
			(tests
				? '<div class="sl-privrow"><span>' + tests + " test " + (tests === 1 ? "ticket is" : "tickets are") +
					' left out of everything below. <span class="sl-lock">They stay in your log.</span></span></div>'
				: "") +
			'<div class="sl-panels">' +
				panel("observations", observationsCard(rows, all), "insights") +
				/* Second, because a reading you can act on is worth more than
				   the next reading.

				   It reads the whole log rather than the tour in scope. How
				   you work is not a per-tour question, and on a four-day tour
				   almost nothing clears the thresholds — the panel would be
				   empty on exactly the screen people open most. */
				panel("coach", coachingCard(whole, tally(whole)), "insights") +
				panel("why", reasonsCard(rows, all), "insights") +
				panel("correlations", correlationCard(rows, all), "insights") +
				/* The chart is the one panel that deliberately looks outside
				   the scope: a single tour against the tours around it is the
				   comparison, and it would have nothing to compare against if
				   it were cut to the scope like everything else. */
				panel("chart", chart(periods, byTour ? "Kept, tour by tour" : "Kept against no show", byTour), "insights") +
				panel("party", partyCard(partyRows(rows), all.n, "me"), "insights") +
				panel("segments", segmentTable(segmentsOf(rows), all.n), "insights") +
				panel("limo", limoCard(rows, whole, tour), "insights") +
			"</div>";
	}

	function renderHouse() {
		if (!D.canHouse) {
			return '<div class="sl-empty"><strong>Not available on your account</strong>The house-wide view is limited to accounts with that permission.</div>';
		}
		if (!state.house) {
			return '<div class="sl-skeleton">' +
				'<div class="sl-skelstrip">' +
					'<div class="sl-skelcell"></div><div class="sl-skelcell"></div>' +
					'<div class="sl-skelcell"></div><div class="sl-skelcell"></div>' +
				"</div>" +
				'<div class="sl-skelcard"></div>' +
				'<div class="sl-skelduo"><div class="sl-skelcard"></div><div class="sl-skelcard"></div></div>' +
				'<p class="sl-fn" style="text-align:center">Gathering everyone\'s totals…</p>' +
				"</div>";
		}

		var h = state.house, t = withRates(h.totals);
		var refreshing = state.houseLoading ? ' class="sl-refreshing"' : "";
		var groupNoShow = noShowValue([], t, h.prices);
		if (!t.n) {
			return '<div class="sl-empty"><strong>Nothing logged by anyone yet</strong>Once tickets start coming in, the house-wide view builds itself.</div>';
		}

		// Runs are personal, so the pooled view stays on days.
		var weeks = houseWeeks(h.byDay.map(withRates));

		/* The segment table already lists every party type, so the ranked card
		   and the table would otherwise say the same thing twice. The card
		   keeps the party types; the table keeps everything else. */
		var partyLabels = {};
		Object.keys(PARTY).forEach(function (k) { partyLabels[PARTY[k]] = true; });
		var otherSegments = (h.segments || []).filter(function (seg) { return !partyLabels[seg.name]; });

		var now = weeks[weeks.length - 1];
		var weekNoShow = noShowValue([], now, h.prices);

		/* The floor reads this tab to know how the week is going. All-time
		   totals across months of tickets answer a different question, and
		   when they led the page they were the first thing read and the
		   least useful — so the week leads and everything ever logged sits
		   in a section of its own further down. */
		return '<div' + refreshing + '>' + '<p class="sl-scope">The week in progress</p>' +
			(h.showAmounts
				? moneyRow("This week's average covers the " + now.priced + " " +
					(now.priced === 1 ? "booking" : "bookings") + " priced in the open.")
				: '<div class="sl-privrow"><span>Pooled prices are switched off for this site. <span class="sl-lock">Rates and counts still include every ticket.</span></span></div>') +
			currentWeekCard(weeks) +
			'<div class="sl-stats" data-cols="3">' +
				'<div class="sl-stat"><div class="sl-statnum">' +
						(now.req + now.lineup + now.bar + now.pull) + '</div><div class="sl-statlab">Walk-ins this week</div>' +
					'<div class="sl-statsub">' + now.req + " req · " + now.lineup + " line · " + now.bar +
						" bar · " + now.pull + " pull<span class=\"sl-sublab\">" + now.appt + " booked ahead</span></div></div>" +
				'<div class="sl-stat"><div class="sl-statnum' + (state.showMoney ? "" : " sl-mask") + '">' +
						(weekNoShow.value ? (cash(weekNoShow.value) || "—") : "—") + '</div>' +
					'<div class="sl-statlab">Missed this week</div>' +
					'<div class="sl-statsub">' + (weekNoShow.value
						? now.a_noshow + " missed at the group average"
						: now.a_noshow ? "no shared prices to value them at" : "no appointments missed") + "</div></div>" +
				'<div class="sl-stat"><div class="sl-statnum">' + (now.n - now.decided) + '</div>' +
					'<div class="sl-statlab">Still open</div>' +
					'<div class="sl-statsub">' + now.booked + " booked · " + now.notbooked + " not</div></div>" +
			"</div>" +
			/* Its own group: the weeks sit above the Overall section and its
			   panels, and sharing a group with them meant opening one of
			   those silently closed the weeks halfway up the page. */
			'<div class="sl-panels">' +
				panel("weeks", houseWeekCard(weeks, t), "weeks") +
			"</div>" +
			houseOverall(h, t, groupNoShow, otherSegments) +
			"</div>";
	}

	/**
	 * Everything the floor has ever logged, underneath the week.
	 *
	 * Kept as its own section rather than another panel: the figures here
	 * are a different kind of thing from the week above them, and the
	 * patterns that follow are all drawn from this range rather than from
	 * the week, so they belong beneath this heading and not above it.
	 */
	function houseOverall(h, t, groupNoShow, otherSegments) {
		return '<section class="sl-overall">' +
			'<div class="sl-pasthead">' +
				'<p class="sl-eyebrow">Overall</p>' +
				'<span class="sl-weekrange">Everything the floor has logged</span>' +
			"</div>" +
			'<div class="sl-stats" data-cols="5">' +
			'<div class="sl-stat"><div class="sl-statnum">' + t.n + '</div><div class="sl-statlab">Tickets</div><div class="sl-statsub">' + t.appt + " appt · " + t.req + " req · " + t.lineup + " line · " + t.bar + " bar · " + t.pull + " pull</div></div>" +
			'<div class="sl-stat"><div class="sl-statnum sl-pos">' + pct(t.a_showed, t.aMarked) + '</div><div class="sl-statlab">Appt show rate</div><div class="sl-statsub">' + t.a_showed + " of " + t.aMarked + " appts</div></div>" +
			'<div class="sl-stat"><div class="sl-statnum">' + pct(t.booked, t.decided) + '</div><div class="sl-statlab">Book rate</div><div class="sl-statsub">' + t.booked + " of " + t.decided + " decided</div></div>" +
			'<div class="sl-stat"><div class="sl-statnum' + (state.showMoney ? "" : " sl-mask") + '">' +
					(groupNoShow.value ? (cash(groupNoShow.value) || "—") : "—") + '</div>' +
				'<div class="sl-statlab">Potential no-show value</div>' +
				'<div class="sl-statsub">' + (groupNoShow.value
					? t.a_noshow + " missed at the " + (cash(groupNoShow.avg) || "—") + " group average" +
					  (groupNoShow.low ? '<span class="sl-sublab">likely ' + cash(groupNoShow.low) + " – " + cash(groupNoShow.high) + "</span>" : "")
					: t.a_noshow ? "no shared prices to value them at" : "no appointments missed") +
				"</div></div>" +
			'<div class="sl-stat"><div class="sl-statnum' + (state.showMoney ? "" : " sl-mask") + '">' +
					(h.showAmounts && h.prices && h.prices.n ? (cash(h.prices.trimmed) || "—") : "—") + '</div>' +
				'<div class="sl-statlab">Average party</div>' +
				'<div class="sl-statsub">' +
					(h.showAmounts && h.prices && h.prices.n
						? "across " + h.prices.n + " shared " + (h.prices.n === 1 ? "price" : "prices") +
						  '<span class="sl-sublab">' +
						  (h.prices.trimmedFrom
							? "trimmed average · " + h.prices.trimmedFrom + " outliers set aside"
							: "average of every shared price") + "</span>"
						: h.showAmounts ? "no prices shared yet" : "prices switched off") +
				"</div></div>" +
			"</div>" +
			(h.showAmounts ? moneyRow("Averages cover only the " + t.priced + " bookings whose price was shared with everyone.", true) : "") +
			'<div class="sl-panels">' +
				panel("group", groupInsightCard(h), "all") +
				panel("party", partyCard(housePartyRows(h), t.n, "house"), "all") +
				panel("limo", houseLimoCard(h), "all") +
				(otherSegments.length ? panel("segments", segmentTable(otherSegments.map(withRates), t.n, "house"), "all") : "") +
			"</div>" +
			"</section>";
	}

	/**
	 * One card carrying the last four Wednesday-to-Wednesday weeks: the bars
	 * for shape, the figures beneath them for detail. Previously this was a
	 * chart and a fourteen-row day table saying the same thing.
	 */
	/* ==================================================================
	   Group insights
	   Findings that only exist because everyone's tickets sit together —
	   things no single log could tell you. Kept to one line each.
	   ================================================================== */

	var DOW_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

	function hourLabel(h) {
		var ap = h >= 12 ? "pm" : "am";
		var hr = h % 12 === 0 ? 12 : h % 12;
		return hr + ap;
	}

	function groupInsights(h) {
		var t = withRates(h.totals);
		var p = h.prices || { n: 0 };
		var out = [];

		/* Where most parties actually land. A range is more use than an
		   average when you are deciding what to quote. */
		if (p.n >= 8) {
			out.push({
				label: "The usual range",
				move: "Quote inside this range and you are in line with the floor. If your own range on My insights sits below it, your prices have room to rise.",
				value: cash(p.p25) + " – " + cash(p.p75),
				note: "Half of all shared prices land here. Midpoint " + cash(p.median) + ".",
				money: true,
			});
		}

		/* How concentrated the money is. If a tenth of parties carry
		   half the money, the floor is living on its big nights. */
		if (p.n >= 10 && p.topShare) {
			out.push({
				label: "Where the money is",
				move: "A few large parties carry the floor. When a guest signals a big night, give him the time — one of those is worth several ordinary bookings.",
				value: Math.round(p.topShare * 100) + "%",
				note: "of all the money booked comes from the biggest tenth of parties.",
				money: true,
			});
		}

		/* A party type that earns out of proportion to how often it comes
		   up is the most actionable thing in here. */
		if (t.amount > 0 && t.n > 0) {
			var partyNames = {};
			Object.keys(PARTY).forEach(function (k) { partyNames[PARTY[k]] = true; });
			var lopsided = (h.segments || [])
				.filter(function (seg) { return partyNames[seg.name] && seg.n >= 4 && seg.amount > 0; })
				.map(function (seg) {
					return { name: seg.name, vol: seg.n / t.n, rev: seg.amount / t.amount };
				})
				.sort(function (a, b) { return (b.rev - b.vol) - (a.rev - a.vol); })[0];

			if (lopsided && lopsided.rev - lopsided.vol >= 0.05) {
				out.push({
					label: "Most profitable",
				move: "If you offer " + lopsided.name + ", bring it up early in the conversation. If you do not, it is the type most worth adding to what you offer.",
					value: lopsided.name,
					note: Math.round(lopsided.vol * 100) + "% of the tickets but " + Math.round(lopsided.rev * 100) + "% of the money.",
					money: true,
				});
			}
		}

		/* Volume and money often peak at different hours, which is the
		   sort of thing nobody notices from their own log alone. */
		var hours = (h.byHour || []).map(withRates).filter(function (r) { return r.n >= 3; });
		if (hours.length >= 3) {
			var busiest = hours.slice().sort(function (a, b) { return b.n - a.n; })[0];
			var richest = hours.slice().filter(function (r) { return r.priced >= 3; })
				.sort(function (a, b) { return (b.amount / b.priced) - (a.amount / a.priced); })[0];

			if (richest && busiest && richest.hour !== busiest.hour) {
				out.push({
					label: "Busiest against best paid",
				move: "If you can only be on the floor for part of the night, choose the best-paid hour over the busiest one: fewer guests, more from each.",
					value: hourLabel(busiest.hour) + " vs " + hourLabel(richest.hour),
					note: hourLabel(busiest.hour) + " brings the most tickets; " + hourLabel(richest.hour) +
						" brings the highest average at " + cash(richest.amount / richest.priced) + ".",
					money: true,
				});
			}
		}

		/* Which night converts, rather than which night is busy. */
		var days = (h.byDow || []).map(withRates).filter(function (r) { return r.decided >= 5; });
		if (days.length >= 3) {
			var best = days.slice().sort(function (a, b) { return pctNum(b.booked, b.decided) - pctNum(a.booked, a.decided); })[0];
			var worst = days.slice().sort(function (a, b) { return pctNum(a.booked, a.decided) - pctNum(b.booked, b.decided); })[0];
			if (best.dow !== worst.dow && pctNum(best.booked, best.decided) - pctNum(worst.booked, worst.decided) >= 10) {
				out.push({
					label: "The night that closes",
				move: "Guests on that night arrive readier to book. If you choose which nights to work, start with it — and hold your price when you do.",
					value: DOW_NAME[best.dow],
					note: pct(best.booked, best.decided) + " book, against " + pct(worst.booked, worst.decided) +
						" on " + DOW_NAME[worst.dow] + ".",
				});
			}
		}

		/* Where the no-shows fall. Knowing the day is worth more than
		   knowing the rate. */
		var apptDays = (h.byDow || []).map(withRates).filter(function (r) { return r.aMarked >= 4; });
		if (apptDays.length >= 3) {
			var flaky = apptDays.slice().sort(function (a, b) { return pctNum(b.a_noshow, b.aMarked) - pctNum(a.a_noshow, a.aMarked); })[0];
			if (pctNum(flaky.a_noshow, flaky.aMarked) >= 25) {
				out.push({
					label: "Where no-shows land",
				move: "Confirm that night's appointments earlier in the day, and be ready to take a walk-in when one does not arrive.",
					value: DOW_NAME[flaky.dow],
					note: pct(flaky.a_noshow, flaky.aMarked) + " of that day's appointments do not arrive.",
				});
			}
		}


		/* How often a request closes, against an appointment. Two very
		   different conversations, and the gap is worth knowing. */
		var segByName = {};
		(h.segments || []).forEach(function (seg) { segByName[seg.name] = withRates(seg); });
		var reqSeg = segByName["Requests / walk-ins"];
		var apptSeg = segByName["Appointments"];
		if (reqSeg && reqSeg.decided >= 5) {
			var note = "of decided requests book.";
			if (apptSeg && apptSeg.decided >= 5) {
				var gap = Math.round(pctNum(reqSeg.booked, reqSeg.decided) - pctNum(apptSeg.booked, apptSeg.decided));
				note = pct(reqSeg.booked, reqSeg.decided) + " of requests book, against " +
					pct(apptSeg.booked, apptSeg.decided) + " of appointments" +
					(Math.abs(gap) >= 5 ? " — " + Math.abs(gap) + " points " + (gap > 0 ? "better" : "worse") + "." : ".");
			}
			out.push({
				label: "Requests booked",
				move: "A request books often enough to deserve the same care as an appointment. Do not treat a walk-in as a long shot.",
				value: pct(reqSeg.booked, reqSeg.decided),
				note: note,
			});
		}

		/* How much of the floor's work is people coming back. */
		var known = t.g_new + t.g_ret + t.g_house;
		if (known >= 12) {
			var repeat = t.g_ret + t.g_house;
			out.push({
				label: "Repeat business",
				move: "Much of the floor's work is guests coming back. Giving a guest a reason to return, before he leaves, is the cheapest booking you will ever get.",
				value: Math.round((repeat / known) * 100) + "%",
				note: "of tickets with a history recorded are guests who had been before.",
			});
		}

		/* How complete the shared picture is. Not a takings figure — a
		   measure of how much of the group view rests on real prices. */
		if (t.booked >= 10) {
			out.push({
				label: "Prices shared",
				move: "Every average on this tab is only as good as the prices behind it. Sharing yours makes the figure you measure yourself against more accurate.",
				value: pct(t.priced, t.booked),
				note: t.priced + " of " + t.booked + " booked parties have a price everyone can see.",
			});
		}

		/* New guests as a share of the money against their share of tickets. */
		var newSeg = (h.segments || []).filter(function (seg) { return seg.name === "New guests"; })[0];
		if (newSeg && newSeg.n >= 5 && t.amount > 0 && newSeg.amount > 0) {
			var volShare = Math.round((newSeg.n / t.n) * 100);
			var revShare = Math.round((newSeg.amount / t.amount) * 100);
			if (Math.abs(revShare - volShare) >= 8) {
				out.push({
					label: "New guests",
				move: revShare > volShare ? "A first-time guest is worth real effort here: do not hurry one to make room for a regular." : "Treat a first visit as the start of something: the money on this floor comes from the second and third visits, so make sure he knows how to ask for you.",
					value: volShare + "% of the tickets, " + revShare + "% of the money",
					note: revShare > volShare
						? "They pay more than their share of the tickets suggests, so a first visit is worth the effort."
						: "They pay less than their share of the tickets suggests. The money is in the ones who come back.",
					money: true,
				});
			}
		}

		/* How last week ran against the one before it, once both are real. */
		var gw = houseWeeks((h.byDay || []).map(withRates));
		if (gw.length === 4 && gw[2].n >= 5 && gw[1].n >= 5) {
			var lastW = gw[2], priorW = gw[1];
			var volMove = Math.round(((lastW.n - priorW.n) / priorW.n) * 100);
			var rateMove = (lastW.decided >= 5 && priorW.decided >= 5)
				? Math.round(pctNum(lastW.booked, lastW.decided) - pctNum(priorW.booked, priorW.decided)) : null;
			out.push({
				label: "Week over week",
				move: volMove >= 0 ? "The floor is busier than it was. A busy week is the time to hold your price, not to discount." : "The floor is quieter than it was. Expect more competition for each guest, and lean on returning guests and requests.",
				value: (volMove >= 0 ? "+" : "") + volMove + "% tickets",
				note: lastW.n + " against " + priorW.n + " the week before" +
					(rateMove !== null && Math.abs(rateMove) >= 3
						? ", with the book rate " + Math.abs(rateMove) + " points " + (rateMove > 0 ? "up" : "down") + "."
						: "."),
			});
		}

		/* Whether a room upstairs changes anything, across the floor. */
		var segBy = {};
		(h.segments || []).forEach(function (x) { segBy[x.name] = withRates(x); });
		var hg = segBy["Hotel guests"], ng = segBy["Not hotel guests"];

		if (hg && ng && hg.n && ng.n) {
			var hgShare = pctNum(hg.n, hg.n + ng.n);

			if (hg.decided >= 5 && ng.decided >= 5) {
				var hgBook = pctNum(hg.booked, hg.decided);
				var ngBook = pctNum(ng.booked, ng.decided);
				if (Math.abs(hgBook - ngBook) >= 8) {
					out.push({
						label: "A room upstairs",
				move: hgBook > ngBook ? "Ask early whether he is staying on the property. A guest with a room is the likelier booking, so he is worth your time first." : "A guest staying on the property is in no hurry and books less often. Give your first attention to the guest who travelled in.",
						value: (hgBook > ngBook ? "+" : "−") + Math.round(Math.abs(hgBook - ngBook)) + " points",
						note: "Hotel guests book at " + pct(hg.booked, hg.decided) + " across the floor, against " +
							pct(ng.booked, ng.decided) + " for guests arriving from elsewhere.",
					});
				}
			}

			if (hg.priced >= 4 && ng.priced >= 4) {
				var hgAvg = hg.amount / hg.priced;
				var ngAvg = ng.amount / ng.priced;
				if (ngAvg > 0 && (hgAvg / ngAvg >= 1.15 || ngAvg / hgAvg >= 1.15)) {
					out.push({
						label: "What a hotel guest spends",
				move: hgAvg > ngAvg ? "A guest with a room upstairs spends more. Offer him the longer party first rather than starting small." : "Guests who travel in spend more than those staying here. Offer them the longer party first.",
						value: cash(hgAvg) || "—",
						note: "against " + (cash(ngAvg) || "—") + " from guests not staying here, across " +
							hg.priced + " and " + ng.priced + " shared prices.",
						money: true,
					});
				}
			}

			if (hg.n + ng.n >= 20) {
				out.push({
					label: "Staying on the property",
				move: "Ask every guest whether he is staying here and record it. It is one tap, and it is what the two readings on hotel guests are built from.",
					value: Math.round(hgShare) + "%",
					note: "of the tickets where it was recorded are guests already staying here.",
				});
			}
		}

		/* How much of the floor's work lands on the weekend. */
		if ((h.byDow || []).length && t.n >= 20) {
			var wkndN = 0;
			(h.byDow || []).forEach(function (r) { if (r.dow === 5 || r.dow === 6) wkndN += r.n; });
			out.push({
				label: "The floor's weekend",
				move: "If your own weekend share is below this, you are missing the floor's busiest nights. If it is above, your weeknights are where there is room to grow.",
				value: pct(wkndN, t.n),
				note: "of everyone's tickets land on Friday and Saturday. The other five days carry the rest.",
			});
		}

		/* ==============================================================
		   3.28 — six further readings across the floor.
		   ============================================================== */
		var gRate = function (m) { return m && m.decided ? m.booked / m.decided : 0; };
		var segOf = {};
		(h.segments || []).forEach(function (x) { segOf[x.name] = withRates(x); });

		/* --- ten appointments, followed through --- */
		var apSeg = segOf["Appointments"];
		if (apSeg && t.aMarked >= 10 && apSeg.decided >= 8) {
			var gArrive = t.a_showed / t.aMarked, gBook = apSeg.booked / apSeg.decided;
			out.push({
				label: "Ten appointments",
				value: (10 * gArrive).toFixed(1) + " arrive, " + (10 * gArrive * gBook).toFixed(1) + " book",
				note: "Of every 10 appointments made across the floor. " + pct(t.a_showed, t.aMarked) + " are kept, and " +
					pct(apSeg.booked, apSeg.decided) + " of those go on to book.",
				move: (1 - gArrive) > (1 - gBook)
					? "More is lost before the guest arrives than after he does. Confirming the day before is worth more than a better pitch."
					: "Most appointments arrive; the bigger loss is in the room. The reasons written on not-booked tickets are the place to look.",
			});
		}

		/* --- who misses appointments --- */
		var gNew = segOf["New guests"];
		var back = [segOf["Returning to them"], segOf["New to them, house regular"]].filter(Boolean);
		var gRetA = back.reduce(function (a, x) { return a + x.aMarked; }, 0);
		var gRetX = back.reduce(function (a, x) { return a + x.a_noshow; }, 0);
		if (gNew && gNew.aMarked >= 8 && gRetA >= 8 && gNew.a_noshow >= 2 && gRetX >= 1) {
			var gRatio = (gNew.a_noshow / gNew.aMarked) / (gRetX / gRetA);
			if (gRatio >= 1.3) {
				out.push({
					label: "Who does not arrive",
					value: gRatio.toFixed(1) + "× as often",
					note: "New guests miss " + pct(gNew.a_noshow, gNew.aMarked) + " of their appointments, against " +
						pct(gRetX, gRetA) + " for guests who have been before.",
					move: "Ask a new guest to confirm on the day, and keep a walk-in in mind for his hour. A returning guest rarely needs the reminder.",
					how: "Compares the no-show rate on appointments for new guests with the rate for anyone who has been before, whether to the person logging or to the house. Each side needs eight marked appointments, and the higher rate must be at least 1.3 times the lower.",
				});
			}
		}

		/* --- which way in closes most often --- */
		var ways = [["Appointments", "appointment"], ["Requests / walk-ins", "request"], ["Picked from lineup", "lineup pick"],
			["Walk-in from bar", "bar walk-in"], ["Pull-ins", "pull-in"]].map(function (d) {
			return segOf[d[0]] && segOf[d[0]].decided >= 5 ? { name: d[1], m: segOf[d[0]] } : null;
		}).filter(Boolean).sort(function (a, b) { return gRate(b.m) - gRate(a.m); });
		if (ways.length >= 2 && gRate(ways[0].m) - gRate(ways[ways.length - 1].m) >= 0.08) {
			var wTop = ways[0], wLow = ways[ways.length - 1];
			out.push({
				label: "Which way in closes",
				value: "The " + wTop.name,
				note: pct(wTop.m.booked, wTop.m.decided) + " of them book, against " + pct(wLow.m.booked, wLow.m.decided) + " for a " + wLow.name + ".",
				move: "When two guests want your time at once, the " + wTop.name + " is the likelier booking. A " + wLow.name +
					" needs more from you: lead with one clear offer rather than a list.",
			});
		}

		/* --- limo against driving themselves --- */
		var gLimo = segOf["Limo"], gSelf = segOf["Self drive"];
		if (gLimo && gSelf && gLimo.decided >= 5 && gSelf.decided >= 5 && Math.abs(gRate(gLimo) - gRate(gSelf)) >= 0.08) {
			var limoUp = gRate(gLimo) > gRate(gSelf);
			out.push({
				label: "Limo or own car",
				value: (limoUp ? "Limo" : "Own car") + " books more",
				note: pct(gLimo.booked, gLimo.decided) + " of limo guests book across the floor, against " +
					pct(gSelf.booked, gSelf.decided) + " of guests who drive themselves.",
				move: limoUp
					? "Offer the limo when a guest books ahead. Set what it costs you (Limo money) against how much more often he books."
					: "A guest who drives himself books at least as often and costs you no limo cut. There is no need to push the limo to close.",
			});
		}

		/* --- the hour that closes --- */
		var closers = (h.byHour || []).map(withRates).filter(function (r) { return r.decided >= 8; })
			.sort(function (a, b) { return gRate(b) - gRate(a); });
		if (closers.length >= 3 && t.decided && gRate(closers[0]) - t.booked / t.decided >= 0.08) {
			out.push({
				label: "The hour that closes",
				value: hourLabel(closers[0].hour),
				note: pct(closers[0].booked, closers[0].decided) + " of guests logged in that hour book, against " +
					pct(t.booked, t.decided) + " across the whole night.",
				move: "If you are choosing when to be on the floor, be there by " + hourLabel(closers[0].hour) +
					". Guests at that hour have usually already decided to book.",
			});
		}

		/* --- has the share of new faces moved --- */
		var cutA = isoDate(addDays(new Date(), -14)), cutB = isoDate(addDays(new Date(), -28));
		var recent = { n: 0, k: 0 }, prior = { n: 0, k: 0 };
		(h.byDay || []).forEach(function (r) {
			var into = r.date > cutA ? recent : r.date > cutB ? prior : null;
			if (!into) return;
			into.n += r.g_new; into.k += r.g_new + r.g_ret + r.g_house;
		});
		if (recent.k >= 15 && prior.k >= 15) {
			var nowShare = recent.n / recent.k, thenShare = prior.n / prior.k;
			if (Math.abs(nowShare - thenShare) >= 0.06) {
				out.push({
					label: "New faces",
					value: Math.round(thenShare * 100) + "% → " + Math.round(nowShare * 100) + "%",
					note: "New guests as a share of the floor's tickets: the last two weeks against the two before.",
					move: nowShare > thenShare
						? "More first-timers are coming through. They miss more appointments and need more explaining, so allow time for both."
						: "Fewer new faces are coming through. This is when your returning guests matter most — a message to a regular is worth sending.",
				});
			}
		}

		// The readings a person can act on soonest lead; the rest keep their order.
		var LEAD = ["Ten appointments", "The usual range", "Which way in closes", "Who does not arrive", "The hour that closes"];
		out = out.map(function (o, at) { o.at = at; return o; }).sort(function (a, b) {
			var ia = LEAD.indexOf(a.label), ib = LEAD.indexOf(b.label);
			return ((ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)) || (a.at - b.at);
		});

		return out.slice(0, 21);
	}

	function groupInsightCard(h) {
		var found = groupInsights(h);
		if (!found.length) {
			return '<section class="sl-card"><p class="sl-eyebrow">Group insights</p>' +
				'<div class="sl-empty">Not enough logged between everyone yet. These appear as the floor builds up a few weeks of tickets.</div></section>';
		}

		var slides = found.map(function (f) {
			var masked = f.money && !state.showMoney;
			var how = f.how || HOW[f.label];
			return '<div class="sl-giitem sl-gislide' + (how ? " sl-explains" : "") + '"' +
					(how ? ' tabindex="0"' : "") + ">" +
				'<span class="sl-gilabel">' + esc(f.label) + "</span>" +
				'<span class="sl-givalue' + (masked ? " sl-mask" : "") + '">' + esc(f.value) + "</span>" +
				'<span class="sl-ginote' + (masked ? " sl-mask" : "") + '">' + esc(f.note) + "</span>" +
				(f.move ? '<div class="sl-moves sl-gimove"><p class="sl-moveslab">What to do with this</p>' +
					'<p class="sl-gimovetext">' + esc(f.move) + "</p></div>" : "") +
				(how ? '<p class="sl-how"><span class="sl-howlab">How this is worked out</span>' + esc(how) + "</p>" : "") +
				"</div>";
		});

		return '<section class="sl-card"><p class="sl-eyebrow">Group insights</p>' +
			carousel("group", slides) +
			'<p class="sl-fn">' + found.length + (found.length === 1 ? " finding" : " findings") +
			', drawn from everyone\'s tickets together and only where enough exist to mean something. Move through them with the arrows; hover or tab onto one to see how it was worked out. Nothing here can be traced to a person.</p>' +
			"</section>";
	}

	/**
	 * The week in progress, given the top of the page.
	 *
	 * This is the figure people are actually working against, so it leads
	 * rather than sitting inside a table of four. Last week's finished
	 * numbers run underneath for something to measure against — a Tuesday
	 * means nothing without knowing where the last Tuesday ended up.
	 */
	function currentWeekCard(weeks) {
		var now = weeks[weeks.length - 1];
		var prior = weeks.length > 1 ? weeks[weeks.length - 2] : null;

		var elapsed = Math.min(7, daysBetween(now.start, isoDate(new Date())) + 1);
		var avg = now.priced ? now.amount / now.priced : 0;
		var priorAvg = prior && prior.priced ? prior.amount / prior.priced : 0;

		var compare = "";
		if (prior && prior.n) {
			var bits = [prior.n + " tickets", prior.booked + " parties"];
			if (priorAvg) bits.push((state.showMoney ? (money(priorAvg) || "—") : "$•••") + " average");
			compare = "Last week finished with " + bits.join(", ") + ".";
		}

		return '<section class="sl-card sl-feature"><div class="sl-cardhead">' +
				'<p class="sl-eyebrow">This week</p>' +
				'<span class="sl-weekrange">' + esc(weekLabel(now)) + " · day " + elapsed + " of 7</span>" +
			"</div>" +
			'<div class="sl-stats" data-cols="5" style="margin-bottom:0">' +
				'<div class="sl-stat"><div class="sl-statnum">' + now.n + '</div><div class="sl-statlab">Tickets</div>' +
					'<div class="sl-statsub">' + (elapsed ? (now.n / elapsed).toFixed(1) + " a day so far" : "—") + "</div></div>" +
				'<div class="sl-stat"><div class="sl-statnum">' + now.booked + '</div><div class="sl-statlab">Parties</div>' +
					'<div class="sl-statsub">' + pct(now.booked, now.decided) + " of decided</div></div>" +
				'<div class="sl-stat"><div class="sl-statnum ' + (now.aMarked ? "sl-pos" : "sl-dim") + '">' + pct(now.a_showed, now.aMarked) + '</div>' +
					'<div class="sl-statlab">Appt show rate</div>' +
					'<div class="sl-statsub">' + (now.aMarked ? now.a_showed + " of " + now.aMarked + " appts" : "no appointments") + "</div></div>" +
				'<div class="sl-stat"><div class="sl-statnum' + (state.showMoney ? "" : " sl-mask") + '">' +
						(now.priced ? (cash(avg) || "—") : "—") + '</div><div class="sl-statlab">Average party</div>' +
					'<div class="sl-statsub">' + (now.priced
						? "across " + now.priced + " priced"
						+ (priorAvg ? '<span class="sl-sublab">' + (avg >= priorAvg ? "up from " : "down from ") + (state.showMoney ? money(priorAvg) : "$•••") + " last week</span>" : "")
						: "no prices shared yet") + "</div></div>" +
				'<div class="sl-stat"><div class="sl-statnum' + (state.showMoney ? "" : " sl-mask") + '">' +
						(now.amount ? (cash(now.amount) || "—") : "—") + '</div><div class="sl-statlab">Booked so far</div>' +
					'<div class="sl-statsub">' + (prior && prior.amount
						? "last week " + (state.showMoney ? (money(prior.amount) || "—") : "$•••")
						: "the week is still filling") + "</div></div>" +
			"</div>" +
			(compare ? '<p class="sl-fn">' + esc(compare) + " Weeks run Wednesday to Wednesday.</p>" : "") +
			"</section>";
	}

	function houseWeekCard(weeks, totals) {
		var peak = Math.max.apply(null, [1].concat(weeks.map(function (w) { return w.n; })));

		var bars = weeks.map(function (w) {
			var part = function (v) { return w.n ? (v / w.n) * 100 : 0; };
			return '<div class="sl-col' + (w.current ? " is-current" : "") + '" title="' +
					esc(w.full + ": " + w.n + " tickets · " + w.a_showed + " of " + w.aMarked + " appointments kept") + '">' +
				'<div class="sl-colrate">' + (w.n || "") + "</div>" +
				'<div class="sl-coltrack" style="height:' + (w.n / peak) * 100 + '%">' +
					'<div class="sl-colpart" data-part="unmarked" style="height:' + part(w.n - w.marked) + '%"></div>' +
					'<div class="sl-colpart" data-part="noshow" style="height:' + part(w.noshow) + '%"></div>' +
					'<div class="sl-colpart" data-part="showed" style="height:' + part(w.showed) + '%"></div>' +
				"</div></div>";
		}).join("");

		var rows = weeks.slice().reverse().map(function (w) {
			return "<tr><td>" + esc(weekLabel(w)) + (w.current ? '<span class="sl-sublab">in progress</span>' : "") + "</td>" +
				"<td>" + (w.n || '<span class="sl-dim">0</span>') + "</td>" +
				'<td class="' + (w.aMarked ? "sl-pos" : "sl-dim") + '">' + pct(w.a_showed, w.aMarked) +
					'<span class="sl-sublab">' + (w.a_noshow ? w.a_noshow + " missed" : w.aMarked ? "all kept" : "no appts") + "</span></td>" +
				'<td class="' + (w.decided ? "" : "sl-dim") + '">' + pct(w.booked, w.decided) + "</td>" +
				'<td class="' + (state.showMoney ? "" : "sl-mask") + '">' +
					(w.priced ? (cash(w.amount / w.priced) || '<span class="sl-dim">—</span>') +
						'<span class="sl-sublab">' + w.priced + " priced</span>" : '<span class="sl-dim">—</span>') + "</td>" +
				'<td class="' + (state.showMoney ? "" : "sl-mask") + '">' +
					// The week's total sits at the end of its row, once the
					// week has something in it.
					(w.n ? (cash(w.amount) || '<span class="sl-dim">—</span>') : '<span class="sl-dim">—</span>') +
					(w.current && w.n ? '<span class="sl-sublab">so far</span>' : "") + "</td></tr>";
		}).join("");

		return '<section class="sl-card"><div class="sl-cardhead">' +
				'<p class="sl-eyebrow">The weeks before</p>' +
				'<span class="sl-weekrange">Wednesday to Wednesday</span>' +
			"</div>" +
			'<div class="sl-chart">' + bars + "</div>" +
			'<div class="sl-xaxis">' + weeks.map(function (w) { return '<div class="sl-xlab">' + esc(w.label) + "</div>"; }).join("") + "</div>" +
			'<div class="sl-keys" style="margin-top:16px">' +
				'<span class="sl-key"><span class="sl-swatch" data-tone="pos"></span>Kept</span>' +
				'<span class="sl-key"><span class="sl-swatch" data-tone="caution"></span>No show</span>' +
				'<span class="sl-key"><span class="sl-swatch" data-tone="muted"></span>Not marked</span>' +
			"</div>" +
			'<div class="sl-scroll" style="margin-top:22px"><table class="sl-table"><thead><tr>' +
				"<th>Week</th><th>Tickets</th><th>Appt show rate</th><th>Book rate</th><th>Average party</th><th>Week total</th>" +
			"</tr></thead><tbody>" + rows + "</tbody></table></div>" +
			'<p class="sl-fn">Bar height and the figure above it are ticket volume, split by how the appointments went. Rates and money are in the table. Weeks run Wednesday morning to Wednesday night; the current one is still filling.</p>' +
			"</section>";
	}

	/* ---------------- shell ---------------- */
	/* The seal. Mirrors includes/logo.php — keep the two in step. */
	/* A single-hue metal gradient: highlight, midtone, shadow, and a specular
	   band. It is what makes the seal read as struck gold rather than drawn
	   in yellow. */
	/**
	 * The gradients and filters the seal is struck from.
	 *
	 * Gold is not one colour: it is a highlight, a midtone, a shadow and a
	 * specular band, and it is the *order* of those that makes a surface read
	 * as metal rather than as yellow. Rendered once per page and referenced
	 * by id, so the mark can appear at any size without redefining them.
	 */
	function metalDefs() {
		return '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' +
			/* The face of the metal, lit from the top left. */
			'<linearGradient id="slMetal" x1="0" y1="0" x2="1" y2="1">' +
				'<stop offset="0%" stop-color="#fdf3d6"/>' +
				'<stop offset="14%" stop-color="#e3c374"/>' +
				'<stop offset="30%" stop-color="#a97c1c"/>' +
				'<stop offset="46%" stop-color="#f6e6ae"/>' +
				'<stop offset="58%" stop-color="#d9b64f"/>' +
				'<stop offset="74%" stop-color="#8a6318"/>' +
				'<stop offset="88%" stop-color="#c9a227"/>' +
				'<stop offset="100%" stop-color="#f0dc9a"/>' +
			"</linearGradient>" +

			/* The rim, lit from the opposite side so the edge reads as raised
			   rather than painted on. */
			'<linearGradient id="slRim" x1="1" y1="0" x2="0" y2="1">' +
				'<stop offset="0%" stop-color="#f7e7b8"/>' +
				'<stop offset="35%" stop-color="#8a6318"/>' +
				'<stop offset="62%" stop-color="#e3c374"/>' +
				'<stop offset="100%" stop-color="#6f4e11"/>' +
			"</linearGradient>" +

			/* The recess the letter sits in. */
			'<radialGradient id="slWell" cx="34%" cy="28%" r="78%">' +
				'<stop offset="0%" stop-color="#2a2320"/>' +
				'<stop offset="55%" stop-color="#161312"/>' +
				'<stop offset="100%" stop-color="#0b0a0a"/>' +
			"</radialGradient>" +

			/* A single specular sweep, used for the shine that crosses on open. */
			'<linearGradient id="slShine" x1="0" y1="0" x2="1" y2="0">' +
				'<stop offset="0%" stop-color="#fff" stop-opacity="0"/>' +
				'<stop offset="45%" stop-color="#fff" stop-opacity=".55"/>' +
				'<stop offset="55%" stop-color="#fff" stop-opacity=".55"/>' +
				'<stop offset="100%" stop-color="#fff" stop-opacity="0"/>' +
			"</linearGradient>" +

			/* Softens the inner shadow so the disc looks sunk rather than drawn. */
			'<filter id="slSoft" x="-30%" y="-30%" width="160%" height="160%">' +
				'<feGaussianBlur stdDeviation="0.7"/>' +
			"</filter>" +

			/* The rate rings. A flat stroke reads as a coloured line; a
			   gradient along the arc reads as something lit, and the arc
			   brightens toward its leading end so the eye follows it round. */
			'<linearGradient id="slArcGood" x1="0" y1="1" x2="1" y2="0">' +
				'<stop offset="0%" stop-color="#0f8f62"/>' +
				'<stop offset="55%" stop-color="#16b37c"/>' +
				'<stop offset="100%" stop-color="#5fe0b0"/>' +
			"</linearGradient>" +
			'<linearGradient id="slArcPink" x1="0" y1="1" x2="1" y2="0">' +
				'<stop offset="0%" stop-color="#b83f61"/>' +
				'<stop offset="55%" stop-color="#e0567f"/>' +
				'<stop offset="100%" stop-color="#ff9dbb"/>' +
			"</linearGradient>" +
			'<linearGradient id="slArcGold" x1="0" y1="1" x2="1" y2="0">' +
				'<stop offset="0%" stop-color="#8a6318"/>' +
				'<stop offset="55%" stop-color="#c9a227"/>' +
				'<stop offset="100%" stop-color="#f7e7b8"/>' +
			"</linearGradient>" +
			"</defs></svg>";
	}

	/**
	 * The seal.
	 *
	 * Struck rather than drawn: a rim with its own light, a sunk face, a
	 * hairline of engraving inside the rim, the letter cut into the face with
	 * a shadow under it, and a specular arc across the top left. Mirrors
	 * includes/logo.php — keep the two in step.
	 *
	 * The inner parts are named sl-lm-* rather than sl-ring and the rest,
	 * because those names are also used by the rate rings on My insights and
	 * anything written against one was quietly styling the other.
	 */
	function logoMark(size, animate) {
		var S = 'M30.4 16.1C30.4 11.2 18.6 11.3 18.6 17.6C18.6 22.9 29.4 23.5 29.4 29.4C29.4 35.6 17.6 35.6 17.6 30.5';

		return '<svg class="sl-logomark' + (animate ? " is-striking" : "") + '" width="' + size +
				'" height="' + size + '" viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">' +
			/* the rim */
			'<circle class="sl-lm-rim" cx="24" cy="24" r="22.4" stroke-width="1.6"/>' +
			'<circle class="sl-lm-rimlite" cx="24" cy="24" r="21.3" stroke-width="0.5"/>' +
			/* the sunk face */
			'<circle class="sl-lm-face" cx="24" cy="24" r="20.6"/>' +
			'<circle class="sl-lm-well" cx="24" cy="24" r="20.6" filter="url(#slSoft)" stroke-width="1.4"/>' +
			/* engraving inside the rim */
			'<circle class="sl-lm-line" cx="24" cy="24" r="17.6" stroke-width="0.45"/>' +
			/* the letter: a dark impression, then the metal on top of it */
			'<path class="sl-lm-cut" d="' + S + '" stroke-width="3.1" stroke-linecap="round" transform="translate(0 .9)"/>' +
			'<path class="sl-lm-letter" d="' + S + '" stroke-width="2.6" stroke-linecap="round"/>' +
			/* the light on the surface */
			'<path class="sl-lm-spec" d="M8.6 16.2A18 18 0 0 1 24 5.6" stroke-width="1.5" stroke-linecap="round"/>' +
			'<path class="sl-lm-shine" d="' + S + '" stroke-width="2.6" stroke-linecap="round"/>' +
			"</svg>";
	}

	/**
	 * Redraw only the form.
	 *
	 * Rebuilding the whole page on every field change threw away the control
	 * the person was using: focus was lost, the page jumped back to the top,
	 * and on a phone the native picker closed onto an element that no longer
	 * existed — which reads as the dropdown not working. Only the form is
	 * redrawn now, and focus is put back on the same field.
	 */
	function renderFormOnly() {
		var host = document.getElementById("sl-formhost");
		if (!host) return render();

		var active = document.activeElement;
		var keep = active && active.dataset ? active.dataset.field : null;

		host.innerHTML = renderForm();

		if (keep) {
			var again = host.querySelector('[data-field="' + keep + '"]');
			if (again && again.focus) again.focus();
		}
	}

	/** Fields that live on the form, and so only need the form redrawn. */
	var FORM_FIELDS = ["kind", "guest_type", "hotel_guest", "transport", "attendance", "outcome", "price_mode", "is_test"];

	function render() {
		var body = state.tab === "log" ? renderLog()
			: state.tab === "mine" ? renderMine()
			: state.tab === "past" ? renderPast()
			: renderHouse();

		/* Counted here rather than inside the tab, because an empty history
		   should leave the badge off entirely instead of showing a nought —
		   and counted as tours, so the badge agrees with the figure at the
		   top of the tab it opens. */
		var pastCount = pastScopes().filter(function (t) { return !t.loose; }).length;

		/* The sweep used to be a fixed layer over the whole page, so changing
		   tab washed light across the log, the form and everything else. It
		   belongs to the control that was pressed. */
		var swept = state.swept;
		state.swept = false;

		root.innerHTML = metalDefs() + '<div class="sl-wrap">' +
			'<header class="sl-top">' +
				'<div class="sl-logo">' +
					'<button type="button" class="sl-logobtn" data-act="adminopen" ' +
						'aria-label="Admin panel" title="Admin panel">' +
						logoMark(60, !state.struck) + "</button>" +
					'<div><p class="sl-wordmark">Shift <em>Log</em></p>' +
						'<p class="sl-tagline">Private log</p>' +
						'<p class="sl-build">Version A — Closed Beta</p></div>' +
				"</div>" +
				'<div class="sl-who">' +
					'<span class="sl-idchip"><span class="sl-dot"></span>' + esc(D.handle || "") + "</span>" +
					'<a class="sl-ghost" href="' + esc(D.accountUrl) + '">Account</a>' +
					'<a class="sl-ghost" href="' + esc(D.logoutUrl) + '">Sign out</a>' +
				"</div></header>" +
			'<div class="sl-tabs' + (swept ? " is-swept" : "") + '" role="tablist">' +
				'<button class="sl-tab" role="tab" data-tab="log" aria-selected="' + (state.tab === "log") + '">My log<span class="sl-tabcount">' + state.tickets.length + "</span></button>" +
				'<button class="sl-tab" role="tab" data-tab="mine" aria-selected="' + (state.tab === "mine") + '">My insights</button>' +
				(D.canHouse ? '<button class="sl-tab" role="tab" data-tab="all" aria-selected="' + (state.tab === "all") + '">Everyone</button>' : "") +
				'<button class="sl-tab" role="tab" data-tab="past" aria-selected="' + (state.tab === "past") + '">Past tours' +
					(pastCount ? '<span class="sl-tabcount">' + pastCount + "</span>" : "") + "</button>" +
			"</div>" + body + "</div>";

		sizeLogWindow();
		showCurrentTab();
		playHeadline();
		playTourBox();

		if (!state.struck) {
			state.struck = true;
			/* Remembered for the session, so moving between pages of the site
			   does not restamp it each time. A new session — a new day, a new
			   tab — earns the entrance again. */
			try { window.sessionStorage.setItem("sl_struck", "1"); } catch (e) {}
			var mark = root.querySelector(".sl-logomark.is-striking");
			/* Left on long enough for the animation to finish, then taken off
			   so nothing is mid-transform if the element is reused. */
			if (mark) setTimeout(function () { mark.classList.remove("is-striking"); }, 2600);
		}
	}

	/**
	 * Make the log end level with the form beside it.
	 *
	 * Nothing on this page follows the scroll, so a log pane cut to the height
	 * of the screen leaves a tall gap under it while the form runs on. The
	 * pane should instead fill its column exactly.
	 *
	 * CSS cannot work this out on its own: stretching the row to the form
	 * makes the pane's own content part of what sizes the row, so the pane
	 * grows, the row grows to match, and the log ends up as long as it ever
	 * was. Measuring breaks the loop — the form's height does not depend on
	 * the pane, so it is a fixed number to work back from.
	 */
	/**
	 * Keep the tab you are on inside the tab row.
	 *
	 * With four tabs the row scrolls sideways on a phone, and the last one
	 * sits half off the edge — so pressing it moved to a tab you could then
	 * only half see. The row is scrolled, never the page: scrollIntoView
	 * would drag the whole document along with it.
	 */
	function showCurrentTab() {
		var bar = root.querySelector(".sl-tabs");
		if (!bar) return;
		var on = bar.querySelector('.sl-tab[aria-selected="true"]');
		if (!on || bar.scrollWidth <= bar.clientWidth) return;

		var left = on.offsetLeft;
		var right = left + on.offsetWidth;
		var pad = 10;

		if (right > bar.scrollLeft + bar.clientWidth) {
			bar.scrollLeft = right - bar.clientWidth + pad;
		} else if (left < bar.scrollLeft) {
			bar.scrollLeft = Math.max(0, left - pad);
		}
	}

	function sizeLogWindow() {
		var box = root.querySelector(".sl-logscroll");
		if (!box) return;

		if (window.innerWidth < 1100) {
			box.style.maxHeight = "";
			return;
		}

		var grid = root.querySelector(".sl-grid");
		if (!grid || grid.children.length < 2) return;

		var formCol = grid.children[0];
		var logCol = grid.children[1];

		/* Everything in the log column that is not the pane: the stats strip,
		   the amounts row, the footer. Whatever the form has beyond that is
		   what the pane may occupy. */
		var around = logCol.offsetHeight - box.offsetHeight;
		var target = formCol.offsetHeight - around;

		box.style.maxHeight = Math.max(320, target) + "px";
		syncLogFade();
	}

	/**
	 * The log window fades at whichever edge still has tickets past it, so a
	 * fade never sits over the last stub pretending there is more to come.
	 */
	function syncLogFade() {
		var box = root.querySelector(".sl-logscroll");
		if (!box) return;
		var wrap = box.parentNode;
		var slack = box.scrollHeight - box.clientHeight;
		wrap.classList.toggle("at-top", box.scrollTop <= 2);
		wrap.classList.toggle("at-end", slack <= 2 || box.scrollTop >= slack - 2);
	}

	/* ==================================================================
	   Saving a ticket — gilded light rather than confetti

	   The old celebration threw emoji across the screen. This one is drawn
	   on a canvas in the site's own metal and pink: a soft bloom out of the
	   save button, a hairline gold ring, motes of gold dust that rise and
	   twinkle, and — on the biggest nights — slow glints of light crossing
	   the dark, the way light catches a polished edge.

	   What the screen does still depends on the ticket:

	     no show            warm rose-gold embers, few and slow — the night
	                        still happened, and a guest not arriving is not
	                        the fault of the person logging it
	     booked  <  $5,000  gold dust out of the button
	     booked  $5k–$9,999 more of it, with a pair of glints
	     booked  $10,000 +  a full lift of gold, glints crossing the screen

	   Anything else gets a quiet shimmer. Everything respects
	   prefers-reduced-motion, scales with the screen, and removes itself.
	   ================================================================== */
	function toneFor(ticket) {
		if (!ticket) return "quiet";
		if (ticket.attendance === "noshow") return "warm";
		if (ticket.outcome === "booked") {
			var amount = num(ticket.amount);
			if (amount >= 10000) return "rich";
			if (amount >= 5000) return "good";
			return "money";
		}
		return "quiet";
	}

	var CELEBRATE_GOLD = ["#f7e7b8", "#e9cf8a", "#d9b64f", "#c9a227", "#a8842a"];
	var CELEBRATE_PINK = ["#e0567f", "#f0a2ba"];

	function celebrate(origin, ticket) {
		if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

		var tone = toneFor(ticket);
		var plans = {
			quiet: { motes: 30,  pink: 0.14, glints: 0, bloom: 0.55, lift: 0.9  },
			warm:  { motes: 44,  pink: 0.55, glints: 0, bloom: 0.7,  lift: 0.5  },
			money: { motes: 70,  pink: 0.18, glints: 0, bloom: 0.85, lift: 1    },
			good:  { motes: 100, pink: 0.26, glints: 2, bloom: 1,    lift: 1.1  },
			rich:  { motes: 150, pink: 0.3,  glints: 6, bloom: 1.2,  lift: 1.25 },
		};
		var plan = plans[tone] || plans.quiet;

		var W = window.innerWidth || 1200, H = window.innerHeight || 800;
		var scale = Math.max(0.4, Math.min(1, (W * H) / 1000000));
		var moteCount = Math.round(plan.motes * scale);
		var glintCount = plan.glints ? Math.max(1, Math.round(plan.glints * scale)) : 0;

		var r = origin && origin.getBoundingClientRect
			? origin.getBoundingClientRect()
			: { left: W / 2, top: H / 2, width: 0, height: 0 };
		var ox = r.left + r.width / 2, oy = r.top + r.height / 2;

		var canvas = document.createElement("canvas");
		canvas.className = "sl-halo";
		canvas.setAttribute("aria-hidden", "true");
		var dpr = Math.min(2, window.devicePixelRatio || 1);
		canvas.width = W * dpr; canvas.height = H * dpr;
		document.body.appendChild(canvas);
		var ctx = canvas.getContext("2d");
		ctx.scale(dpr, dpr);

		var rnd = Math.random;
		function pickFrom(list) { return list[Math.floor(rnd() * list.length)]; }

		/* Gold dust. Roughly half fountains out of the button; the rest,
		   on booked tickets, rises off the lower third of the screen so
		   the whole page catches the light rather than one corner. */
		var motes = [];
		for (var i = 0; i < moteCount; i++) {
			var fromButton = tone === "quiet" || tone === "warm" || rnd() < 0.55;
			var angle = rnd() * Math.PI * 2;
			var spread = rnd() * 60;
			motes.push({
				x: fromButton ? ox + Math.cos(angle) * spread : rnd() * W,
				y: fromButton ? oy + Math.sin(angle) * spread * 0.6 : H * (0.72 + rnd() * 0.28),
				vx: (rnd() - 0.5) * 24,
				vy: -(24 + rnd() * 58) * plan.lift,
				sway: 10 + rnd() * 26,
				freq: 0.6 + rnd() * 1.3,
				phase: rnd() * Math.PI * 2,
				size: 0.7 + rnd() * 1.9,
				born: rnd() * 900,
				life: 2200 + rnd() * 1800,
				color: rnd() < plan.pink ? pickFrom(CELEBRATE_PINK) : pickFrom(CELEBRATE_GOLD),
				tw: 2.2 + rnd() * 4.5,
			});
		}

		/* Glints: thin bands of light that drift across the dark. */
		var glints = [];
		for (var g = 0; g < glintCount; g++) {
			glints.push({
				x: rnd() * W, y: H * (0.12 + rnd() * 0.6),
				len: 90 + rnd() * 150,
				angle: -0.45 - rnd() * 0.25,
				vx: 26 + rnd() * 40,
				born: 300 + g * 320 + rnd() * 260,
				life: 1500 + rnd() * 900,
			});
		}

		var startAt = null, total = 4600;
		function frame(now) {
			if (startAt === null) startAt = now;
			var t = now - startAt;
			ctx.clearRect(0, 0, W, H);

			/* the bloom and the ring, out of the button */
			var bt = Math.min(1, t / 1500);
			if (bt < 1) {
				var ease = 1 - Math.pow(1 - bt, 3);
				var fade = 1 - bt;
				var radius = 520 * plan.bloom;
				var grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, radius);
				grad.addColorStop(0, "rgba(224,86,127," + (0.3 * plan.bloom * fade).toFixed(3) + ")");
				grad.addColorStop(0.45, "rgba(201,162,39," + (0.1 * plan.bloom * fade).toFixed(3) + ")");
				grad.addColorStop(1, "rgba(201,162,39,0)");
				ctx.fillStyle = grad;
				ctx.fillRect(0, 0, W, H);

				ctx.beginPath();
				ctx.arc(ox, oy, 14 + ease * 340 * plan.bloom, 0, Math.PI * 2);
				ctx.strokeStyle = "rgba(247,231,184," + (0.55 * fade).toFixed(3) + ")";
				ctx.lineWidth = Math.max(0.5, 2 * fade);
				ctx.stroke();
			}

			/* the dust */
			var alive = false;
			for (var m = 0; m < motes.length; m++) {
				var p = motes[m];
				var pt = t - p.born;
				if (pt < 0) { alive = true; continue; }
				if (pt > p.life) continue;
				alive = true;

				var sec = pt / 1000;
				var frac = pt / p.life;
				var x = p.x + p.vx * sec + Math.sin(p.phase + sec * p.freq * Math.PI) * p.sway;
				var y = p.y + p.vy * sec;
				var envelope = frac < 0.12 ? frac / 0.12 : (1 - frac) / 0.88;
				var twinkle = 0.55 + 0.45 * Math.sin(p.phase + sec * p.tw);
				var alpha = Math.max(0, Math.min(1, envelope)) * twinkle;
				if (alpha <= 0.01) continue;

				ctx.globalAlpha = alpha;
				ctx.shadowBlur = 7;
				ctx.shadowColor = p.color;
				ctx.fillStyle = p.color;
				ctx.beginPath();
				ctx.arc(x, y, p.size, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.globalAlpha = 1;
			ctx.shadowBlur = 0;

			/* the glints */
			for (var q = 0; q < glints.length; q++) {
				var gl = glints[q];
				var gt = t - gl.born;
				if (gt < 0) { alive = true; continue; }
				if (gt > gl.life) continue;
				alive = true;

				var gsec = gt / 1000;
				var gfrac = gt / gl.life;
				var galpha = Math.sin(gfrac * Math.PI) * 0.5;
				var gx = gl.x + gl.vx * gsec, gy = gl.y;
				var dx = Math.cos(gl.angle) * gl.len, dy = Math.sin(gl.angle) * gl.len;

				var lg = ctx.createLinearGradient(gx - dx / 2, gy - dy / 2, gx + dx / 2, gy + dy / 2);
				lg.addColorStop(0, "rgba(247,231,184,0)");
				lg.addColorStop(0.5, "rgba(247,231,184," + galpha.toFixed(3) + ")");
				lg.addColorStop(1, "rgba(247,231,184,0)");
				ctx.strokeStyle = lg;
				ctx.lineWidth = 1.2;
				ctx.beginPath();
				ctx.moveTo(gx - dx / 2, gy - dy / 2);
				ctx.lineTo(gx + dx / 2, gy + dy / 2);
				ctx.stroke();
			}

			if (t < total && (alive || t < 1500)) {
				requestAnimationFrame(frame);
			} else {
				canvas.remove();
			}
		}
		requestAnimationFrame(frame);
		/* belt and braces: nothing outlives its welcome */
		setTimeout(function () { if (canvas.parentNode) canvas.remove(); }, total + 400);
	}

	/** A corrected ticket gets a brief mark, without the theatre. */
	function highlightEdited(id) {
		requestAnimationFrame(function () {
			var stub = root.querySelector('.sl-stub[data-id="' + id + '"]');
			if (!stub) return;
			stub.classList.add("is-edited");
			setTimeout(function () { stub.classList.remove("is-edited"); }, 1800);
		});
	}

	/** The newly saved ticket announces itself once, then settles. */
	function highlightNewest() {
		requestAnimationFrame(function () {
			var first = root.querySelector(".sl-stack .sl-stub");
			if (!first) return;
			first.classList.add("is-fresh");
			setTimeout(function () { first.classList.remove("is-fresh"); }, 2200);
		});
	}

	/**
	 * Where the keyboard is, in a form that survives a redraw: the field's own
	 * name rather than the node, which is about to be thrown away.
	 */
	function focusKey() {
		var el = document.activeElement;
		if (!el || !el.dataset || !root.contains(el)) return null;
		var sel = el.dataset.input ? '[data-input="' + el.dataset.input + '"]'
			: el.dataset.field && el.tagName === "SELECT" ? 'select[data-field="' + el.dataset.field + '"]'
			: null;
		if (!sel) return null;
		var caret = null;
		try { if (typeof el.selectionStart === "number") caret = [el.selectionStart, el.selectionEnd]; } catch (e) { caret = null; }
		return { sel: sel, caret: caret };
	}

	function refocus(key) {
		if (!key) return;
		var el = root.querySelector(key.sel);
		if (!el) return;
		el.focus({ preventScroll: true });
		if (key.caret) { try { el.setSelectionRange(key.caret[0], key.caret[1]); } catch (e) { /* not a text field */ } }
	}

	/**
	 * Say something beside the save button.
	 *
	 * The message used to be shown by redrawing the whole page, and taken away
	 * three seconds later by redrawing it again. Anyone already typing the
	 * next ticket had the keyboard pulled out from under them twice. The first
	 * redraw now puts focus back where it was, and the message leaves by
	 * removing itself — nothing else on the page is touched.
	 */
	var flashTimer = null;
	function flash(msg, ok) {
		state.status = { msg: msg, ok: ok !== false };
		var key = focusKey();
		render();
		refocus(key);
		clearTimeout(flashTimer);
		flashTimer = setTimeout(function () {
			state.status = null;
			var notes = root.querySelectorAll(".sl-note");
			for (var i = 0; i < notes.length; i++) notes[i].remove();
		}, 3200);
	}

	/* ---------------- interactions ---------------- */
	var sizing = false;
	window.addEventListener("resize", function () {
		if (sizing) return;
		sizing = true;
		requestAnimationFrame(function () { sizing = false; sizeLogWindow(); });
	});

	/* Scroll does not bubble, so the log window is watched on the way down.
	   Registered once; it survives every re-render because it lives on root. */
	root.addEventListener("scroll", function (e) {
		if (e.target && e.target.classList && e.target.classList.contains("sl-logscroll")) syncLogFade();
	}, true);

	// A dropdown reports through change, not click.
	root.addEventListener("change", function (e) {
		var el = e.target;
		if (!el || !el.dataset || !el.dataset.field) return;
		if (el.tagName !== "SELECT") return;
		setField(el.dataset.field, el.value);
	});

	root.addEventListener("click", function (e) {
		// A select carries data-field too, and choosing an option fires a click
		// as well as a change. Without this the click ran with no value and
		// reset the field — which is how the ticket type stuck on appointment.
		if (e.target && e.target.tagName === "SELECT") return;

		var el = e.target.closest("[data-tab],[data-act],[data-field],[data-multi]");
		if (!el) return;

		if (el.dataset.tab) {
			// The same sweep the save button uses, at page scale, so moving
			// between tabs feels like something happened rather than the
			// screen simply being replaced.
			if (state.tab !== el.dataset.tab) state.swept = true;
			state.tab = el.dataset.tab;
			if (state.tab === "all" && (!state.house || state.houseStale)) loadHouse();
			return render();
		}

		if (el.dataset.multi) {
			var list = state.form[el.dataset.multi] || [];
			var at = list.indexOf(el.dataset.value);
			if (at === -1) list.push(el.dataset.value); else list.splice(at, 1);
			state.form[el.dataset.multi] = list;
			return renderFormOnly();
		}

		if (el.dataset.field) return setField(el.dataset.field, el.dataset.value, true);

		switch (el.dataset.act) {
			case "money": state.showMoney = !state.showMoney; return render();
			case "party": state.partyOpen = !state.partyOpen; return renderFormOnly();
			case "clearparty": state.form.party_types = []; return renderFormOnly();
			case "clearform": state.form = blankForm(); state.partyOpen = false; return renderFormOnly();
			case "edit": return beginEdit(+el.dataset.id);
			case "canceledit": return cancelEdit();
			case "save": return save();
			case "remove": return askRemove(+el.dataset.id);
			case "removeyes": return remove(+el.dataset.id);
			case "removeno": return closeConfirm();
			case "refresh": return loadHouse();
			case "csv": return csv();
			case "more": state.visible += 40; return render();
			case "tourstart": return tourAction("/tour/start", {
				start: isoDate(new Date()),
				startTime: pad(new Date().getHours()) + ":" + pad(new Date().getMinutes()),
			});
			case "tourend": return tourAction("/tour/end", { end: isoDate(new Date()) });
			case "tourreopen": return tourAction("/tour/reopen");
			case "badge": return badgePeek({ ticket: el.dataset.ticket, day: el.dataset.day });
			case "tourretry": return tourRefresh();
			case "goalon": state.tour.goalEditing = true; return render();
			case "goaloff": state.tour.goalEditing = false; return render();
			case "goalclear": return tourSaveGoal("");
			case "goalsave": {
				var gf = root.querySelector('[data-goalfield="goal"]');
				return tourSaveGoal(gf ? gf.value : "");
			}
			case "tourediton": state.tour.editing = true; state.tour.error = ""; return render();
			case "toureditoff": state.tour.editing = false; state.tour.error = ""; return render();
			case "toursave": return tourSaveStart();
			case "tourdismiss": state.tour.just = null; return render();
			case "scope": return moveScope(+el.dataset.dir);
			case "scopeall":
				state.scope = state.scope === "all" ? null : "all";
				state.slide = {};
				return render();
			case "tourhistedit": {
				var row = state.tour.history.filter(function (r) {
					return String(r.id) === el.dataset.id;
				})[0];
				state.tour.editId = el.dataset.id;
				state.tour.editStart = row ? row.start : "";
				state.tour.editEnd = row ? row.end : "";
				state.tour.error = "";
				return render();
			}
			case "tourhistcancel":
				state.tour.editId = null;
				state.tour.error = "";
				return render();
			case "tourhistsave": {
				var sEl = root.querySelector('[data-histfield="start"]');
				var eEl = root.querySelector('[data-histfield="end"]');
				return tourSaveDates(state.tour.editId, sEl ? sEl.value : "", eEl ? eEl.value : "");
			}
			case "adminopen": return adminOpen();
			case "slide": return moveSlide(el.dataset.cid, (state.slide[el.dataset.cid] || 0) + (+el.dataset.dir));
			case "slideto": return moveSlide(el.dataset.cid, +el.dataset.at);
			case "panel": {
				var group = el.dataset.group, id = el.dataset.id;
				// Opening one closes the rest; pressing the open one closes it.
				state.open[group] = state.open[group] === id ? null : id;
				return render();
			}
		}
	});

	/**
	 * Text inputs keep their value in state without a re-render, so typing
	 * never loses focus.
	 *
	 * Both events, and it matters: a date or time chosen from the browser's
	 * own picker fires `change` and — in Safari, and for the calendar widget
	 * generally — no `input` at all. Listening only to `input` meant a date
	 * picked rather than typed was never recorded, and the ticket saved with
	 * whatever the field held before. The same is true of an amount arriving
	 * by paste or from some numeric keypads.
	 */
	function captureField(e) {
		if (!e.target.closest) return;

		var el = e.target.closest("[data-input]");
		if (el) {
			state.form[el.dataset.input] = el.value;
			return;
		}

		/* The tour-date fields keep their value in state for the same reason:
		   a render while the editor is open — a saved ticket elsewhere, a
		   refreshed tour state — would otherwise redraw them from the tour's
		   stored dates and throw away what had been typed. */
		var hist = e.target.closest("[data-histfield]");
		if (hist) {
			state.tour[hist.dataset.histfield === "start" ? "editStart" : "editEnd"] = hist.value;
		}
	}
	root.addEventListener("input", captureField);
	root.addEventListener("change", captureField);

	/* ---------------- actions ---------------- */
	/**
	 * Transport is one choice, but it is stored as three columns so that every
	 * ticket ever logged still reads the same way. The chosen one becomes
	 * "yes", the others "no"; "unknown" sets all three to unknown.
	 */
	/**
	 * A stored ticket, read back into the shape the form uses. The three
	 * transport columns collapse back into the one choice they came from.
	 */
	function ticketToForm(t) {
		var transport = t.limo === "yes" ? "limo"
			: t.outside === "yes" ? "outside"
			: t.selfDrive === "yes" ? "self"
			: (t.limo === "unknown" || t.outside === "unknown" || t.selfDrive === "unknown") ? "unknown"
			: null;

		return {
			date: t.date,
			time: t.time,
			kind: t.kind || "appointment",
			party_types: (t.partyTypes || []).slice(),
			guest_type: t.guestType || null,
			hotel_guest: t.hotelGuest || null,
			transport: transport,
			attendance: t.attendance || null,
			outcome: t.outcome || null,
			price_mode: t.priceMode || null,
			amount: t.amount === null || t.amount === undefined ? "" : String(t.amount),
			reason: t.reason || "",
			note: t.note || "",
			is_test: !!t.isTest,
		};
	}

	function transportFields(choice) {
		if (!choice) return { limo: null, outside: null, self_drive: null };
		if (choice === "unknown") return { limo: "unknown", outside: "unknown", self_drive: "unknown" };
		return {
			limo: choice === "limo" ? "yes" : "no",
			outside: choice === "outside" ? "yes" : "no",
			self_drive: choice === "self" ? "yes" : "no",
		};
	}

	function beginEdit(id) {
		var ticket = state.tickets.filter(function (t) { return t.id === id; })[0];
		if (!ticket) return;

		state.editing = id;
		state.form = ticketToForm(ticket);
		state.partyOpen = false;
		state.tab = "log";
		render();

		// Bring the form into view; on a narrow screen it sits above the list.
		var card = root.querySelector(".sl-card.is-editing");
		if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "start" });
	}

	function cancelEdit() {
		state.editing = null;
		state.form = blankForm();
		state.partyOpen = false;
		render();
	}

	/**
	 * Apply one field change. Pills toggle — pressing the chosen one again
	 * clears it — while a dropdown simply reports whatever is now selected,
	 * so only the pill path is allowed to unset.
	 */
	function setField(field, value, toggles) {
		// Nothing should reach here without a value. If it does, leave the
		// form alone rather than quietly clearing or defaulting the field.
		if (value === undefined) return;

		if (field === "mode") { state.mode = value; return render(); }

		var f = state.form;
		f[field] = (toggles && f[field] === value) ? null : (value === "" ? null : value);

		if (field === "is_test") {
			f.is_test = f.is_test === "yes" || value === "yes";
			return renderFormOnly();
		}
		if (field === "kind") {
			if (!f.kind) f.kind = "appointment";
			// Non-appointments are present by definition; appointments go back
			// to being unanswered rather than silently marked kept.
			f.attendance = f.kind === "appointment" ? null : "showed";
		}
		if (field === "attendance" && f.attendance === "noshow") {
			f.outcome = null; f.price_mode = null; f.amount = ""; f.reason = "";
		}
		if (field === "outcome") {
			if (f.outcome !== "booked") { f.price_mode = null; f.amount = ""; }
			if (f.outcome !== "notbooked") f.reason = "";
		}
		if (field === "price_mode" && f.price_mode === "omitted") f.amount = "";

		return FORM_FIELDS.indexOf(field) === -1 ? render() : renderFormOnly();
	}

	function save() {
		var f = state.form;
		if (!f.date || !f.time) return flash("Add a day and time to save this ticket.", false);

		var button = root.querySelector('[data-act="save"]');
		root.classList.add("sl-busy");
		var payload = Object.assign({}, f, transportFields(f.transport));
		delete payload.transport;

		var editing = state.editing;
		var path = editing ? "/tickets/" + editing : "/tickets";

		api(path, { method: editing ? "PUT" : "POST", body: payload })
			.then(function (ticket) {
				if (editing) {
					state.tickets = state.tickets.map(function (t) { return t.id === editing ? ticket : t; });
				} else {
					state.tickets.unshift(ticket);
				}
				state.tickets.sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); });
				state.houseStale = true;   // refreshed next time the tab is opened
				state.editing = null;
				/* A new ticket belongs to the shift being worked now, so the
				   log drops back to it. Saving onto a tour you had stepped
				   back to read, and watching the ticket not appear, is the
				   one way this could look broken. */
				if (!editing) { state.scope = null; state.visible = Math.max(state.visible, 40); }
				state.form = blankForm();
				state.partyOpen = false;

				if (editing) {
					// An edit is a correction, not an occasion.
					flash("Ticket updated.");
					highlightEdited(editing);
				} else {
					flash(pickPraise(ticket));
					celebrate(button, ticket);
					highlightNewest();
				}

				/* A booking may have just carried the tour past its goal.
				   The progress figures are the server's, so they are asked
				   for again rather than guessed at here — and the goal
				   celebration waits its turn behind the ticket's own. */
				if (state.tour.open) {
					var wasReached = !!(state.tour.progress && state.tour.progress.reached);
					tourRefresh().then(function () {
						setTimeout(function () { maybeCelebrateGoal(wasReached); }, editing ? 0 : 900);
					});
				}
			})
			.catch(function (err) { flash(err.message || "Could not save.", false); })
			.finally(function () { root.classList.remove("sl-busy"); });
	}

	/* ==================================================================
	   Deleting a ticket

	   A ticket is a night that happened, and there is no undo — so removing
	   one now takes two deliberate presses with the ticket itself shown in
	   between. The second button is the only thing on screen that deletes;
	   the first only asks.

	   Not window.confirm(): that shows the browser's own words, cannot show
	   which ticket is about to go, and on a phone appears at the top of the
	   screen far from the button that was pressed.
	   ================================================================== */
	var confirmHost = null;

	function askRemove(id) {
		var ticket = state.tickets.filter(function (t) { return t.id === id; })[0];
		if (!ticket) return;

		if (!confirmHost) {
			confirmHost = document.createElement("div");
			confirmHost.className = "sl-confirm sl-app";
			document.body.appendChild(confirmHost);

			/* This lives in document.body, outside the app's root, so the
			   delegated click handler never sees it — its buttons have to be
			   wired here or the dialog looks right and does nothing. */
			confirmHost.addEventListener("click", function (e) {
				/* A click on the backdrop cancels. Deliberately: the safe
				   answer should be the easy one to reach by accident. */
				if (e.target === confirmHost) return closeConfirm();

				var btn = e.target.closest ? e.target.closest("[data-act]") : null;
				if (!btn) return;
				if (btn.dataset.act === "removeno") return closeConfirm();
				if (btn.dataset.act === "removeyes") return remove(+btn.dataset.id);
			});
			document.addEventListener("keydown", function (e) {
				if (e.key === "Escape" && confirmHost.classList.contains("is-on")) closeConfirm();
			});
		}

		confirmHost.innerHTML =
			'<div class="sl-confirmsheet" role="alertdialog" aria-labelledby="sl-confirmtitle">' +
				'<button type="button" class="sl-peekclose" data-act="removeno" aria-label="Cancel">' +
					'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" ' +
						'stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>' +
				"</button>" +
				'<p class="sl-eyebrow" id="sl-confirmtitle">Delete this ticket?</p>' +
				'<div class="sl-peekbody">' + peekTicket(ticket) + "</div>" +
				'<p class="sl-confirmwarn">This cannot be undone. It comes out of your figures and off the ' +
					"Everyone tab as well.</p>" +
				'<div class="sl-confirmacts">' +
					'<button type="button" class="sl-ghost" data-act="removeno">Keep it</button>' +
					'<button type="button" class="sl-danger" data-act="removeyes" data-id="' + id + '">' +
						"Yes, delete it</button>" +
				"</div>" +
			"</div>";

		confirmHost.classList.add("is-on");
		/* Focus lands on the cancel, not the delete — so a stray Enter keeps
		   the ticket rather than removing it. */
		var keep = confirmHost.querySelector('[data-act="removeno"]');
		if (keep) setTimeout(function () { keep.focus(); }, 60);
	}

	function closeConfirm() {
		if (!confirmHost) return;
		confirmHost.classList.remove("is-on");
		setTimeout(function () { if (confirmHost) confirmHost.innerHTML = ""; }, 200);
	}

	function remove(id) {
		closeConfirm();
		api("/tickets/" + id, { method: "DELETE" })
			.then(function () {
				state.tickets = state.tickets.filter(function (t) { return t.id !== id; });
				state.houseStale = true;
				if (state.editing === id) { state.editing = null; state.form = blankForm(); }
				render();
				flash("Ticket deleted.");
			})
			.catch(function (err) { flash(err.message || "Could not remove.", false); });
	}

	/**
	 * Fetch the pooled figures. If something is already on screen it stays
	 * there while the new numbers arrive, so a refresh never blanks the tab.
	 */
	function loadHouse() {
		if (state.houseLoading) return;
		state.houseLoading = true;
		render();

		api("/stats/house")
			.then(function (h) { state.house = h; state.houseStale = false; })
			.catch(function (err) { flash(err.message || "Could not load the house view.", false); })
			.finally(function () { state.houseLoading = false; render(); });
	}

	/* Rotating so the same words don't repeat every single time. */
	var PRAISE = {
		warm: ["Logged — their loss.", "Noted. Onwards.", "In the book."],
		money:  ["Logged.", "That's down.", "In the book.", "Nice one."],
		good:   ["Lovely.", "That's a good one.", "Nicely done."],
		rich:   ["What a night.", "Outstanding.", "One for the books."],
		quiet:  ["Logged.", "Noted.", "Saved."],
	};
	function pickPraise(ticket) {
		var tone = toneFor(ticket);
		var list = PRAISE[tone] || PRAISE.quiet;
		return list[Math.floor(Math.random() * list.length)];
	}

	function csv() {
		var head = ["Ticket", "Date", "Time", "Type", "Party types", "Guest", "Hotel guest", "Limo", "Outside driver", "Self drive", "Attendance", "Outcome", "Price visibility", "Amount", "Reason", "Private note", "Test"];
		var rows = state.tickets.map(function (t, i) {
			return [state.tickets.length - i, t.date, t.time, t.kind,
				(t.partyTypes || []).map(function (k) { return PARTY[k] || k; }).join("; "),
				t.guestType || "", t.hotelGuest || "", t.limo || "", t.outside || "", t.selfDrive || "",
				t.attendance || "", t.outcome || "", t.priceMode || "", t.amount || "",
				t.reason || "", t.note || "", t.isTest ? "test" : ""];
		});
		// A quote inside a cell is doubled, which is how CSV carries one — it
		// used to be swapped for an apostrophe, quietly changing what was
		// written. A cell a spreadsheet would run as a formula is defused.
		var cell = function (c) {
			var v = String(c == null ? "" : c);
			if (/^[=+\-@\t\r]/.test(v) && isNaN(Number(v))) v = "'" + v;
			return '"' + v.replace(/"/g, '""') + '"';
		};
		var body = [head].concat(rows).map(function (r) { return r.map(cell).join(","); }).join("\r\n");

		// The leading mark tells Excel the file is UTF-8, so accents survive.
		var url = URL.createObjectURL(new Blob(["\ufeff" + body], { type: "text/csv;charset=utf-8" }));
		var a = document.createElement("a");
		a.href = url; a.download = "my-shift-log.csv";
		document.body.appendChild(a); a.click(); a.remove();
		setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
	}

	/* ---------------- boot ---------------- */
	render();
	api("/tickets")
		.then(function (res) {
			state.tickets = res.tickets || [];
			if (res.handle) D.handle = res.handle;
			if (res.party && Object.keys(res.party).length) PARTY = res.party;
		})
		.catch(function (err) { state.status = { msg: err.message || "Could not load your log.", ok: false }; })
		.finally(function () { state.loading = false; render(); });

	/* Whether this person is marked as in the house, and their closed tours. */
	/* Refreshed anyway, because the page may have been open a while, or the
	   same account may be signed in on a phone as well. Redraws whatever tab
	   is showing — the switch lives on the log, so gating this on the
	   insights tab left the log showing a stale state indefinitely. */
	tourRefresh();

	/* ==================================================================
	   The admin panel

	   Lives behind the S. It is built into document.body and driven by its
	   own small render, because the app's root is rewritten constantly and
	   a panel inside it would be destroyed mid-keystroke.

	   The password is checked by the server against the WordPress account
	   for the owner address. Nothing about the credential lives in this file
	   or anywhere else in the plugin — a wrong address and a wrong password
	   fail with the same words, so this cannot be used to learn which
	   addresses exist.
	   ================================================================== */
	var adminHost = null;

	function adminOpen() {
		state.admin.on = true;
		state.admin.error = "";
		state.admin.busy = true;
		adminRender();

		/* Ask the server who is already signed in. If that account may open the
		   panel, no password is asked for — being signed in as the owner and
		   then proving the owner's password again checks nothing. */
		api("/admin/whoami")
			.then(function (who) {
				state.admin.who = who;
				state.admin.busy = false;
				if (who && who.canOpen) {
					state.admin.unlocked = true;
					adminLoad();
				} else {
					adminRender();
				}
			})
			.catch(function (err) {
				state.admin.busy = false;
				state.admin.error = adminErrorText(err);
				adminRender();
			});
	}

	/**
	 * Turn a failure into something that says where it stopped. A panel that
	 * only ever says "that did not work" cannot be debugged from the outside.
	 */
	function adminErrorText(err) {
		if (!err) return "That did not work.";
		if (err.status === 404) {
			return "The plugin's admin route is missing (404). The update may not have finished installing — " +
				"deactivate and reactivate Shift Log, then try again.";
		}
		if (err.code === "rest_cookie_invalid_nonce") {
			return "Your session expired. Reload the page and try again.";
		}
		if (err.status === 401 || err.code === "rest_not_logged_in") {
			return "WordPress does not see you as signed in. Reload the page and try again.";
		}
		if (err.status === 403 && !err.code) {
			return "Something on the server refused the request (403). A security plugin or firewall " +
				"may be blocking the REST API.";
		}
		return err.message || "That did not work.";
	}

	function adminClose() {
		state.admin.on = false;
		adminRender();
	}

	function adminLoad() {
		state.admin.busy = true;
		adminRender();
		api("/admin/data")
			.then(function (d) {
				state.admin.data = d;
				state.admin.unlocked = true;
			})
			.catch(function (err) {
				state.admin.unlocked = false;
				state.admin.error = adminErrorText(err);
			})
			.finally(function () { state.admin.busy = false; adminRender(); });
	}

	function adminUnlock(email, password) {
		email = String(email || "").trim();
		password = String(password || "");

		state.admin.login = email;

		if (!email || !password) {
			state.admin.error = "Both boxes, please.";
			return adminRender();
		}

		state.admin.busy = true;
		state.admin.error = "";
		adminRender();

		api("/admin/unlock", { method: "POST", body: { email: email, password: password } })
			.then(function () {
				state.admin.unlocked = true;
				state.admin.busy = false;
				adminLoad();
			})
			.catch(function (err) {
				state.admin.busy = false;
				state.admin.error = adminErrorText(err);
				adminRender();
			});
	}

	function adminLock() {
		api("/admin/lock", { method: "POST" }).catch(function () {});
		state.admin.unlocked = false;
		state.admin.data = null;
		state.admin.on = false;
		adminRender();
	}

	function adminBug(id, act) {
		var was = state.admin.data;
		state.admin.busy = true;
		adminRender();
		api("/admin/bug", { method: "POST", body: { id: id, act: act } })
			.then(function () {
				if (!was) return;
				if (act === "delete") {
					was.bugs = was.bugs.filter(function (b) { return b.id !== id; });
					was.totals.bugs = was.bugs.length;
				} else {
					was.bugs.forEach(function (b) { if (b.id === id) b.status = act; });
				}
				was.totals.bugsOpen = was.bugs.filter(function (b) { return b.status !== "closed"; }).length;
			})
			.catch(function (err) { state.admin.error = err.message || "That did not save."; })
			.finally(function () { state.admin.busy = false; adminRender(); });
	}

	function shortDate(iso) {
		if (!iso) return "—";
		var d = new Date(String(iso).replace(" ", "T"));
		if (isNaN(d)) return "—";
		return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
	}

	function adminFields() {
		var e = adminHost && adminHost.querySelector('[data-ad="email"]');
		var p = adminHost && adminHost.querySelector('[data-ad="password"]');
		return { email: e ? e.value : "", password: p ? p.value : "" };
	}

	function adminDiagHtml() {
		var w = state.admin.who;
		if (!w) return '<p class="sl-addiag">Could not reach the plugin to check. The panel could not load its own status.</p>';

		var rows = [
			["Signed in as", w.username ? w.username + " (" + w.email + ")" : "no one"],
			["This account is an administrator", w.isAdmin ? "yes" : "no"],
			["This account is the panel owner", w.isOwner ? "yes" : "no"],
			["Panel is set to open for", w.owner || "—"],
			["Bug report table exists", w.tablesReady ? "yes" : "no — reactivate the plugin"],
			["Plugin version", w.version || "—"],
		];

		return '<div class="sl-addiag"><p class="sl-addiaghead">What the server sees</p><dl>' +
			rows.map(function (r) {
				return "<dt>" + esc(r[0]) + "</dt><dd>" + esc(String(r[1])) + "</dd>";
			}).join("") + "</dl>" +
			"<p>" + (w.isOwner || w.isAdmin
				? "This account should be able to open the panel. If it will not, something between the browser and WordPress is blocking the request — a security plugin or a cache."
				: "This account is not the one the panel opens for. Either sign into WordPress as " + esc(w.owner) +
					", or enter that account's details above.") +
			"</p></div>";
	}

	function adminGateHtml() {
		var w = state.admin.who;

		return '<div class="sl-adgate">' +
			'<p class="sl-eyebrow">Admin</p>' +
			"<h2>Behind the log</h2>" +
			(w && w.signedIn && !w.canOpen
				? "<p>You are signed into WordPress as <strong>" + esc(w.username || w.email) +
					"</strong>, which is not the account this panel opens for. Sign in below as " +
					esc(w.owner) + ", or switch WordPress accounts.</p>"
				: "<p>Bug reports and who has logged what. Sign in with the owner account to open it.</p>") +
			'<label class="sl-adlabel">Username or email' +
				'<input type="text" class="sl-adfield" data-ad="email" autocomplete="username" ' +
					'autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="alicelittleweb" ' +
					'value="' + esc(state.admin.login || "") + '">' +
			"</label>" +
			'<label class="sl-adlabel">Password' +
				'<input type="password" class="sl-adfield" data-ad="password" autocomplete="current-password" placeholder="••••••••">' +
			"</label>" +
			(state.admin.error ? '<p class="sl-aderr">' + esc(state.admin.error) + "</p>" : "") +
			'<button type="button" class="sl-adgo" data-ad="go"' + (state.admin.busy ? " disabled" : "") + ">" +
				(state.admin.busy ? "Checking…" : "Open panel") + "</button>" +
			'<p class="sl-adfine">Your WordPress username or the email on the account, with that account\'s password. ' +
				'It is checked against WordPress itself — nothing is stored in this plugin.</p>' +
			'<button type="button" class="sl-adwhy" data-ad="diag">' +
				(state.admin.diag ? "Hide details" : "Trouble getting in?") + "</button>" +
			(state.admin.diag ? adminDiagHtml() : "") +
			"</div>";
	}

	function adminBugsHtml(d) {
		var filter = state.admin.filter;
		var list = d.bugs.filter(function (b) {
			return filter === "all" ? true : filter === "closed" ? b.status === "closed" : b.status !== "closed";
		});

		var chips = [["open", "Needs attention"], ["closed", "Closed"], ["all", "Everything"]].map(function (f) {
			return '<button type="button" class="sl-adchip' + (filter === f[0] ? " is-on" : "") +
				'" data-ad="filter" data-val="' + f[0] + '">' + f[1] + "</button>";
		}).join("");

		if (!list.length) {
			return '<div class="sl-adchips">' + chips + "</div>" +
				'<div class="sl-empty"><strong>Nothing here</strong>No reports match this filter.</div>';
		}

		return '<div class="sl-adchips">' + chips + "</div>" +
			'<div class="sl-adbugs">' + list.map(function (b) {
				return '<article class="sl-adbug" data-status="' + esc(b.status) + '">' +
					'<div class="sl-adbugtop">' +
						'<span class="sl-adhandle">' + esc(b.handle || "unknown") + "</span>" +
						'<span class="sl-adwhen">' + shortDate(b.at) + "</span>" +
						'<span class="sl-adstatus" data-s="' + esc(b.status) + '">' + esc(b.status) + "</span>" +
					"</div>" +
					'<p class="sl-adbugmsg">' + esc(b.message).replace(/\n/g, "<br>") + "</p>" +
					'<p class="sl-adbugmeta">' + esc(b.tab || "—") + " tab · v" + esc(b.version || "?") +
						(b.viewport ? " · " + esc(b.viewport) : "") + "</p>" +
					'<div class="sl-adbugacts">' +
						(b.status !== "open" ? '<button type="button" class="sl-adbtn" data-ad="bug" data-id="' + b.id + '" data-val="open">Working on it</button>' : "") +
						(b.status !== "closed"
							? '<button type="button" class="sl-adbtn" data-ad="bug" data-id="' + b.id + '" data-val="closed">Close</button>'
							: '<button type="button" class="sl-adbtn" data-ad="bug" data-id="' + b.id + '" data-val="new">Reopen</button>') +
						'<button type="button" class="sl-adbtn is-del" data-ad="bug" data-id="' + b.id + '" data-val="delete">Delete</button>' +
					"</div></article>";
			}).join("") + "</div>";
	}

	function adminMembersHtml(d) {
		if (!d.members.length) {
			return '<div class="sl-empty"><strong>No accounts yet</strong>Members appear here as soon as they exist.</div>';
		}

		var most = d.members.reduce(function (a, m) { return Math.max(a, m.counted); }, 0) || 1;

		return '<div class="sl-scroll"><table class="sl-table sl-adtable">' +
			"<thead><tr><th>Handle</th><th>Tickets</th><th class='sl-num'>Counted</th><th class='sl-num'>Tests</th>" +
			"<th class='sl-num'>Booked</th><th>Last logged</th></tr></thead><tbody>" +
			d.members.map(function (m) {
				var width = Math.round((m.counted / most) * 100);
				return "<tr>" +
					"<td><span class='sl-adhandle'>" + esc(m.handle || "—") + "</span>" +
						(m.email ? "<span class='sl-adsub'>" + esc(m.email) + "</span>" : "") +
						(m.pending ? "<span class='sl-chip' data-tone='caution'>Awaiting approval</span>" : "") +
						(m.gone ? "<span class='sl-chip' data-tone='muted'>Account deleted</span>" : "") +
					"</td>" +
					"<td><span class='sl-adbar'><span class='sl-adbarfill' style='width:" + width + "%'></span></span></td>" +
					"<td class='sl-num'><strong>" + m.counted + "</strong></td>" +
					"<td class='sl-num'>" + (m.tests || "—") + "</td>" +
					"<td class='sl-num'>" + (m.booked || "—") + "</td>" +
					"<td>" + shortDate(m.lastOn) + "</td>" +
					"</tr>";
			}).join("") + "</tbody></table></div>" +
			'<p class="sl-fn">Counted excludes test tickets. Handles are what everyone else sees; the address is shown here only so a report can be followed up.</p>';
	}

	function adminPanelHtml() {
		var d = state.admin.data;
		if (!d) {
			return '<div class="sl-empty">' + (state.admin.busy ? "Opening…" : "Nothing loaded.") + "</div>";
		}

		var t = d.totals;
		var tabs = [["bugs", "Bug reports", t.bugsOpen], ["members", "Members", t.members]].map(function (x) {
			return '<button type="button" class="sl-adtab' + (state.admin.tab === x[0] ? " is-on" : "") +
				'" data-ad="tab" data-val="' + x[0] + '">' + x[1] +
				(x[2] ? '<span class="sl-tabcount">' + x[2] + "</span>" : "") + "</button>";
		}).join("");

		return '<div class="sl-adstats">' +
				'<div class="sl-stat"><div class="sl-statnum">' + t.tickets + '</div><div class="sl-statlab">Tickets logged</div></div>' +
				'<div class="sl-stat"><div class="sl-statnum">' + t.active + '</div><div class="sl-statlab">Members logging</div></div>' +
				'<div class="sl-stat"><div class="sl-statnum">' + t.members + '</div><div class="sl-statlab">Accounts</div></div>' +
				'<div class="sl-stat"><div class="sl-statnum' + (t.bugsOpen ? " sl-caution" : "") + '">' + t.bugsOpen +
					'</div><div class="sl-statlab">Open reports</div></div>' +
			"</div>" +
			'<div class="sl-adtabs">' + tabs + "</div>" +
			(state.admin.error ? '<p class="sl-aderr">' + esc(state.admin.error) + "</p>" : "") +
			'<div class="sl-adbody">' +
				(state.admin.tab === "members" ? adminMembersHtml(d) : adminBugsHtml(d)) +
			"</div>";
	}

	function adminRender() {
		if (!adminHost) {
			adminHost = document.createElement("div");
			adminHost.className = "sl-admin sl-app";
			document.body.appendChild(adminHost);

			adminHost.addEventListener("click", function (e) {
				var el = e.target.closest ? e.target.closest("[data-ad]") : null;
				if (!el) {
					if (e.target === adminHost) adminClose();
					return;
				}
				var what = el.dataset.ad;
				if (what === "go") {
					var f = adminFields();
					return adminUnlock(f.email, f.password);
				}
				if (what === "close") return adminClose();
				if (what === "lock") return adminLock();
				if (what === "diag") { state.admin.diag = !state.admin.diag; return adminRender(); }
				if (what === "tab") { state.admin.tab = el.dataset.val; return adminRender(); }
				if (what === "filter") { state.admin.filter = el.dataset.val; return adminRender(); }
				if (what === "bug") {
					if (el.dataset.val === "delete" && !window.confirm("Delete this report for good?")) return;
					return adminBug(+el.dataset.id, el.dataset.val);
				}
			});

			adminHost.addEventListener("keydown", function (e) {
				if (e.key === "Enter" && e.target.dataset && e.target.dataset.ad &&
					(e.target.dataset.ad === "email" || e.target.dataset.ad === "password")) {
					e.preventDefault();
					var f = adminFields();
					adminUnlock(f.email, f.password);
				}
			});

			document.addEventListener("keydown", function (e) {
				if (e.key === "Escape" && state.admin.on) adminClose();
			});
		}

		adminHost.classList.toggle("is-on", !!state.admin.on);
		if (!state.admin.on) { adminHost.innerHTML = ""; return; }

		var body = state.admin.unlocked
			? adminPanelHtml()
			: (state.admin.busy && !state.admin.who)
				? '<div class="sl-empty">Checking who you are…</div>'
				: adminGateHtml();

		adminHost.innerHTML =
			'<div class="sl-adsheet" role="dialog" aria-label="Admin panel">' +
				'<div class="sl-adhead">' +
					'<div class="sl-adtitle">' + logoMark(34) +
						"<div><p>Admin</p><span>" + esc((state.admin.data && state.admin.data.owner) || "") + "</span></div>" +
					"</div>" +
					'<div class="sl-adhactions">' +
						(state.admin.unlocked ? '<button type="button" class="sl-ghost" data-ad="lock">Lock</button>' : "") +
						'<button type="button" class="sl-ghost" data-ad="close">Close</button>' +
					"</div>" +
				"</div>" +
				body +
			"</div>";

		if (!state.admin.unlocked) {
			var first = adminHost.querySelector('[data-ad="email"]');
			if (first) setTimeout(function () { first.focus(); }, 80);
		}
	}

	/* ==================================================================
	   The bug mark

	   A small, mostly transparent mark in the corner. Tapping it opens a
	   box to describe what went wrong; sending it files a report that only
	   the owning account can read.

	   It is built into document.body rather than into the app's root,
	   because root.innerHTML is replaced on every render and anything
	   living inside it would be wiped mid-sentence. Its own listeners are
	   attached once and never rebuilt, so a half-written report survives
	   a save, a tab change and a re-render.
	   ================================================================== */
	function bugWidget() {
		if (D.bugs === false) return;

		var LIMIT = 2000;
		var host = document.createElement("div");
		host.className = "sl-bug";
		host.innerHTML =
			'<button type="button" class="sl-bugbtn" aria-expanded="false" aria-label="Report a problem" title="Report a problem">' +
				'<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" ' +
					'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
					'<path d="M8 6.5a4 4 0 0 1 8 0"/>' +
					'<rect x="7.5" y="6.5" width="9" height="12" rx="4.5"/>' +
					'<path d="M7.5 10.5H4M7.5 14.5H3.6M7.5 17.6 4.6 19.4M16.5 10.5H20M16.5 14.5h3.9M16.5 17.6l2.9 1.8M7.7 8.4 5.2 6.2M16.3 8.4l2.5-2.2M12 11v4"/>' +
				"</svg></button>" +
			'<div class="sl-bugpanel" role="dialog" aria-label="Report a problem" hidden>' +
				'<div class="sl-bughead">' +
					"<p>Something wrong?</p>" +
					'<button type="button" class="sl-bugclose" aria-label="Close">' +
						'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" ' +
							'stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>' +
					"</button>" +
				"</div>" +
				'<p class="sl-bugintro">Tell me what happened and what you expected instead. It goes straight to me — no one else on the floor sees it.</p>' +
				'<textarea class="sl-buginput" rows="4" maxlength="' + LIMIT + '" ' +
					'placeholder="The average party figure looks wrong after I edited a ticket…"></textarea>' +
				'<div class="sl-bugfoot">' +
					'<span class="sl-bugcount">' + LIMIT + " left</span>" +
					'<button type="button" class="sl-bugsend">Send report</button>' +
				"</div>" +
				'<p class="sl-bugnote">Your handle goes with it, along with which tab you were on and your screen size. Nothing from your tickets is attached.</p>' +
			"</div>";

		document.body.appendChild(host);

		var btn = host.querySelector(".sl-bugbtn");
		var panel = host.querySelector(".sl-bugpanel");
		var input = host.querySelector(".sl-buginput");
		var count = host.querySelector(".sl-bugcount");
		var send = host.querySelector(".sl-bugsend");

		function open(yes) {
			host.classList.toggle("is-open", yes);
			btn.setAttribute("aria-expanded", yes ? "true" : "false");
			panel.hidden = !yes;
			if (yes) setTimeout(function () { input.focus(); }, 120);
		}

		btn.addEventListener("click", function () { open(panel.hidden); });
		host.querySelector(".sl-bugclose").addEventListener("click", function () { open(false); });

		input.addEventListener("input", function () {
			var left = LIMIT - input.value.length;
			count.textContent = left + " left";
			count.classList.toggle("is-low", left < 120);
		});

		/* Escape closes it; a click anywhere outside does too, unless there is
		   something written, in which case a stray click should not throw it away. */
		document.addEventListener("keydown", function (e) {
			if (e.key === "Escape" && !panel.hidden) open(false);
		});
		document.addEventListener("click", function (e) {
			if (panel.hidden || host.contains(e.target) || input.value.trim()) return;
			open(false);
		});

		send.addEventListener("click", function () {
			var text = input.value.trim();
			if (text.length < 4) {
				input.focus();
				host.classList.add("is-nudge");
				setTimeout(function () { host.classList.remove("is-nudge"); }, 500);
				return;
			}

			send.disabled = true;
			send.textContent = "Sending…";

			/* api() serialises the body itself, so this passes an object. */
			api("/bugs", {
				method: "POST",
				body: {
					message: text,
					page: location.href,
					tab: state.tab,
					viewport: window.innerWidth + "x" + window.innerHeight,
					ua: navigator.userAgent,
				},
			})
				.then(function () {
					host.classList.add("is-sent");
					panel.innerHTML =
						'<div class="sl-bugdone">' +
							'<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" ' +
								'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
								'<path d="M20 6.5 9.5 17 4 11.5"/></svg>' +
							"<p><strong>Sent.</strong> Thank you — I read every one of these.</p>" +
						"</div>";
					setTimeout(function () { open(false); }, 2200);
				})
				.catch(function (err) {
					send.disabled = false;
					send.textContent = "Send report";
					count.textContent = err && err.message ? err.message : "That did not send.";
					count.classList.add("is-low");
				});
		});
	}

	/* ==================================================================
	   Back to the top

	   The header sits at the top of the page and stays there — it does not
	   follow the scroll, because a bar that trails you down a long log
	   takes up room on every screen to save one gesture on a few. This is
	   that gesture instead: a mark that appears only once there is enough
	   page behind you to want it.

	   Built into document.body for the same reason as the bug mark: the
	   app's root is rewritten on every render, and anything inside it
	   would be destroyed and rebuilt mid-scroll.
	   ================================================================== */
	function toTop() {
		var btn = document.createElement("button");
		btn.type = "button";
		btn.className = "sl-totop";
		btn.setAttribute("aria-label", "Back to the top");
		btn.title = "Back to the top";
		btn.innerHTML =
			'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" ' +
				'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
				'<path d="M12 19V6M5.5 12.5 12 6l6.5 6.5"/></svg>';

		/* It shares the corner with the bug mark, so it sits above it. */
		if (D.bugs !== false) btn.classList.add("has-bug");
		document.body.appendChild(btn);

		var shown = false;
		function check() {
			var past = (window.scrollY || document.documentElement.scrollTop || 0) > 520;
			if (past === shown) return;
			shown = past;
			btn.classList.toggle("is-on", past);
		}

		/* Scroll fires constantly; the class only ever changes on a crossing,
		   and the work is deferred to the next frame so nothing is measured
		   in the middle of the browser's own scrolling. */
		var waiting = false;
		window.addEventListener("scroll", function () {
			if (waiting) return;
			waiting = true;
			requestAnimationFrame(function () { waiting = false; check(); });
		}, { passive: true });

		btn.addEventListener("click", function () {
			var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
			window.scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
			/* Send focus back to where the eye is going, so the keyboard
			   follows the page rather than being left at the bottom. */
			var first = root.querySelector(".sl-tab, h1, .sl-logobtn");
			if (first && first.focus) setTimeout(function () { first.focus({ preventScroll: true }); }, still ? 0 : 420);
		});

		check();
	}

	bugWidget();
	toTop();
})();

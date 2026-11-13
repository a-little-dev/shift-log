<?php
/**
 * Tours a person declares, rather than tours the log infers.
 *
 * Until now a tour was guessed from gaps between logged days — which works,
 * but only after the fact, and it cannot tell a quiet Tuesday from a flight
 * home. This lets someone say plainly: I am in the house from today, and now
 * I am not.
 *
 * Two things are stored per person:
 *
 *   sl_tour_open    the tour in progress, or nothing. Just a start date and
 *                   when it was opened.
 *   sl_tour_history the tours already closed, each with the figures worked
 *                   out at the moment of closing.
 *
 * The figures are calculated once, when the tour closes, and kept. A tour
 * that is over should not quietly change months later because a ticket was
 * edited — if the numbers were what someone worked to at the time, that is
 * the record worth keeping.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function sl_tour_open( $user_id = 0 ) {
	$user_id = $user_id ? $user_id : get_current_user_id();
	$open    = get_user_meta( $user_id, 'sl_tour_open', true );
	return is_array( $open ) && ! empty( $open['start'] ) ? $open : null;
}

function sl_tour_history( $user_id = 0 ) {
	$user_id = $user_id ? $user_id : get_current_user_id();
	$hist    = get_user_meta( $user_id, 'sl_tour_history', true );
	return is_array( $hist ) ? $hist : array();
}

/**
 * The average party the app quotes everywhere: the top and bottom tenth set
 * aside once there are ten prices, the rest averaged. One definition, so a
 * tour's average is the same figure on the log, on My insights and in the
 * history.
 */
function sl_trimmed_mean( array $prices ) {
	$n = count( $prices );
	if ( ! $n ) {
		return 0.0;
	}
	sort( $prices, SORT_NUMERIC );
	$cut  = ( $n >= 10 ) ? (int) floor( $n * 0.1 ) : 0;
	$core = $cut ? array_slice( $prices, $cut, $n - 2 * $cut ) : $prices;
	return array_sum( $core ) / count( $core );
}

/**
 * Closed tours recorded before 3.27 kept a total and a count but no average,
 * so the history divided one by the other — a plain mean, beside a footnote
 * saying averages are trimmed, and a different figure from the one My
 * insights shows for the same tour.
 *
 * The trimmed average is filled in once, and only where the tickets in the
 * log still add up to what the record says. Where they no longer do, the
 * tour has been edited since it closed, and the record keeps the figure it
 * was closed with rather than a blend of then and now.
 */
function sl_tour_history_complete( $user_id ) {
	$history = sl_tour_history( $user_id );
	$changed = false;

	foreach ( $history as $i => $rec ) {
		if ( isset( $rec['ownAvg'] ) || empty( $rec['start'] ) || empty( $rec['end'] ) ) {
			continue;
		}
		$priced = isset( $rec['ownPriced'] ) ? (int) $rec['ownPriced'] : 0;
		$amount = isset( $rec['ownAmount'] ) ? (float) $rec['ownAmount'] : 0.0;
		$avg    = $priced ? $amount / $priced : 0.0;

		$prices = array();
		foreach ( sl_tour_rows( $user_id, $rec['start'], $rec['end'] ) as $r ) {
			$price = sl_own_price( $r );
			if ( null !== $price ) {
				$prices[] = $price;
			}
		}
		if ( count( $prices ) === $priced && abs( array_sum( $prices ) - $amount ) < 0.005 ) {
			$avg = sl_trimmed_mean( $prices );
		}

		$history[ $i ]['ownAvg'] = round( $avg, 2 );
		$changed                 = true;
	}

	if ( $changed ) {
		update_user_meta( $user_id, 'sl_tour_history', $history );
	}
	return $history;
}

function sl_rest_tour_get() {
	return array(
		'open'     => sl_tour_open(),
		'history'  => sl_tour_history_complete( get_current_user_id() ),
		'progress' => sl_tour_progress(),
	);
}

/**
 * Every real ticket in a date range, as the shapes the metric helpers expect.
 */
function sl_tour_rows( $user_id, $start, $end ) {
	global $wpdb;
	$table = sl_table();

	$rows = $wpdb->get_results( // phpcs:ignore WordPress.DB
		$wpdb->prepare(
			"SELECT occurred_on, occurred_at, kind, guest_type, hotel_guest, party_types,
			        limo, outside_driver, self_drive, attendance, outcome, price_mode, amount
			   FROM {$table}
			  WHERE user_id = %d AND is_test = 0 AND occurred_on >= %s AND occurred_on <= %s",
			$user_id,
			$start,
			$end
		),
		ARRAY_A
	);

	return $rows ? $rows : array();
}

/**
 * A ticket's price as it counts toward the person's own figures.
 *
 * One rule, in one place, because this is where the two screens drifted
 * apart before: a price counts only where the visibility was actually
 * chosen — shared or private — and there is a real figure. `!== 'omitted'`
 * looks equivalent and is not: it also lets through a booking whose mode was
 * never set, which the browser has never counted. Returns null when there is
 * no price to count.
 */
function sl_own_price( array $r ) {
	if ( 'booked' !== $r['outcome'] ) {
		return null;
	}
	if ( 'included' !== $r['price_mode'] && 'private' !== $r['price_mode'] ) {
		return null;
	}
	if ( null === $r['amount'] || '' === $r['amount'] || (float) $r['amount'] <= 0 ) {
		return null;
	}
	return (float) $r['amount'];
}

/**
 * Fold a ticket's own money into a bucket.
 *
 * sl_add_metrics() counts only prices shared with the floor, because that is
 * what the Everyone tab means by priced. A person's own tour figures mean
 * something different — their money, shared or not — so the two are tracked
 * separately rather than one being quietly reused for the other.
 */
function sl_add_own_money( array &$m, array $r ) {
	$price = sl_own_price( $r );
	if ( null === $price ) {
		return;
	}
	$m['ownPriced'] = ( isset( $m['ownPriced'] ) ? $m['ownPriced'] : 0 ) + 1;
	$m['ownAmount'] = ( isset( $m['ownAmount'] ) ? $m['ownAmount'] : 0.0 ) + $price;
}

/**
 * The figures for one tour, worked out from the tickets inside it.
 *
 * Deliberately the same helpers the Everyone tab uses, so a tour total and a
 * house total can never be built two different ways and disagree.
 */
function sl_tour_figures( $user_id, $start, $end ) {
	$rows = sl_tour_rows( $user_id, $start, $end );

	$m      = sl_blank_metrics();
	$prices = array();
	$days   = array();
	$weeks  = array();

	foreach ( $rows as $r ) {
		// A person's own tour figures always include their own money, however
		// the pooled-amounts setting is left for the house.
		sl_add_metrics( $m, $r, true );

		$days[ $r['occurred_on'] ] = true;
		sl_add_own_money( $m, $r );

		$price = sl_own_price( $r );
		if ( null !== $price ) {
			$prices[] = $price;
		}

		$wk = sl_week_start_of( $r['occurred_on'] );
		if ( ! isset( $weeks[ $wk ] ) ) {
			$weeks[ $wk ] = sl_blank_metrics();
		}
		sl_add_metrics( $weeks[ $wk ], $r, true );
		// The week rows carry the person's own money too, so the weeks inside
		// a tour add up to the tour's own total. Left on the shared-only
		// figure they were short by every private price.
		sl_add_own_money( $weeks[ $wk ], $r );
	}

	ksort( $weeks );
	$week_list = array();
	foreach ( $weeks as $wk => $wm ) {
		$week_list[] = array_merge(
			array( 'start' => $wk, 'end' => gmdate( 'Y-m-d', strtotime( $wk . ' +6 days' ) ) ),
			sl_numeric( $wm )
		);
	}

	sort( $prices );
	$span = ( strtotime( $end ) - strtotime( $start ) ) / DAY_IN_SECONDS + 1;

	return array_merge(
		sl_numeric( $m ),
		array(
			'start'      => $start,
			'end'        => $end,
			'span'       => (int) round( $span ),
			'activeDays' => count( $days ),
			'ownPriced'  => count( $prices ),
			'ownAmount'  => array_sum( $prices ),
			'ownAvg'     => round( sl_trimmed_mean( $prices ), 2 ),
			'weeks'      => $week_list,
		)
	);
}

/**
 * Wednesday morning to Wednesday night.
 *
 * Named rather than left as a bare 3, so it is findable from either side:
 * the browser holds the same number in WEEK_START_DAY, and the two have to
 * move together or the chart and the totals bucket differently.
 */
const SL_WEEK_START_DAY = 3;   // 0 = Sunday, so 3 = Wednesday

function sl_week_start_of( $date ) {
	$ts   = strtotime( $date );
	$dow  = (int) gmdate( 'w', $ts );
	$back = ( $dow - SL_WEEK_START_DAY + 7 ) % 7;
	return gmdate( 'Y-m-d', strtotime( "-{$back} days", $ts ) );
}

/**
 * A day and a time for a shift start, checked rather than trusted.
 *
 * Returns the pair, or a WP_Error naming what is wrong with it. A start in
 * the future would make "day 3 of the tour" a negative number and would count
 * tickets that have not happened yet, so it is refused rather than clamped —
 * silently moving somebody's date is worse than telling them it is wrong.
 */
function sl_tour_clean_start( $date, $time ) {
	$date = sanitize_text_field( (string) $date );
	$time = sanitize_text_field( (string) $time );

	if ( ! sl_is_real_date( $date ) ) {
		return new WP_Error( 'sl_tour_date', 'That is not a day I can read.', array( 'status' => 400 ) );
	}
	if ( '' === $time ) {
		$time = '00:00';
	}
	if ( ! sl_is_real_time( $time ) ) {
		return new WP_Error( 'sl_tour_time', 'That is not a time I can read.', array( 'status' => 400 ) );
	}

	$today = current_time( 'Y-m-d' );
	$now   = current_time( 'H:i' );

	if ( $date > $today || ( $date === $today && $time > $now ) ) {
		return new WP_Error( 'sl_tour_future', 'A shift cannot start in the future.', array( 'status' => 400 ) );
	}
	// Two years is well past any real tour and stops a mistyped year from
	// dragging thousands of tickets into one shift.
	if ( strtotime( $date ) < strtotime( '-2 years', strtotime( $today ) ) ) {
		return new WP_Error( 'sl_tour_old', 'That is further back than a shift can start.', array( 'status' => 400 ) );
	}

	return array( 'start' => $date, 'startTime' => $time );
}

function sl_rest_tour_start( WP_REST_Request $req ) {
	$user_id = get_current_user_id();

	if ( sl_tour_open( $user_id ) ) {
		return new WP_Error( 'sl_tour_open', 'You are already marked as in the house.', array( 'status' => 409 ) );
	}

	$clean = sl_tour_clean_start(
		$req->get_param( 'start' ) ? $req->get_param( 'start' ) : current_time( 'Y-m-d' ),
		$req->get_param( 'startTime' ) ? $req->get_param( 'startTime' ) : current_time( 'H:i' )
	);
	if ( is_wp_error( $clean ) ) {
		return $clean;
	}

	update_user_meta( $user_id, 'sl_tour_open', array(
		'start'     => $clean['start'],
		'startTime' => $clean['startTime'],
		'goal'      => sl_tour_clean_goal( $req->get_param( 'goal' ) ),
		'openedAt'  => current_time( 'mysql' ),
	) );

	return sl_rest_tour_get();
}

/**
 * A tour goal, in money.
 *
 * Zero and nothing both mean "no goal", which is the ordinary case — a goal
 * is something a person opts into, not a figure they have to invent before
 * they can start work.
 */
function sl_tour_clean_goal( $raw ) {
	if ( null === $raw || '' === $raw ) {
		return null;
	}
	// Typed with a currency symbol, spaces or thousands separators is still a
	// number someone meant. Strip the decoration rather than refusing it.
	$clean = preg_replace( '/[^0-9.]/', '', (string) $raw );
	if ( '' === $clean ) {
		return null;
	}
	$goal = round( (float) $clean, 2 );
	if ( $goal <= 0 ) {
		return null;
	}
	// Cast, because min() of a float and an int hands back the int and the
	// goal then compares unequal to itself depending on which branch it came
	// from. A goal is money; money is a float here throughout.
	return (float) min( $goal, 99999999 );
}

/** Set, change or clear the goal on the shift already running. */
function sl_rest_tour_goal( WP_REST_Request $req ) {
	$user_id = get_current_user_id();
	$open    = sl_tour_open( $user_id );

	if ( ! $open ) {
		return new WP_Error( 'sl_tour_none', 'No shift is running to set a goal on.', array( 'status' => 409 ) );
	}

	$open['goal'] = sl_tour_clean_goal( $req->get_param( 'goal' ) );
	update_user_meta( $user_id, 'sl_tour_open', $open );

	return sl_rest_tour_get();
}

/**
 * What has been booked on the shift in progress, and how it stands against
 * the goal.
 *
 * Worked out on the server rather than in the browser because it is the same
 * question the closed-tour figures answer, and two routes to one number is
 * how the two stop agreeing.
 */
function sl_tour_progress( $user_id = 0 ) {
	$user_id = $user_id ? $user_id : get_current_user_id();
	$open    = sl_tour_open( $user_id );
	if ( ! $open ) {
		return null;
	}

	$today = current_time( 'Y-m-d' );
	$end   = $today < $open['start'] ? $open['start'] : $today;
	$rows  = sl_tour_rows( $user_id, $open['start'], $end );

	$booked = 0;
	$amount = 0.0;
	$priced = 0;
	$prices = array();

	foreach ( $rows as $r ) {
		if ( 'booked' !== $r['outcome'] ) {
			continue;
		}
		$booked++;
		// A person's own total counts their own money, shared or private —
		// through the one helper, so it cannot drift from the tour figures.
		$price = sl_own_price( $r );
		if ( null !== $price ) {
			$priced++;
			$amount += $price;
			$prices[] = $price;
		}
	}

	$goal = isset( $open['goal'] ) ? $open['goal'] : null;
	// The same trimmed average the headline shows. This was the plain mean, so
	// once a tour held ten prices the bar said "at your average of" one figure
	// directly above an Average party showing another.
	$avg  = sl_trimmed_mean( $prices );
	$left = $goal ? max( 0, $goal - $amount ) : 0.0;

	return array(
		'booked'    => $booked,
		'priced'    => $priced,
		'amount'    => round( $amount, 2 ),
		'average'   => round( $avg, 2 ),
		'goal'      => $goal,
		'remaining' => $goal ? round( $left, 2 ) : null,
		// How many more parties at your own average would close the gap. Only
		// meaningful once there is an average to reason from.
		'toGo'      => ( $goal && $left > 0 && $avg > 0 ) ? (int) ceil( $left / $avg ) : 0,
		'reached'   => $goal ? $amount >= $goal : false,
		'pct'       => $goal ? min( 100, round( ( $amount / $goal ) * 100 ) ) : null,
	);
}

/**
 * Correct the dates of a tour that has already closed.
 *
 * The switch gets pressed late, or a day early, or a tour gets closed on the
 * drive home rather than at the end of the last shift. Until now a closed
 * tour was fixed for good, which meant living with a tour that was missing
 * its first night or carrying a day that belonged to the next one.
 *
 * Changing the dates necessarily changes the figures: a tour's numbers are
 * the tickets inside its range, so a different range is a different set of
 * tickets. They are worked out again from the log rather than scaled, and
 * the record keeps its goal and the time it was opened.
 */
function sl_rest_tour_edit( WP_REST_Request $req ) {
	$user_id = get_current_user_id();
	$id      = sanitize_text_field( (string) $req->get_param( 'id' ) );
	$history = sl_tour_history( $user_id );

	$at = null;
	foreach ( $history as $i => $rec ) {
		if ( isset( $rec['id'] ) && (string) $rec['id'] === $id ) {
			$at = $i;
			break;
		}
	}
	if ( null === $at ) {
		return new WP_Error( 'sl_tour_missing', 'That tour is no longer in your history.', array( 'status' => 404 ) );
	}

	$dates = sl_tour_clean_range( $req->get_param( 'start' ), $req->get_param( 'end' ) );
	if ( is_wp_error( $dates ) ) {
		return $dates;
	}

	// A closed tour may not swallow the shift that is running now, or the two
	// would count the same tickets twice over.
	$open = sl_tour_open( $user_id );
	if ( $open && $dates['end'] >= $open['start'] ) {
		return new WP_Error(
			'sl_tour_overlap',
			'That would run into the shift you are on now. End this tour before the ' .
				gmdate( 'j M', strtotime( $open['start'] ) ) . ' or close the current one first.',
			array( 'status' => 409 )
		);
	}

	$was    = $history[ $at ];
	$figures = sl_tour_figures( $user_id, $dates['start'], $dates['end'] );

	$history[ $at ] = array_merge( $figures, array(
		'id'        => $was['id'],
		'goal'      => isset( $was['goal'] ) ? $was['goal'] : null,
		'startTime' => isset( $was['startTime'] ) ? $was['startTime'] : null,
		'openedAt'  => isset( $was['openedAt'] ) ? $was['openedAt'] : null,
		'closedAt'  => isset( $was['closedAt'] ) ? $was['closedAt'] : null,
		'editedAt'  => current_time( 'mysql' ),
	) );

	usort( $history, function ( $a, $b ) {
		return strcmp( $b['start'], $a['start'] );
	} );

	update_user_meta( $user_id, 'sl_tour_history', $history );

	return sl_rest_tour_get();
}

/**
 * A start and an end for a finished tour, checked rather than trusted.
 *
 * Both have to be real dates, the end cannot come before the start, and
 * neither can be in the future — a tour that has not happened yet would
 * report a span longer than the days it could possibly hold.
 */
function sl_tour_clean_range( $start, $end ) {
	$start = sanitize_text_field( (string) $start );
	$end   = sanitize_text_field( (string) $end );

	if ( ! sl_is_real_date( $start ) || ! sl_is_real_date( $end ) ) {
		return new WP_Error( 'sl_tour_bad_date', 'Give the tour a start and an end.', array( 'status' => 400 ) );
	}
	if ( $end < $start ) {
		return new WP_Error( 'sl_tour_backwards', 'A tour cannot end before it started.', array( 'status' => 400 ) );
	}

	$today = current_time( 'Y-m-d' );
	if ( $start > $today || $end > $today ) {
		return new WP_Error( 'sl_tour_future', 'A tour cannot run into the future.', array( 'status' => 400 ) );
	}

	return array( 'start' => $start, 'end' => $end );
}

/**
 * Correct the start of the shift already running.
 *
 * Somebody arrives, works for three hours, then remembers the switch. The
 * start is a statement about when the shift began, not about when the button
 * was pressed, so it has to be correctable — otherwise the first hours of
 * every forgotten tour fall outside it.
 */
function sl_rest_tour_adjust( WP_REST_Request $req ) {
	$user_id = get_current_user_id();
	$open    = sl_tour_open( $user_id );

	if ( ! $open ) {
		return new WP_Error( 'sl_tour_none', 'No shift is running to adjust.', array( 'status' => 409 ) );
	}

	$clean = sl_tour_clean_start( $req->get_param( 'start' ), $req->get_param( 'startTime' ) );
	if ( is_wp_error( $clean ) ) {
		return $clean;
	}

	update_user_meta( $user_id, 'sl_tour_open', array_merge( $open, array(
		'start'      => $clean['start'],
		'startTime'  => $clean['startTime'],
		'adjustedAt' => current_time( 'mysql' ),
	) ) );

	return sl_rest_tour_get();
}

/**
 * Close the tour: work the numbers out, keep them, and move it to history.
 */
function sl_rest_tour_end( WP_REST_Request $req ) {
	$user_id = get_current_user_id();
	$open    = sl_tour_open( $user_id );

	if ( ! $open ) {
		return new WP_Error( 'sl_tour_none', 'You are not marked as in the house.', array( 'status' => 409 ) );
	}

	$end = sanitize_text_field( (string) $req->get_param( 'end' ) );
	if ( ! sl_is_real_date( $end ) ) {
		$end = current_time( 'Y-m-d' );
	}
	// A tour cannot end before it started, however the clock or the timezone
	// is behaving.
	if ( $end < $open['start'] ) {
		$end = $open['start'];
	}

	$figures = sl_tour_figures( $user_id, $open['start'], $end );

	$record = array_merge( $figures, array(
		'id'        => (string) time() . '-' . wp_rand( 100, 999 ),
		'goal'      => isset( $open['goal'] ) ? $open['goal'] : null,
		'startTime' => isset( $open['startTime'] ) ? $open['startTime'] : null,
		'openedAt'  => isset( $open['openedAt'] ) ? $open['openedAt'] : null,
		'closedAt'  => current_time( 'mysql' ),
	) );

	$history   = sl_tour_history( $user_id );
	$history[] = $record;

	// Newest first, and a ceiling so this cannot grow without limit.
	usort( $history, function ( $a, $b ) {
		return strcmp( $b['start'], $a['start'] );
	} );
	$history = array_slice( $history, 0, 60 );

	update_user_meta( $user_id, 'sl_tour_history', $history );
	delete_user_meta( $user_id, 'sl_tour_open' );

	return array_merge( sl_rest_tour_get(), array( 'closed' => $record ) );
}

/** Reopen the most recent tour, for a toggle pressed by mistake. */
function sl_rest_tour_reopen() {
	$user_id = get_current_user_id();

	if ( sl_tour_open( $user_id ) ) {
		return new WP_Error( 'sl_tour_open', 'A tour is already open.', array( 'status' => 409 ) );
	}

	$history = sl_tour_history( $user_id );
	if ( ! $history ) {
		return new WP_Error( 'sl_tour_none', 'No tour to reopen.', array( 'status' => 404 ) );
	}

	$last = array_shift( $history );
	update_user_meta( $user_id, 'sl_tour_history', $history );
	update_user_meta( $user_id, 'sl_tour_open', array(
		'start'     => $last['start'],
		'goal'      => isset( $last['goal'] ) ? $last['goal'] : null,
		'startTime' => isset( $last['startTime'] ) ? $last['startTime'] : null,
		'openedAt'  => isset( $last['openedAt'] ) ? $last['openedAt'] : current_time( 'mysql' ),
	) );

	return sl_rest_tour_get();
}

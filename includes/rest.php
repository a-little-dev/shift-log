<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const SL_NS = 'shift-log/v1';

/* ---------------------------------------------------------------- */
/*  Whitelists — every value written to the DB must appear here.     */
/* ---------------------------------------------------------------- */
function sl_enums() {
	return array(
		'kind'           => array( 'appointment', 'request', 'lineup', 'bar', 'pull' ),
		'limo'           => array( 'yes', 'no', 'unknown' ),
		'outside_driver' => array( 'yes', 'no', 'unknown' ),
		'self_drive'     => array( 'yes', 'no', 'unknown' ),
		'attendance'     => array( 'showed', 'noshow' ),
		'outcome'        => array( 'booked', 'notbooked' ),
		'guest_type'     => array( 'new', 'returning', 'house', 'unknown' ),
		'hotel_guest'    => array( 'yes', 'no', 'unknown' ),
		'price_mode'     => array( 'included', 'private', 'omitted' ),
	);
}

/**
 * The party-type vocabulary. Keys are stored; labels are display only.
 * Nothing outside this map can ever reach the column.
 */
function sl_party_types() {
	return array(
		'gfe'       => 'GFE',
		'pse'       => 'PSE',
		'bdsm'      => 'BDSM / Kink',
		'roleplay'  => 'Roleplay',
		'two_girl'  => '2-girl',
		'virgin'    => 'Virgin',
		'couple'    => 'Couple',
		'nuru'      => 'Nuru',
		'overnight' => 'Overnight',
		'straight'  => 'Straight sex',
		'bj'        => 'Blow job',
	);
}

/** Accepts an array or a comma string; returns a clean comma list or null. */
function sl_clean_party_types( $value ) {
	$allowed = array_keys( sl_party_types() );
	$given   = is_array( $value ) ? $value : explode( ',', (string) $value );
	$clean   = array();

	foreach ( $given as $one ) {
		$one = sanitize_key( trim( (string) $one ) );
		if ( in_array( $one, $allowed, true ) && ! in_array( $one, $clean, true ) ) {
			$clean[] = $one;
		}
	}

	// Keep the stored order stable so the column reads predictably.
	$ordered = array_values( array_intersect( $allowed, $clean ) );
	return $ordered ? implode( ',', $ordered ) : null;
}

function sl_clean_enum( $field, $value ) {
	$enums = sl_enums();
	if ( ! isset( $enums[ $field ] ) ) {
		return null;
	}
	$value = sanitize_text_field( (string) $value );
	return in_array( $value, $enums[ $field ], true ) ? $value : null;
}

function sl_trim( $text, $len ) {
	return function_exists( 'mb_substr' ) ? mb_substr( $text, 0, $len ) : substr( $text, 0, $len );
}

function sl_can_submit() {
	return is_user_logged_in() && current_user_can( SL_CAP_SUBMIT );
}

function sl_can_house() {
	return is_user_logged_in() && current_user_can( SL_CAP_HOUSE );
}

function sl_register_routes() {
	register_rest_route( SL_NS, '/tickets', array(
		array(
			'methods'             => 'GET',
			'callback'            => 'sl_rest_list',
			'permission_callback' => 'sl_can_submit',
		),
		array(
			'methods'             => 'POST',
			'callback'            => 'sl_rest_create',
			'permission_callback' => 'sl_can_submit',
		),
	) );

	register_rest_route( SL_NS, '/tickets/(?P<id>\d+)', array(
		array(
			'methods'             => 'PUT, PATCH',
			'callback'            => 'sl_rest_update',
			'permission_callback' => 'sl_can_submit',
			'args'                => array(
				'id' => array( 'sanitize_callback' => 'absint' ),
			),
		),
		array(
			'methods'             => 'DELETE',
			'callback'            => 'sl_rest_delete',
			'permission_callback' => 'sl_can_submit',
			'args'                => array(
				'id' => array( 'sanitize_callback' => 'absint' ),
			),
		),
	) );

	register_rest_route( SL_NS, '/stats/house', array(
		'methods'             => 'GET',
		'callback'            => 'sl_rest_house',
		'permission_callback' => 'sl_can_house',
	) );

	// Anyone who can log a ticket can report a fault in the thing they log it
	// with. Reading them is a separate matter, and does not happen over REST.
	register_rest_route( SL_NS, '/bugs', array(
		'methods'             => 'POST',
		'callback'            => 'sl_rest_bug_create',
		'permission_callback' => 'sl_can_submit',
	) );

	/* Declaring a tour: in the house, and out of it again. */
	register_rest_route( SL_NS, '/tour', array(
		'methods'             => 'GET',
		'callback'            => 'sl_rest_tour_get',
		'permission_callback' => 'sl_can_submit',
	) );
	register_rest_route( SL_NS, '/tour/start', array(
		'methods'             => 'POST',
		'callback'            => 'sl_rest_tour_start',
		'permission_callback' => 'sl_can_submit',
	) );
	register_rest_route( SL_NS, '/tour/goal', array(
		'methods'             => 'POST',
		'callback'            => 'sl_rest_tour_goal',
		'permission_callback' => 'sl_can_submit',
	) );
	register_rest_route( SL_NS, '/tour/adjust', array(
		'methods'             => 'POST',
		'callback'            => 'sl_rest_tour_adjust',
		'permission_callback' => 'sl_can_submit',
	) );
	register_rest_route( SL_NS, '/tour/edit', array(
		'methods'             => 'POST',
		'callback'            => 'sl_rest_tour_edit',
		'permission_callback' => 'sl_can_submit',
	) );
	register_rest_route( SL_NS, '/tour/end', array(
		'methods'             => 'POST',
		'callback'            => 'sl_rest_tour_end',
		'permission_callback' => 'sl_can_submit',
	) );
	register_rest_route( SL_NS, '/tour/reopen', array(
		'methods'             => 'POST',
		'callback'            => 'sl_rest_tour_reopen',
		'permission_callback' => 'sl_can_submit',
	) );

	/* The panel behind the logo. Unlocking is open to any signed-in account
	   because it is the password that decides, not the session; everything
	   the panel then reads or changes requires that unlock to have happened. */
	register_rest_route( SL_NS, '/admin/unlock', array(
		'methods'             => 'POST',
		'callback'            => 'sl_rest_admin_unlock',
		'permission_callback' => 'is_user_logged_in',
	) );
	register_rest_route( SL_NS, '/admin/lock', array(
		'methods'             => 'POST',
		'callback'            => 'sl_rest_admin_lock',
		'permission_callback' => 'is_user_logged_in',
	) );
	register_rest_route( SL_NS, '/admin/whoami', array(
		'methods'             => 'GET',
		'callback'            => 'sl_rest_admin_whoami',
		'permission_callback' => 'is_user_logged_in',
	) );
	register_rest_route( SL_NS, '/admin/data', array(
		'methods'             => 'GET',
		'callback'            => 'sl_rest_admin_data',
		'permission_callback' => 'sl_admin_can',
	) );
	register_rest_route( SL_NS, '/admin/bug', array(
		'methods'             => 'POST',
		'callback'            => 'sl_rest_admin_bug',
		'permission_callback' => 'sl_admin_can',
	) );
}

/* ---------------------------------------------------------------- */
/*  Own tickets                                                     */
/* ---------------------------------------------------------------- */
function sl_rest_list( WP_REST_Request $req ) {
	global $wpdb;
	$table = sl_table();
	$uid   = get_current_user_id();

	// The user_id clause is the whole ballgame: there is no code path in this
	// plugin that returns another person's ticket rows.
	$rows = $wpdb->get_results(
		$wpdb->prepare(
			"SELECT id, occurred_on, occurred_at, kind, limo, outside_driver, self_drive, hotel_guest,
			        attendance, outcome, guest_type, party_types, private_note, is_test, price_mode, amount, reason
			   FROM {$table}
			  WHERE user_id = %d
			  ORDER BY occurred_on DESC, occurred_at DESC, id DESC
			  LIMIT 2000",
			$uid
		),
		ARRAY_A
	);

	return rest_ensure_response( array(
		'handle'  => sl_get_handle( $uid ),
		'party'   => sl_party_types(),
		'tickets' => array_map( 'sl_shape_ticket', $rows ?: array() ),
	) );
}

function sl_shape_ticket( $row ) {
	return array(
		'id'         => (int) $row['id'],
		'date'       => $row['occurred_on'],
		'time'       => substr( $row['occurred_at'], 0, 5 ),
		'kind'       => sl_kind_of( $row ),
		'limo'       => $row['limo'],
		'outside'    => $row['outside_driver'],
		'selfDrive'  => $row['self_drive'],
		'hotelGuest' => $row['hotel_guest'],
		'attendance' => $row['attendance'],
		'outcome'    => $row['outcome'],
		'guestType'  => $row['guest_type'],
		'isTest'     => ! empty( $row['is_test'] ),
		'partyTypes' => $row['party_types'] ? explode( ',', $row['party_types'] ) : array(),
		'note'       => $row['private_note'],
		'priceMode'  => $row['price_mode'],
		'amount'     => null === $row['amount'] ? '' : (float) $row['amount'],
		'reason'     => $row['reason'],
	);
}

/**
 * Everything a ticket needs, cleaned and made consistent.
 *
 * Creating and editing run through this same function, so a rule can never
 * hold on one path and not the other — an edit cannot turn a bar walk-in into
 * a no-show any more than a fresh ticket can.
 *
 * @return array|WP_Error
 */
function sl_ticket_from_request( WP_REST_Request $req ) {
	$date = sanitize_text_field( (string) $req->get_param( 'date' ) );
	$time = sanitize_text_field( (string) $req->get_param( 'time' ) );

	// The shape alone is not enough: 2026-02-31 and 25:99 both have the right
	// shape, and both used to be saved. A ticket on a day that does not exist
	// belongs to no week and no tour, so it vanished from every figure.
	if ( ! sl_is_real_date( $date ) || ! sl_is_real_time( $time ) ) {
		return new WP_Error( 'sl_bad_datetime', 'Add a valid day and time.', array( 'status' => 400 ) );
	}
	// Compared as plain dates on the site's own clock, with a day's grace for
	// a phone whose clock runs ahead of the server's.
	if ( $date > gmdate( 'Y-m-d', strtotime( current_time( 'Y-m-d' ) . ' +1 day' ) ) ) {
		return new WP_Error( 'sl_future', 'That date is in the future.', array( 'status' => 400 ) );
	}

	$attendance = sl_clean_enum( 'attendance', $req->get_param( 'attendance' ) );
	$outcome    = sl_clean_enum( 'outcome', $req->get_param( 'outcome' ) );
	$price_mode = sl_clean_enum( 'price_mode', $req->get_param( 'price_mode' ) );
	$amount     = $req->get_param( 'amount' );
	$reason     = sanitize_textarea_field( (string) $req->get_param( 'reason' ) );
	$guest_type = sl_clean_enum( 'guest_type', $req->get_param( 'guest_type' ) );
	$party      = sl_clean_party_types( $req->get_param( 'party_types' ) );
	$note       = sanitize_textarea_field( (string) $req->get_param( 'note' ) );

	// Only a booked appointment can fail to show. A request, a lineup pick, a
	// walk-in from the bar and a pull-in all mean the guest is already
	// standing there, so attendance is forced rather than trusted.
	$kind = sl_clean_enum( 'kind', $req->get_param( 'kind' ) );
	$kind = $kind ? $kind : 'appointment';
	if ( 'appointment' !== $kind ) {
		$attendance = 'showed';
	}

	if ( 'noshow' === $attendance ) {
		$outcome    = null;
		$price_mode = null;
		$amount     = null;
		$reason     = '';
	}
	if ( 'booked' !== $outcome ) {
		$price_mode = null;
		$amount     = null;
	}
	if ( 'omitted' === $price_mode ) {
		$amount = null;
	}
	if ( 'notbooked' !== $outcome ) {
		$reason = '';
	}

	$amount = sl_clean_amount( $amount );
	if ( null !== $amount && $amount > 99999999 ) {
		return new WP_Error( 'sl_amount', 'That amount is out of range.', array( 'status' => 400 ) );
	}
	// A booking that asked to add its price but carries no real figure has no
	// price. Say so in the record, rather than leaving a ticket that claims
	// to be shared or private with nothing behind the claim.
	if ( null === $amount && in_array( $price_mode, array( 'included', 'private' ), true ) ) {
		$price_mode = 'omitted';
	}

	// Transport is a single choice. If more than one arrives marked yes, keep
	// the first and clear the rest.
	$transport = array(
		'limo'           => sl_clean_enum( 'limo', $req->get_param( 'limo' ) ),
		'outside_driver' => sl_clean_enum( 'outside_driver', $req->get_param( 'outside' ) ),
		'self_drive'     => sl_clean_enum( 'self_drive', $req->get_param( 'self_drive' ) ),
	);
	$seen_yes = false;
	foreach ( $transport as $field => $value ) {
		if ( 'yes' === $value ) {
			if ( $seen_yes ) {
				$transport[ $field ] = 'no';
			}
			$seen_yes = true;
		}
	}

	// A test ticket behaves exactly like a real one — it saves, it edits, it
	// shows in the log — but every aggregate query filters it out, so nobody
	// has to remember to clean up after trying the site.
	$is_test = rest_sanitize_boolean( $req->get_param( 'is_test' ) ) ? 1 : 0;

	return array(
		'occurred_on'    => $date,
		'occurred_at'    => $time . ':00',
		'kind'           => $kind,
		'limo'           => $transport['limo'],
		'outside_driver' => $transport['outside_driver'],
		'self_drive'     => $transport['self_drive'],
		'attendance'     => $attendance,
		'outcome'        => $outcome,
		'guest_type'     => $guest_type,
		'hotel_guest'    => sl_clean_enum( 'hotel_guest', $req->get_param( 'hotel_guest' ) ),
		'party_types'    => $party,
		'private_note'   => sl_trim( trim( $note ), 4000 ),
		'is_test'        => $is_test,
		'price_mode'     => $price_mode,
		'amount'         => $amount,
		'reason'         => sl_trim( $reason, 2000 ),
	);
}

/** A date that exists on the calendar, not just one shaped like a date. */
function sl_is_real_date( $date ) {
	if ( ! preg_match( '/^(\d{4})-(\d{2})-(\d{2})$/', (string) $date, $m ) ) {
		return false;
	}
	return checkdate( (int) $m[2], (int) $m[3], (int) $m[1] );
}

/** A time on the clock: 00:00 to 23:59. */
function sl_is_real_time( $time ) {
	if ( ! preg_match( '/^(\d{2}):(\d{2})$/', (string) $time, $m ) ) {
		return false;
	}
	return (int) $m[1] < 24 && (int) $m[2] < 60;
}

/**
 * A typed price, read the way it was meant.
 *
 * The box takes whatever is typed, and people type "1,400" and "$1,400".
 * PHP's (float) stops at the first character it does not recognise, so
 * "1,400" was being saved as 1 — a $1,400 party recorded as one dollar,
 * and counted in every average as one dollar. Separators and symbols are
 * removed first; what is left has to be a number above zero, or there is
 * no price at all.
 *
 * @return float|null
 */
function sl_clean_amount( $raw ) {
	if ( null === $raw || is_bool( $raw ) || is_array( $raw ) ) {
		return null;
	}
	$clean = preg_replace( '/[^0-9.]/', '', (string) $raw );
	if ( '' === $clean || ! is_numeric( $clean ) ) {
		return null;
	}
	$value = round( (float) $clean, 2 );
	return $value > 0 ? $value : null;
}

/**
 * What type each column is written as.
 *
 * Keyed by column rather than by position. The positional list this replaces
 * had to be kept in step with the order sl_ticket_from_request happens to
 * return its fields in, and when hotel_guest was added the list was not
 * lengthened — so every format after it shifted by one. private_note was
 * written as an integer and price_mode as a float, which meant a saved ticket
 * lost its note and had its price visibility replaced with 0. A ticket edited
 * after that showed no amount field at all, because "0" is not a visibility
 * the form knows.
 *
 * Derived from the field names now, so adding a column cannot move anything
 * else.
 */
function sl_column_formats() {
	return array(
		'user_id'        => '%d',
		'occurred_on'    => '%s',
		'occurred_at'    => '%s',
		'kind'           => '%s',
		'limo'           => '%s',
		'outside_driver' => '%s',
		'self_drive'     => '%s',
		'hotel_guest'    => '%s',
		'attendance'     => '%s',
		'outcome'        => '%s',
		'guest_type'     => '%s',
		'party_types'    => '%s',
		'private_note'   => '%s',
		'is_test'        => '%d',
		'price_mode'     => '%s',
		'amount'         => '%f',
		'reason'         => '%s',
		'created_at'     => '%s',
	);
}

/** The formats for one row, in that row's own order. */
function sl_ticket_formats( array $fields ) {
	$map = sl_column_formats();
	$out = array();
	foreach ( array_keys( $fields ) as $col ) {
		$out[] = isset( $map[ $col ] ) ? $map[ $col ] : '%s';
	}
	return $out;
}

function sl_rest_create( WP_REST_Request $req ) {
	global $wpdb;

	$fields = sl_ticket_from_request( $req );
	if ( is_wp_error( $fields ) ) {
		return $fields;
	}

	$row = array_merge(
		array( 'user_id' => get_current_user_id() ),
		$fields,
		array( 'created_at' => current_time( 'mysql' ) )
	);
	$formats = sl_ticket_formats( $row );

	if ( ! $wpdb->insert( sl_table(), $row, $formats ) ) {
		return new WP_Error( 'sl_save_failed', 'Could not save the ticket.', array( 'status' => 500 ) );
	}

	sl_flush_house_cache();

	return rest_ensure_response( sl_fetch_own_ticket( $wpdb->insert_id ) );
}

/**
 * Edit a ticket. Scoped to its author exactly as reading and deleting are —
 * the WHERE clause carries the user id, so a crafted request naming somebody
 * else's ticket updates nothing.
 */
function sl_rest_update( WP_REST_Request $req ) {
	global $wpdb;

	$id  = absint( $req->get_param( 'id' ) );
	$uid = get_current_user_id();

	$exists = $wpdb->get_var( $wpdb->prepare( 'SELECT id FROM ' . sl_table() . ' WHERE id = %d AND user_id = %d', $id, $uid ) );
	if ( ! $exists ) {
		return new WP_Error( 'sl_not_found', 'No such ticket on your log.', array( 'status' => 404 ) );
	}

	$fields = sl_ticket_from_request( $req );
	if ( is_wp_error( $fields ) ) {
		return $fields;
	}

	$updated = $wpdb->update(
		sl_table(),
		$fields,
		array( 'id' => $id, 'user_id' => $uid ),
		sl_ticket_formats( $fields ),
		array( '%d', '%d' )
	);

	if ( false === $updated ) {
		return new WP_Error( 'sl_save_failed', 'Could not update the ticket.', array( 'status' => 500 ) );
	}

	sl_flush_house_cache();

	return rest_ensure_response( sl_fetch_own_ticket( $id ) );
}

/** Read one row back, still scoped to its author. */
function sl_fetch_own_ticket( $id ) {
	global $wpdb;
	$row = $wpdb->get_row(
		$wpdb->prepare( 'SELECT * FROM ' . sl_table() . ' WHERE id = %d AND user_id = %d', $id, get_current_user_id() ),
		ARRAY_A
	);
	return $row ? sl_shape_ticket( $row ) : null;
}

function sl_rest_delete( WP_REST_Request $req ) {
	global $wpdb;
	$deleted = $wpdb->delete(
		sl_table(),
		array( 'id' => absint( $req->get_param( 'id' ) ), 'user_id' => get_current_user_id() ),
		array( '%d', '%d' )
	);

	if ( ! $deleted ) {
		return new WP_Error( 'sl_not_found', 'No such ticket on your log.', array( 'status' => 404 ) );
	}

	sl_flush_house_cache();

	return rest_ensure_response( array( 'deleted' => true ) );
}

/* ---------------------------------------------------------------- */
/*  House view — aggregates only, never rows                        */
/* ---------------------------------------------------------------- */

/**
 * Segment membership, as predicates rather than SQL.
 *
 * This used to be twenty SQL conditions, each run as its own query — twenty-two
 * full scans of the table for one page load, which is what made the Everyone
 * tab slow. The whole view is now built from a single pass, so these are
 * closures tested against a row in PHP instead.
 */
function sl_segment_matchers() {
	$no_transport = function ( $r ) {
		return 'yes' !== $r['limo'] && 'yes' !== $r['outside_driver'] && 'yes' !== $r['self_drive'];
	};
	$any_unknown = function ( $r ) {
		return 'unknown' === $r['limo'] || 'unknown' === $r['outside_driver'] || 'unknown' === $r['self_drive'];
	};

	$out = array(
		'Appointments'               => function ( $r ) { return 'appointment' === sl_kind_of( $r ); },
		'Requests / walk-ins'        => function ( $r ) { return 'request' === sl_kind_of( $r ); },
		'Picked from lineup'         => function ( $r ) { return 'lineup' === sl_kind_of( $r ); },
		'Walk-in from bar'           => function ( $r ) { return 'bar' === sl_kind_of( $r ); },
		'Pull-ins'                   => function ( $r ) { return 'pull' === sl_kind_of( $r ); },
		'New guests'                 => function ( $r ) { return 'new' === $r['guest_type']; },
		'Returning to them'          => function ( $r ) { return 'returning' === $r['guest_type']; },
		'New to them, house regular' => function ( $r ) { return 'house' === $r['guest_type']; },
		'Guest history unknown'      => function ( $r ) { return ! $r['guest_type'] || 'unknown' === $r['guest_type']; },
	);

	foreach ( sl_party_types() as $key => $label ) {
		$out[ $label ] = function ( $r ) use ( $key ) {
			return $r['party_types'] && in_array( $key, explode( ',', $r['party_types'] ), true );
		};
	}

	$out['Limo']                   = function ( $r ) { return 'yes' === $r['limo']; };
	$out['Outside driver']         = function ( $r ) { return 'yes' === $r['outside_driver']; };
	$out['Self drive']             = function ( $r ) { return 'yes' === $r['self_drive']; };
	$out['Hotel guests']           = function ( $r ) { return 'yes' === $r['hotel_guest']; };
	$out['Not hotel guests']       = function ( $r ) { return 'no' === $r['hotel_guest']; };
	$out['Transport unknown']      = function ( $r ) use ( $no_transport, $any_unknown ) { return $no_transport( $r ) && $any_unknown( $r ); };
	$out['Transport not recorded'] = function ( $r ) use ( $no_transport, $any_unknown ) { return $no_transport( $r ) && ! $any_unknown( $r ); };

	return $out;
}

/**
 * What kind of ticket this is, for counting purposes.
 *
 * Rows written before the kind column was always populated hold null or an
 * empty string. Those were counted as appointments in the ticket mix but
 * excluded from appointment attendance, which is how the pooled view came to
 * report 100% kept while no-shows were plainly visible elsewhere. Anything
 * that is not one of the four walk-in kinds is an appointment, everywhere.
 */
function sl_kind_of( $row ) {
	$kind = isset( $row['kind'] ) ? $row['kind'] : '';
	return in_array( $kind, array( 'request', 'lineup', 'bar', 'pull' ), true ) ? $kind : 'appointment';
}

/**
 * Attendance, with the same rule the write path enforces applied on read.
 *
 * Only an appointment can fail to show. A walk-in marked as a no-show is a row
 * from before that was enforced; counting it would make the overall no-show
 * figure disagree with the appointment one.
 */
function sl_attendance_of( $row, $kind ) {
	$att = isset( $row['attendance'] ) ? $row['attendance'] : null;
	if ( 'appointment' !== $kind && 'noshow' === $att ) {
		return 'showed';
	}
	return $att;
}

/**
 * A ticket's price as it counts toward the floor's shared figures.
 *
 * The counterpart to sl_own_price(): that one is a person's own money,
 * shared or private; this one is only what was shared with everyone. Named
 * once for the same reason — written out by hand it kept drifting, and the
 * `priced` count and the price distribution ended up disagreeing about which
 * bookings they were describing. Returns null when there is nothing to count.
 */
function sl_shared_price( array $r ) {
	if ( 'booked' !== $r['outcome'] || 'included' !== $r['price_mode'] ) {
		return null;
	}
	// `null !== $amount` also lets through an empty string and a zero, which
	// join the count while adding nothing to the total.
	if ( null === $r['amount'] || '' === $r['amount'] || (float) $r['amount'] <= 0 ) {
		return null;
	}
	return (float) $r['amount'];
}

function sl_blank_metrics() {
	return array(
		'n' => 0, 'appt' => 0, 'req' => 0, 'lineup' => 0, 'bar' => 0, 'pull' => 0,
		'g_new' => 0, 'g_ret' => 0, 'g_house' => 0, 'g_unknown' => 0,
		'showed' => 0, 'noshow' => 0, 'a_showed' => 0, 'a_noshow' => 0,
		'booked' => 0, 'notbooked' => 0, 'priced' => 0, 'omitted' => 0, 'amount' => 0.0,
	);
}

/** Fold one ticket into a bucket. */
function sl_add_metrics( array &$m, array $r, $with_money ) {
	$m['n']++;

	// One reading of the kind, used for every count below, so the mix and the
	// attendance figures can never disagree about what a ticket is.
	$kind = sl_kind_of( $r );
	$att  = sl_attendance_of( $r, $kind );

	if ( 'request' === $kind ) {
		$m['req']++;
	} elseif ( 'lineup' === $kind ) {
		$m['lineup']++;
	} elseif ( 'bar' === $kind ) {
		$m['bar']++;
	} elseif ( 'pull' === $kind ) {
		$m['pull']++;
	} else {
		$m['appt']++;
	}

	if ( 'new' === $r['guest_type'] ) {
		$m['g_new']++;
	} elseif ( 'returning' === $r['guest_type'] ) {
		$m['g_ret']++;
	} elseif ( 'house' === $r['guest_type'] ) {
		$m['g_house']++;
	} else {
		$m['g_unknown']++;
	}

	if ( 'showed' === $att ) {
		$m['showed']++;
	}
	if ( 'noshow' === $att ) {
		$m['noshow']++;
	}

	// Only an appointment can fail to show, so only appointments count here.
	if ( 'appointment' === $kind ) {
		if ( 'showed' === $att ) {
			$m['a_showed']++;
		}
		if ( 'noshow' === $att ) {
			$m['a_noshow']++;
		}
	}

	if ( 'booked' === $r['outcome'] ) {
		$m['booked']++;
		// A figure has to be an actual figure. `null !== $amount` also lets
		// through an empty string and a zero, which counted the booking as
		// priced and then added nothing to the total — so every average on
		// the Everyone tab was divided by a count larger than the money in
		// it. The browser has always required a real amount; this is the
		// same rule, so the two screens agree on what "priced" means.
		$shared = sl_shared_price( $r );
		if ( null !== $shared ) {
			// priced and amount move together, always. Counting a booking as
			// priced while withholding its money leaves every average on the
			// Everyone tab dividing a short total by a full count — a real
			// figure made from an incomplete one, which is worse than no
			// figure at all. When pooled amounts are off, such a booking is
			// counted the same way as one whose price was kept private.
			if ( $with_money ) {
				$m['priced']++;
				$m['amount'] += $shared;
			} else {
				$m['omitted']++;
			}
		} else {
			$m['omitted']++;
		}
	}
	if ( 'notbooked' === $r['outcome'] ) {
		$m['notbooked']++;
	}
}

/**
 * What the shared prices look like as a distribution rather than a total.
 *
 * The plain average is dragged around by one unusual night, in either
 * direction, so the headline figure is a trimmed mean: the top and bottom
 * tenth are set aside and the rest averaged. That is the standard way to
 * describe a typical value when the tails are noisy, and with a handful of
 * prices there is nothing to trim, so it falls back to the plain mean.
 *
 * Deliberately absent: the highest and lowest single prices. On a small floor
 * those identify one person's night, and a house-wide view should not.
 */
function sl_price_stats( array $amounts ) {
	sort( $amounts, SORT_NUMERIC );
	$n = count( $amounts );

	$empty = array(
		'n' => 0, 'mean' => 0, 'trimmed' => 0, 'median' => 0,
		'p25' => 0, 'p75' => 0, 'topShare' => 0, 'trimmedFrom' => 0,
	);
	if ( ! $n ) {
		return $empty;
	}

	// Read between neighbours, the way a spreadsheet's PERCENTILE does. Taking
	// the nearest lower price instead pulled every quartile down on a short
	// list — on four prices the "three-quarter mark" was the third of four.
	$at = function ( $q ) use ( $amounts, $n ) {
		$pos = $q * ( $n - 1 );
		$lo  = (int) floor( $pos );
		$hi  = (int) ceil( $pos );
		return (float) $amounts[ $lo ] + ( (float) $amounts[ $hi ] - (float) $amounts[ $lo ] ) * ( $pos - $lo );
	};

	$sum  = array_sum( $amounts );
	$mean = $sum / $n;

	// Trim a tenth from each end, but only once there is enough to trim.
	$cut     = ( $n >= 10 ) ? (int) floor( $n * 0.1 ) : 0;
	$core    = $cut ? array_slice( $amounts, $cut, $n - 2 * $cut ) : $amounts;
	$trimmed = count( $core ) ? array_sum( $core ) / count( $core ) : $mean;

	// How much of the takings the busiest tenth of prices accounts for.
	$top_n     = max( 1, (int) round( $n * 0.1 ) );
	$top_slice = array_slice( $amounts, -$top_n );
	$top_share = $sum > 0 ? array_sum( $top_slice ) / $sum : 0;

	return array(
		'n'           => $n,
		'mean'        => round( $mean, 2 ),
		'trimmed'     => round( $trimmed, 2 ),
		'median'      => round( $at( 0.5 ), 2 ),
		'p25'         => round( $at( 0.25 ), 2 ),
		'p75'         => round( $at( 0.75 ), 2 ),
		'topShare'    => round( $top_share, 4 ),
		'trimmedFrom' => $cut * 2,
	);
}

function sl_house_cache_key() {
	return 'sl_house_' . ( '1' === get_option( 'sl_house_amounts', '1' ) ? 'money' : 'rates' );
}

/** Called whenever a ticket is written, so the pooled view is never stale. */
function sl_flush_house_cache() {
	delete_transient( 'sl_house_money' );
	delete_transient( 'sl_house_rates' );
}

function sl_rest_house( WP_REST_Request $req ) {
	global $wpdb;

	$cached = get_transient( sl_house_cache_key() );
	if ( is_array( $cached ) ) {
		return rest_ensure_response( $cached );
	}

	$table      = sl_table();
	$with_money = '1' === get_option( 'sl_house_amounts', '1' );

	/* One pass. Only the columns the figures need, and only real tickets. */
	$rows = $wpdb->get_results(
		"SELECT occurred_on, occurred_at, kind, guest_type, hotel_guest, party_types, limo, outside_driver, self_drive,
		        attendance, outcome, price_mode, amount
		   FROM {$table}
		  WHERE is_test = 0",
		ARRAY_A
	);
	$rows = $rows ? $rows : array();

	$matchers = sl_segment_matchers();
	$totals   = sl_blank_metrics();
	$by_day   = array();
	$by_hour  = array();
	$by_dow   = array();
	$amounts  = array();
	$segments = array();
	foreach ( $matchers as $label => $unused ) {
		$segments[ $label ] = sl_blank_metrics();
	}

	foreach ( $rows as $r ) {
		sl_add_metrics( $totals, $r, $with_money );

		$day = $r['occurred_on'];
		if ( ! isset( $by_day[ $day ] ) ) {
			$by_day[ $day ] = sl_blank_metrics();
		}
		sl_add_metrics( $by_day[ $day ], $r, $with_money );

		$hour = (int) substr( (string) $r['occurred_at'], 0, 2 );
		if ( ! isset( $by_hour[ $hour ] ) ) {
			$by_hour[ $hour ] = sl_blank_metrics();
		}
		sl_add_metrics( $by_hour[ $hour ], $r, $with_money );

		$dow = (int) gmdate( 'w', strtotime( $day ) );
		if ( ! isset( $by_dow[ $dow ] ) ) {
			$by_dow[ $dow ] = sl_blank_metrics();
		}
		sl_add_metrics( $by_dow[ $dow ], $r, $with_money );

		// The same rule the priced count uses, so the distribution describes
		// exactly the bookings the totals do.
		$shared_price = sl_shared_price( $r );
		if ( null !== $shared_price ) {
			$amounts[] = $shared_price;
		}

		foreach ( $matchers as $label => $matches ) {
			if ( $matches( $r ) ) {
				sl_add_metrics( $segments[ $label ], $r, $with_money );
			}
		}
	}

	ksort( $by_day );
	$days = array();
	foreach ( $by_day as $date => $m ) {
		$days[] = array_merge( array( 'date' => $date ), sl_numeric( $m ) );
	}

	$segment_list = array();
	foreach ( $segments as $label => $m ) {
		if ( $m['n'] > 0 ) {
			$segment_list[] = array_merge( array( 'name' => $label ), sl_numeric( $m ) );
		}
	}

	$hours = array();
	ksort( $by_hour );
	foreach ( $by_hour as $h => $m ) {
		$hours[] = array_merge( array( 'hour' => (int) $h ), sl_numeric( $m ) );
	}

	$dows = array();
	ksort( $by_dow );
	foreach ( $by_dow as $d => $m ) {
		$dows[] = array_merge( array( 'dow' => (int) $d ), sl_numeric( $m ) );
	}

	$payload = array(
		'totals'      => sl_numeric( $totals ),
		'byDay'       => $days,
		'byHour'      => $hours,
		'byDow'       => $dows,
		'segments'    => $segment_list,
		'prices'      => $with_money ? sl_price_stats( $amounts ) : sl_price_stats( array() ),
		'showAmounts' => $with_money,
	);

	// Short enough that a ticket saved elsewhere shows up quickly, long enough
	// that several people opening the tab at once costs one pass, not several.
	set_transient( sl_house_cache_key(), $payload, 90 );

	return rest_ensure_response( $payload );
}

function sl_numeric( $row ) {
	$out = array();
	$keys = array(
		'n', 'appt', 'req', 'lineup', 'bar', 'pull',
		'g_new', 'g_ret', 'g_house', 'g_unknown',
		'showed', 'noshow', 'a_showed', 'a_noshow',
		'booked', 'notbooked', 'priced', 'omitted',
	);
	foreach ( $keys as $k ) {
		$out[ $k ] = isset( $row[ $k ] ) ? (int) $row[ $k ] : 0;
	}
	$out['amount'] = isset( $row['amount'] ) ? (float) $row['amount'] : 0;

	// Own money rides along only where a bucket was given it. The house
	// figures never set these, so they stay absent there rather than being
	// reported as a confident zero.
	if ( isset( $row['ownPriced'] ) || isset( $row['ownAmount'] ) ) {
		$out['ownPriced'] = isset( $row['ownPriced'] ) ? (int) $row['ownPriced'] : 0;
		$out['ownAmount'] = isset( $row['ownAmount'] ) ? (float) $row['ownAmount'] : 0;
	}

	return $out;
}

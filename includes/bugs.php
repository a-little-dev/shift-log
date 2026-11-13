<?php
/**
 * Bug reports.
 *
 * A person using the log taps the bug mark, writes a sentence, and it lands
 * in a table only one account can open. The report carries the writer's
 * handle rather than their name, so following one up does not mean putting
 * an identity next to a complaint.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** The address allowed to read the bug log. */
function sl_bug_owner_email() {
	$email = get_option( 'sl_bug_owner', SL_BUG_OWNER_DEFAULT );
	$email = is_string( $email ) ? trim( $email ) : '';
	return $email ? $email : SL_BUG_OWNER_DEFAULT;
}

/**
 * Only the owning account, and no one else — an administrator who is not that
 * address can change who the owner is, but cannot read the reports as
 * themselves. That is deliberate: the point of a private channel is that it
 * stays narrow even when the site has other administrators.
 */
function sl_is_bug_owner() {
	if ( ! is_user_logged_in() ) {
		return false;
	}
	$user = wp_get_current_user();
	return $user && 0 === strcasecmp( trim( $user->user_email ), sl_bug_owner_email() );
}

function sl_bug_count( $status = 'new' ) {
	global $wpdb;
	$table = sl_bugs_table();
	if ( 'all' === $status ) {
		return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" ); // phpcs:ignore WordPress.DB
	}
	return (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE status = %s", $status ) ); // phpcs:ignore WordPress.DB
}

/* ---------------------------------------------------------------- */
/*  Writing a report                                                */
/* ---------------------------------------------------------------- */

/**
 * A person can file six reports an hour. Enough for a bad afternoon of
 * genuine faults; not enough to fill a table with.
 */
function sl_bug_rate_ok( $user_id ) {
	$key   = 'sl_bugrate_' . (int) $user_id;
	$count = (int) get_transient( $key );
	if ( $count >= 6 ) {
		return false;
	}
	set_transient( $key, $count + 1, HOUR_IN_SECONDS );
	return true;
}

function sl_rest_bug_create( WP_REST_Request $req ) {
	global $wpdb;

	$user_id = get_current_user_id();
	$message = trim( sanitize_textarea_field( (string) $req->get_param( 'message' ) ) );

	if ( strlen( $message ) < 4 ) {
		return new WP_Error( 'sl_bug_empty', 'Tell me what went wrong first.', array( 'status' => 400 ) );
	}
	if ( ! sl_bug_rate_ok( $user_id ) ) {
		return new WP_Error( 'sl_bug_rate', 'That is a lot of reports in one hour. Try again shortly.', array( 'status' => 429 ) );
	}

	$row = array(
		'user_id'     => $user_id,
		'handle'      => sl_trim( sl_get_handle( $user_id ), 32 ),
		'message'     => sl_trim( $message, 2000 ),
		'page'        => sl_trim( esc_url_raw( (string) $req->get_param( 'page' ) ), 255 ),
		'app_tab'     => sl_trim( sanitize_key( (string) $req->get_param( 'tab' ) ), 20 ),
		'app_version' => SL_VERSION,
		'viewport'    => sl_trim( preg_replace( '/[^0-9x]/', '', (string) $req->get_param( 'viewport' ) ), 20 ),
		'user_agent'  => sl_trim( sanitize_text_field( (string) $req->get_param( 'ua' ) ), 255 ),
		'status'      => 'new',
		'created_at'  => current_time( 'mysql' ),
	);

	$ok = $wpdb->insert( sl_bugs_table(), $row, array_fill( 0, count( $row ), '%s' ) ); // phpcs:ignore WordPress.DB
	if ( false === $ok ) {
		return new WP_Error( 'sl_bug_db', 'That did not save. Try once more.', array( 'status' => 500 ) );
	}

	return array( 'ok' => true, 'id' => (int) $wpdb->insert_id );
}

/* ---------------------------------------------------------------- */
/*  Reading them                                                    */
/* ---------------------------------------------------------------- */

/*
 * Reading the reports happens in the panel behind the logo, not in wp-admin.
 * Everything above this line is what puts a report into the table; everything
 * that reads them lives in adminpanel.php.
 */

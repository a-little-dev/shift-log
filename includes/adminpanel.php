<?php
/**
 * The admin panel behind the logo.
 *
 * Clicking the S opens a gate. The password is checked against the WordPress
 * account for the owner address — WordPress's own hashed store — so no
 * credential is ever written into this plugin's files. Getting through sets a
 * short-lived unlock on the current session; it is not a second account and
 * it does not persist.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const SL_ADMIN_WINDOW = 7200;  // an unlock lasts two hours
const SL_ADMIN_TRIES  = 5;     // attempts allowed per address per quarter hour

/* ---------------------------------------------------------------- */
/*  The gate                                                        */
/* ---------------------------------------------------------------- */

function sl_admin_unlock_key( $user_id = 0 ) {
	$user_id = $user_id ? $user_id : get_current_user_id();
	return 'sl_adminok_' . (int) $user_id;
}

/** True when this session has been unlocked and the unlock has not expired. */
function sl_admin_is_unlocked() {
	if ( ! is_user_logged_in() ) {
		return false;
	}
	return (bool) get_transient( sl_admin_unlock_key() );
}

/**
 * Permission callback for everything the panel reads or changes.
 *
 * Two ways in. If the account already signed into WordPress is allowed to
 * open the panel, that is enough on its own — being signed in as the owner
 * and then being asked for the owner's password is a checkpoint that proves
 * nothing. The password gate is for the other case: signed in as someone
 * else, or not recognised, where a credential genuinely has to be shown.
 */
function sl_admin_can() {
	if ( ! is_user_logged_in() ) {
		return false;
	}
	if ( sl_admin_may_open( wp_get_current_user() ) ) {
		return true;
	}
	return sl_admin_is_unlocked();
}

/**
 * What the gate needs to know before it decides whether to ask for anything.
 * Deliberately says nothing about accounts other than the one already signed
 * in, and never reveals a password or a hash.
 */
function sl_rest_admin_whoami() {
	$user  = wp_get_current_user();
	$owner = sl_bug_owner_email();

	return array(
		'signedIn'      => is_user_logged_in(),
		'id'            => get_current_user_id(),
		'username'      => $user ? $user->user_login : '',
		'email'         => $user ? $user->user_email : '',
		'isAdmin'       => $user ? user_can( $user, 'manage_options' ) : false,
		'isOwner'       => $user && 0 === strcasecmp( trim( $user->user_email ), $owner ),
		'canOpen'       => sl_admin_can(),
		'needsPassword' => ! sl_admin_can(),
		'unlocked'      => sl_admin_is_unlocked(),
		'owner'         => $owner,
		'version'       => SL_VERSION,
		'tablesReady'   => sl_admin_tables_ready(),
	);
}

/** Whether the bug table actually exists, which an interrupted upgrade can leave undone. */
function sl_admin_tables_ready() {
	global $wpdb;
	$table = sl_bugs_table();
	$found = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ); // phpcs:ignore WordPress.DB
	return $found === $table;
}

function sl_admin_throttle_key() {
	return 'sl_admintry_' . md5( sl_client_ip() );
}

/**
 * Find the account being signed in as.
 *
 * People do not reliably reach for the same identifier: the WordPress account
 * has both a username and an email address, and either is a reasonable thing
 * to type into a box marked "sign in". Both are accepted.
 */
function sl_admin_find_user( $login ) {
	$login = trim( (string) $login );
	if ( '' === $login ) {
		return false;
	}

	if ( is_email( $login ) ) {
		$user = get_user_by( 'email', $login );
		if ( $user ) {
			return $user;
		}
	}

	$user = get_user_by( 'login', $login );
	if ( $user ) {
		return $user;
	}

	// Last resort: an address that did not pass is_email but matches anyway.
	return get_user_by( 'email', $login );
}

/**
 * May this account open the panel?
 *
 * The configured owner address, or any administrator. The second clause is
 * deliberate: if the owner option is ever pointed at an address nobody holds,
 * an administrator with their own password can still get in and correct it,
 * rather than the panel being locked away behind a typo.
 */
function sl_admin_may_open( $user ) {
	if ( ! $user ) {
		return false;
	}
	if ( 0 === strcasecmp( trim( $user->user_email ), sl_bug_owner_email() ) ) {
		return true;
	}
	return user_can( $user, 'manage_options' );
}

function sl_rest_admin_unlock( WP_REST_Request $req ) {
	$login = sanitize_text_field( (string) $req->get_param( 'email' ) );
	$pass  = (string) $req->get_param( 'password' );

	$key   = sl_admin_throttle_key();
	$tries = (int) get_transient( $key );
	if ( $tries >= SL_ADMIN_TRIES ) {
		return new WP_Error( 'sl_admin_throttled', 'Too many attempts. Wait a quarter of an hour.', array( 'status' => 429 ) );
	}

	$user = sl_admin_find_user( $login );

	// An unknown account and a wrong password fail identically, so this cannot
	// be used to find out which addresses or usernames exist.
	if ( ! $user || ! wp_check_password( $pass, $user->user_pass, $user->ID ) ) {
		set_transient( $key, $tries + 1, 15 * MINUTE_IN_SECONDS );
		return new WP_Error(
			'sl_admin_denied',
			'That is not the right username or password.',
			array( 'status' => 403 )
		);
	}

	// The credentials are right, so saying which account this is reveals
	// nothing an attacker did not already have.
	if ( ! sl_admin_may_open( $user ) ) {
		return new WP_Error(
			'sl_admin_wrong_account',
			'Those details are correct, but this is not the account the panel is set to. It opens for '
				. sl_bug_owner_email() . ', which can be changed under Settings → Shift Log.',
			array( 'status' => 403 )
		);
	}

	delete_transient( $key );
	set_transient( sl_admin_unlock_key(), 1, SL_ADMIN_WINDOW );

	return array( 'ok' => true, 'minutes' => (int) ( SL_ADMIN_WINDOW / 60 ) );
}

function sl_rest_admin_lock() {
	delete_transient( sl_admin_unlock_key() );
	return array( 'ok' => true );
}

/* ---------------------------------------------------------------- */
/*  What the panel shows                                            */
/* ---------------------------------------------------------------- */

/**
 * Who has logged what.
 *
 * Counted straight from the ticket table and joined to accounts afterwards,
 * so an account that has never logged anything still appears with a zero
 * rather than vanishing.
 */
function sl_admin_members() {
	global $wpdb;
	$table = sl_table();

	$rows = $wpdb->get_results( // phpcs:ignore WordPress.DB
		"SELECT user_id,
			COUNT(*) AS total,
			SUM(CASE WHEN is_test = 0 THEN 1 ELSE 0 END) AS counted,
			SUM(CASE WHEN is_test = 1 THEN 1 ELSE 0 END) AS tests,
			SUM(CASE WHEN outcome = 'booked' THEN 1 ELSE 0 END) AS booked,
			MIN(occurred_on) AS first_on,
			MAX(occurred_on) AS last_on,
			MAX(created_at) AS last_write
		FROM {$table}
		GROUP BY user_id"
	);

	$by_user = array();
	foreach ( $rows as $r ) {
		$by_user[ (int) $r->user_id ] = $r;
	}

	$users = get_users( array(
		'role__in' => array( 'shift_log_member', 'shift_log_pending', 'administrator' ),
		'fields'   => array( 'ID', 'user_email', 'user_registered' ),
	) );

	$out = array();
	foreach ( $users as $u ) {
		$id  = (int) $u->ID;
		$r   = isset( $by_user[ $id ] ) ? $by_user[ $id ] : null;
		$who = get_userdata( $id );

		$out[] = array(
			'id'         => $id,
			'handle'     => sl_get_handle( $id ),
			'email'      => $u->user_email,
			'pending'    => $who && in_array( 'shift_log_pending', (array) $who->roles, true ),
			'joined'     => $u->user_registered,
			'total'      => $r ? (int) $r->total : 0,
			'counted'    => $r ? (int) $r->counted : 0,
			'tests'      => $r ? (int) $r->tests : 0,
			'booked'     => $r ? (int) $r->booked : 0,
			'firstOn'    => $r ? $r->first_on : null,
			'lastOn'     => $r ? $r->last_on : null,
			'lastWrite'  => $r ? $r->last_write : null,
		);
		unset( $by_user[ $id ] );
	}

	// Anything left belongs to a deleted account. Its tickets still exist, so
	// showing the row is more honest than quietly dropping the count.
	foreach ( $by_user as $id => $r ) {
		$out[] = array(
			'id'        => (int) $id,
			'handle'    => sl_get_handle( (int) $id ),
			'email'     => null,
			'gone'      => true,
			'pending'   => false,
			'joined'    => null,
			'total'     => (int) $r->total,
			'counted'   => (int) $r->counted,
			'tests'     => (int) $r->tests,
			'booked'    => (int) $r->booked,
			'firstOn'   => $r->first_on,
			'lastOn'    => $r->last_on,
			'lastWrite' => $r->last_write,
		);
	}

	usort( $out, function ( $a, $b ) {
		return $b['counted'] - $a['counted'];
	} );

	return $out;
}

function sl_admin_bugs() {
	global $wpdb;
	$table = sl_bugs_table();

	$rows = $wpdb->get_results( "SELECT * FROM {$table} ORDER BY created_at DESC LIMIT 300" ); // phpcs:ignore WordPress.DB

	return array_map( function ( $r ) {
		return array(
			'id'       => (int) $r->id,
			'handle'   => $r->handle,
			'message'  => $r->message,
			'page'     => $r->page,
			'tab'      => $r->app_tab,
			'version'  => $r->app_version,
			'viewport' => $r->viewport,
			'agent'    => $r->user_agent,
			'status'   => $r->status,
			'at'       => $r->created_at,
		);
	}, $rows ? $rows : array() );
}

function sl_rest_admin_data() {
	$members = sl_admin_members();
	$bugs    = sl_admin_bugs();

	$tickets = 0;
	$active  = 0;
	foreach ( $members as $m ) {
		$tickets += $m['counted'];
		if ( $m['counted'] > 0 ) {
			$active++;
		}
	}

	$open = 0;
	foreach ( $bugs as $b ) {
		if ( 'closed' !== $b['status'] ) {
			$open++;
		}
	}

	return array(
		'members' => $members,
		'bugs'    => $bugs,
		'totals'  => array(
			'members'  => count( $members ),
			'active'   => $active,
			'tickets'  => $tickets,
			'bugs'     => count( $bugs ),
			'bugsOpen' => $open,
		),
		'owner'   => sl_bug_owner_email(),
	);
}

function sl_rest_admin_bug( WP_REST_Request $req ) {
	global $wpdb;

	$id  = absint( $req->get_param( 'id' ) );
	$act = sanitize_key( (string) $req->get_param( 'act' ) );

	if ( ! $id ) {
		return new WP_Error( 'sl_admin_bad', 'No report given.', array( 'status' => 400 ) );
	}

	if ( 'delete' === $act ) {
		$wpdb->delete( sl_bugs_table(), array( 'id' => $id ), array( '%d' ) ); // phpcs:ignore WordPress.DB
		return array( 'ok' => true, 'deleted' => $id );
	}

	if ( ! in_array( $act, array( 'new', 'open', 'closed' ), true ) ) {
		return new WP_Error( 'sl_admin_bad', 'Unknown action.', array( 'status' => 400 ) );
	}

	$wpdb->update( sl_bugs_table(), array( 'status' => $act ), array( 'id' => $id ), array( '%s' ), array( '%d' ) ); // phpcs:ignore WordPress.DB
	return array( 'ok' => true, 'id' => $id, 'status' => $act );
}

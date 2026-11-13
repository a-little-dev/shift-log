<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function sl_table() {
	global $wpdb;
	return $wpdb->prefix . SL_TABLE;
}

function sl_bugs_table() {
	global $wpdb;
	return $wpdb->prefix . SL_BUG_TABLE;
}

function sl_install_schema() {
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';

	$table   = sl_table();
	$collate = $wpdb->get_charset_collate();

	// price_mode records the person's choice, so an omitted price is never
	// confused with a forgotten one.
	$sql = "CREATE TABLE {$table} (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		user_id bigint(20) unsigned NOT NULL,
		occurred_on date NOT NULL,
		occurred_at time NOT NULL,
		kind varchar(20) NOT NULL DEFAULT 'appointment',
		limo varchar(10) DEFAULT NULL,
		outside_driver varchar(10) DEFAULT NULL,
		self_drive varchar(10) DEFAULT NULL,
		attendance varchar(10) DEFAULT NULL,
		outcome varchar(12) DEFAULT NULL,
		guest_type varchar(16) DEFAULT NULL,
		hotel_guest varchar(10) DEFAULT NULL,
		party_types varchar(255) DEFAULT NULL,
		private_note text,
		is_test tinyint(1) NOT NULL DEFAULT 0,
		price_mode varchar(10) DEFAULT NULL,
		amount decimal(10,2) DEFAULT NULL,
		reason text,
		created_at datetime NOT NULL,
		PRIMARY KEY  (id),
		KEY user_id (user_id),
		KEY occurred_on (occurred_on),
		KEY user_date (user_id, occurred_on),
		KEY house_scan (is_test, occurred_on)
	) {$collate};";

	dbDelta( $sql );

	// Bug reports. Deliberately a separate table: it holds free text written
	// by a person about the app, which has nothing to do with ticket data and
	// should never be joined to it or swept up by a ticket query.
	$bugs = sl_bugs_table();
	$sql  = "CREATE TABLE {$bugs} (
		id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
		user_id bigint(20) unsigned NOT NULL,
		handle varchar(32) DEFAULT NULL,
		message text NOT NULL,
		page varchar(255) DEFAULT NULL,
		app_tab varchar(20) DEFAULT NULL,
		app_version varchar(20) DEFAULT NULL,
		viewport varchar(20) DEFAULT NULL,
		user_agent varchar(255) DEFAULT NULL,
		status varchar(12) NOT NULL DEFAULT 'new',
		created_at datetime NOT NULL,
		PRIMARY KEY  (id),
		KEY status (status),
		KEY created_at (created_at)
	) {$collate};";

	dbDelta( $sql );

	update_option( 'sl_db_version', SL_VERSION );
}


function sl_setup_roles() {
	// Full membership: logs tickets and sees the house view.
	add_role( 'shift_log_member', 'Shift Log Member', array(
		'read'        => true,
		SL_CAP_SUBMIT => true,
		SL_CAP_HOUSE  => true,
	) );

	// Front-end sign-ups land here. No logging capability, no house view —
	// the account exists but does nothing until an administrator approves it.
	add_role( 'shift_log_pending', 'Shift Log (awaiting approval)', array(
		'read' => true,
	) );

	$pending = get_role( 'shift_log_pending' );
	if ( $pending ) {
		$pending->remove_cap( SL_CAP_SUBMIT );
		$pending->remove_cap( SL_CAP_HOUSE );
	}

	foreach ( array( 'administrator' ) as $role_name ) {
		$role = get_role( $role_name );
		if ( $role ) {
			$role->add_cap( SL_CAP_SUBMIT );
			$role->add_cap( SL_CAP_HOUSE );
		}
	}
}

function sl_activate() {
	sl_install_schema();
	sl_setup_roles();

	if ( false === get_option( 'sl_house_amounts' ) ) {
		add_option( 'sl_house_amounts', '1' );
	}
	if ( false === get_option( 'sl_registration' ) ) {
		add_option( 'sl_registration', 'code' );
	}
	if ( false === get_option( 'sl_auto_approve' ) ) {
		add_option( 'sl_auto_approve', '1' );
	}
	if ( ! get_option( 'sl_reg_code' ) ) {
		add_option( 'sl_reg_code', 'RATPACK' );
	}
	if ( false === get_option( 'sl_bug_owner' ) ) {
		add_option( 'sl_bug_owner', SL_BUG_OWNER_DEFAULT );
	}
	if ( false === get_option( 'sl_bug_widget' ) ) {
		add_option( 'sl_bug_widget', '1' );
	}

	sl_migrate_access_code();
}

/**
 * One-time: apply the requested access code and automatic approval to a site
 * that already had its own generated code. Runs once and never again, so any
 * later change made in Settings sticks.
 */
function sl_migrate_access_code() {
	if ( get_option( 'sl_migrated_code' ) ) {
		return;
	}
	update_option( 'sl_registration', 'code' );
	update_option( 'sl_reg_code', 'RATPACK' );
	update_option( 'sl_auto_approve', '1' );
	update_option( 'sl_migrated_code', '1' );
}

function sl_deactivate() {
	// Ticket data is deliberately left in place on deactivation.
	// Removal happens only in uninstall.php, and only on explicit opt-in.
}

/**
 * Repair tickets damaged by the column-format fault.
 *
 * Between 3.10.0 and 3.19.2 the write path handed wpdb one format too few, so
 * every save wrote price_mode through '%f'. "included" and "private" both
 * became 0, which is not a visibility the app knows: the amount field stopped
 * appearing when such a ticket was edited, and its money dropped out of every
 * figure.
 *
 * The original choice cannot be recovered — 0 does not say which it was. A
 * booking that still has an amount is set to `private`, which puts the money
 * back into the person's own totals without claiming it was ever shared with
 * the floor. That is the cautious direction: it can be corrected to shared by
 * opening the ticket, whereas money silently left out cannot be noticed at
 * all. One with no amount becomes `omitted`, which is what it was in effect.
 */
function sl_repair_price_modes() {
	global $wpdb;
	$table = sl_table();

	$valid = "('included','private','omitted')";

	$wpdb->query( // phpcs:ignore WordPress.DB
		"UPDATE {$table}
		    SET price_mode = 'private'
		  WHERE price_mode IS NOT NULL
		    AND price_mode NOT IN {$valid}
		    AND amount IS NOT NULL AND amount > 0"
	);

	$wpdb->query( // phpcs:ignore WordPress.DB
		"UPDATE {$table}
		    SET price_mode = 'omitted'
		  WHERE price_mode IS NOT NULL
		    AND price_mode NOT IN {$valid}"
	);

	// A note written through '%d' became the string "0". Left alone where it
	// could conceivably have been typed, cleared only where the ticket has
	// nothing else suggesting a note was ever written.
	$wpdb->query( // phpcs:ignore WordPress.DB
		"UPDATE {$table} SET private_note = '' WHERE private_note = '0'"
	);
}

function sl_maybe_upgrade() {
	if ( get_option( 'sl_db_version' ) !== SL_VERSION ) {
		sl_install_schema();
		sl_repair_price_modes();
		sl_drop_tip_data();
		// Picks up roles and options added in a later version without
		// needing a deactivate/reactivate cycle.
		sl_activate();
	}
}

/**
 * Clear out what the written sales tips left behind.
 *
 * The library of tips was replaced in 3.23.0 by advice worked out from each
 * person's own log, so the house tally of thumbs up and down, and every
 * person's record of what they voted on, describe something that no longer
 * exists. Left in place they would sit in the database for good, since
 * nothing would ever read them again to notice.
 */
function sl_drop_tip_data() {
	delete_option( 'sl_tip_votes' );
	delete_option( 'sl_tip_keep' );
	delete_metadata( 'user', 0, 'sl_tip_votes', '', true );
}

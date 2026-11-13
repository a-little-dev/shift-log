<?php
/**
 * Runs only when the plugin is deleted from the Plugins screen.
 *
 * Ticket data survives deletion unless someone has explicitly opted in, so an
 * accidental delete can never wipe months of records. To allow removal, add
 * this to wp-config.php before deleting:
 *
 *     define( 'SL_DELETE_DATA_ON_UNINSTALL', true );
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

if ( ! defined( 'SL_DELETE_DATA_ON_UNINSTALL' ) || ! SL_DELETE_DATA_ON_UNINSTALL ) {
	return;
}

global $wpdb;

$table = $wpdb->prefix . 'shift_log_tickets';
$wpdb->query( "DROP TABLE IF EXISTS {$table}" );

$bugs = $wpdb->prefix . 'shift_log_bugs';
$wpdb->query( "DROP TABLE IF EXISTS {$bugs}" );

// 1.6.0 briefly used a separate notes table; drop it if this site ever had one.
$notes = $wpdb->prefix . 'shift_log_notes';
$wpdb->query( "DROP TABLE IF EXISTS {$notes}" );

delete_option( 'sl_db_version' );
delete_option( 'sl_house_amounts' );
delete_option( 'sl_currency' );
delete_option( 'sl_fullwidth' );
delete_option( 'sl_registration' );
delete_option( 'sl_reg_code' );
delete_option( 'sl_reg_auto_house' );
delete_option( 'sl_app_url' );
delete_option( 'sl_auto_approve' );
delete_option( 'sl_migrated_code' );
delete_option( 'sl_bug_owner' );
delete_option( 'sl_bug_widget' );
delete_option( 'sl_tip_votes' );
delete_metadata( 'user', 0, 'sl_tip_votes', '', true );
delete_metadata( 'user', 0, 'sl_tour_open', '', true );
delete_metadata( 'user', 0, 'sl_tour_history', '', true );
delete_metadata( 'user', 0, 'sl_verify_name', '', true );
delete_metadata( 'user', 0, 'sl_approved_at', '', true );
delete_metadata( 'user', 0, 'sl_registered_at', '', true );
delete_metadata( 'user', 0, 'sl_handle', '', true );

remove_role( 'shift_log_member' );
remove_role( 'shift_log_pending' );
foreach ( array( 'administrator' ) as $role_name ) {
	$role = get_role( $role_name );
	if ( $role ) {
		$role->remove_cap( 'shift_log_submit' );
		$role->remove_cap( 'shift_log_view_house' );
	}
}

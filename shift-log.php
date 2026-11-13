<?php
/**
 * Plugin Name:       Shift Log
 * Description:       Private appointment ticketing with personal and house-wide insights. Uses WordPress accounts for sign-in, passwords and resets.
 * Version:           3.28.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            —
 * License:           GPL-2.0-or-later
 * Text Domain:       shift-log
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'SL_VERSION', '3.28.0' );
define( 'SL_FILE', __FILE__ );
define( 'SL_DIR', plugin_dir_path( __FILE__ ) );
define( 'SL_URL', plugin_dir_url( __FILE__ ) );
define( 'SL_TABLE', 'shift_log_tickets' );
define( 'SL_BUG_TABLE', 'shift_log_bugs' );

/**
 * Who may read the bug log. Stored as an option so it can be corrected from
 * Settings without editing a file; this is only the value it starts at.
 */
define( 'SL_BUG_OWNER_DEFAULT', 'alicelittle@thealicelittle.com' );

/** Capabilities. Granting these is how you decide who logs and who sees the house view. */
define( 'SL_CAP_SUBMIT', 'shift_log_submit' );
define( 'SL_CAP_HOUSE', 'shift_log_view_house' );

require_once SL_DIR . 'includes/install.php';
require_once SL_DIR . 'includes/handles.php';
require_once SL_DIR . 'includes/logo.php';
require_once SL_DIR . 'includes/rest.php';
require_once SL_DIR . 'includes/register.php';
require_once SL_DIR . 'includes/layout.php';
require_once SL_DIR . 'includes/render.php';
require_once SL_DIR . 'includes/settings.php';
require_once SL_DIR . 'includes/bugs.php';
require_once SL_DIR . 'includes/adminpanel.php';
require_once SL_DIR . 'includes/tours.php';

register_activation_hook( __FILE__, 'sl_activate' );
register_deactivation_hook( __FILE__, 'sl_deactivate' );

add_action( 'plugins_loaded', 'sl_maybe_upgrade' );
add_action( 'rest_api_init', 'sl_register_routes' );
add_action( 'init', 'sl_register_shortcode' );
add_action( 'admin_menu', 'sl_settings_menu' );
add_action( 'admin_init', 'sl_settings_register' );

/**
 * Amounts are the most sensitive field here, so serving this over plain HTTP
 * is worth shouting about in the admin.
 */
add_action( 'admin_notices', function () {
	if ( ! current_user_can( 'manage_options' ) || is_ssl() ) {
		return;
	}
	echo '<div class="notice notice-error"><p><strong>Shift Log:</strong> this site is not using HTTPS. Sign-in credentials and logged amounts travel in the clear. Install a TLS certificate before using this plugin with real data.</p></div>';
} );

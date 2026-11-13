<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'admin_post_nopriv_sl_register', 'sl_handle_register' );
add_action( 'admin_post_sl_register', 'sl_handle_register' );

function sl_reg_mode() {
	$mode = get_option( 'sl_registration', 'open' );
	return in_array( $mode, array( 'off', 'code', 'open' ), true ) ? $mode : 'open';
}

/**
 * When approval is automatic there is no administrator judgement to inform,
 * so the verification name is not collected at all. Collecting a name whose
 * only purpose is a review that never happens would mean storing an identity
 * for no reason.
 */
function sl_auto_approve() {
	return '1' === get_option( 'sl_auto_approve', '1' );
}

function sl_reg_bail( $redirect, $code ) {
	wp_safe_redirect( add_query_arg( array( 'sl_view' => 'join', 'sl_error' => $code ), $redirect ) );
	exit;
}

function sl_client_ip() {
	return isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '0';
}

/**
 * Usernames are deliberately meaningless.
 *
 * Deriving one from the email would bake a real name into user_login and
 * user_nicename, which appear in author URLs and can't be changed later
 * without breaking the account. Since the whole point is that the name
 * disappears at approval, nothing identifying goes into the username.
 */
function sl_neutral_username() {
	do {
		$try = 'sl' . strtolower( wp_generate_password( 8, false, false ) );
	} while ( username_exists( $try ) );
	return $try;
}

function sl_handle_register() {
	$redirect = wp_get_referer();
	$redirect = $redirect ? $redirect : home_url( '/' );

	if ( ! isset( $_POST['sl_reg_nonce'] ) || ! wp_verify_nonce( sanitize_key( $_POST['sl_reg_nonce'] ), 'sl_register' ) ) {
		sl_reg_bail( $redirect, 'nonce' );
	}
	if ( 'off' === sl_reg_mode() ) {
		sl_reg_bail( $redirect, 'closed' );
	}
	if ( is_user_logged_in() ) {
		wp_safe_redirect( $redirect );
		exit;
	}

	// Bots fill every field they find; people never see this one.
	if ( ! empty( $_POST['sl_website'] ) ) {
		sl_reg_bail( $redirect, 'spam' );
	}

	// Five attempts per IP per hour, so the access code can't be brute-forced.
	$bucket  = 'sl_reg_' . md5( sl_client_ip() );
	$strikes = (int) get_transient( $bucket );
	if ( $strikes >= 5 ) {
		sl_reg_bail( $redirect, 'throttled' );
	}
	set_transient( $bucket, $strikes + 1, HOUR_IN_SECONDS );

	$name = '';
	if ( ! sl_auto_approve() ) {
		$name = isset( $_POST['sl_name'] ) ? sanitize_text_field( wp_unslash( $_POST['sl_name'] ) ) : '';
		$name = trim( preg_replace( '/\s+/', ' ', $name ) );
		if ( mb_strlen( $name ) < 2 || mb_strlen( $name ) > 100 ) {
			sl_reg_bail( $redirect, 'name' );
		}
	}

	$email = isset( $_POST['sl_email'] ) ? sanitize_email( wp_unslash( $_POST['sl_email'] ) ) : '';
	if ( ! is_email( $email ) ) {
		sl_reg_bail( $redirect, 'email' );
	}
	if ( email_exists( $email ) ) {
		sl_reg_bail( $redirect, 'exists' );
	}

	// Passwords are never sanitized — that would silently alter what was typed.
	$pw  = isset( $_POST['sl_password'] ) ? (string) wp_unslash( $_POST['sl_password'] ) : '';
	$pw2 = isset( $_POST['sl_password2'] ) ? (string) wp_unslash( $_POST['sl_password2'] ) : '';

	if ( strlen( $pw ) < 12 ) {
		sl_reg_bail( $redirect, 'weak' );
	}
	if ( $pw !== $pw2 ) {
		sl_reg_bail( $redirect, 'match' );
	}
	if ( false !== stripos( $pw, 'password' ) || false !== stripos( $pw, 'shiftlog' ) ) {
		sl_reg_bail( $redirect, 'weak' );
	}

	if ( 'code' === sl_reg_mode() ) {
		$given    = isset( $_POST['sl_code'] ) ? trim( (string) wp_unslash( $_POST['sl_code'] ) ) : '';
		$expected = (string) get_option( 'sl_reg_code', '' );
		if ( '' === $expected || ! hash_equals( strtoupper( $expected ), strtoupper( $given ) ) ) {
			sl_reg_bail( $redirect, 'code' );
		}
	}

	$user_id = wp_create_user( sl_neutral_username(), $pw, $email );
	if ( is_wp_error( $user_id ) ) {
		sl_reg_bail( $redirect, 'failed' );
	}

	$auto = sl_auto_approve();

	$user = new WP_User( $user_id );
	$user->set_role( $auto ? 'shift_log_member' : 'shift_log_pending' );

	$handle = sl_get_handle( $user_id );

	// Show the handle everywhere WordPress would otherwise show a name, so the
	// real name lives in exactly one field and can be deleted cleanly.
	wp_update_user( array(
		'ID'           => $user_id,
		'display_name' => $handle,
		'nickname'     => $handle,
	) );

	update_user_meta( $user_id, 'sl_registered_at', time() );

	if ( $auto ) {
		update_user_meta( $user_id, 'sl_approved_at', time() );
	} else {
		// The single place the name is kept. Deleted the moment the account
		// is approved — see sl_approve_user().
		update_user_meta( $user_id, 'sl_verify_name', $name );
	}

	delete_transient( $bucket );
	sl_notify_admin_of_signup( $user_id, $name, $email, $auto );

	wp_set_current_user( $user_id );
	wp_set_auth_cookie( $user_id, true );

	wp_safe_redirect( remove_query_arg( array( 'sl_view', 'sl_error' ), $redirect ) );
	exit;
}

function sl_notify_admin_of_signup( $user_id, $name, $email, $auto = false ) {
	$to      = get_option( 'admin_email' );
	$site    = wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES );
	$handle  = sl_get_handle( $user_id );

	if ( $auto ) {
		// Nothing to action, but you should still know the door opened.
		$subject = sprintf( '[%s] New Shift Log account created', $site );
		$body    = "A new account was created and is active immediately.\n\n"
			. "Email: {$email}\n"
			. "Handle: {$handle}\n\n"
			. "Automatic approval is on, so this account can already log tickets and\n"
			. "see the house-wide view. To review accounts before they go live, turn\n"
			. "off automatic approval: " . admin_url( 'options-general.php?page=shift-log' ) . "\n";
	} else {
		$subject = sprintf( '[%s] New Shift Log account waiting for approval', $site );
		$body    = "Someone has requested a Shift Log account.\n\n"
			. "Name given: {$name}\n"
			. "Email: {$email}\n\n"
			. "They cannot see or log anything until you approve them.\n"
			. "Review and approve: " . admin_url( 'options-general.php?page=shift-log' ) . "\n\n"
			. "The name above is stored only until approval, then deleted.\n";
	}

	wp_mail( $to, $subject, $body );
}

/**
 * Approve an account and forget who they said they were.
 *
 * The verification name exists for one purpose — letting an administrator
 * confirm the request is from someone they expect. Once that judgement has
 * been made the name has served its purpose, so it is deleted here rather
 * than kept on file.
 */
function sl_approve_user( $user_id ) {
	$user = get_user_by( 'id', $user_id );
	if ( ! $user || ! in_array( 'shift_log_pending', (array) $user->roles, true ) ) {
		return false;
	}

	$user->set_role( 'shift_log_member' );

	delete_user_meta( $user_id, 'sl_verify_name' );
	update_user_meta( $user_id, 'sl_approved_at', time() );

	$page = get_option( 'sl_app_url' );
	wp_mail(
		$user->user_email,
		sprintf( '[%s] Your Shift Log account is active', wp_specialchars_decode( get_bloginfo( 'name' ), ENT_QUOTES ) ),
		"Your account has been approved and is ready to use.\n\n"
			. ( $page ? "Sign in here: {$page}\n\n" : '' )
			. "The name you gave when signing up has now been deleted. From here on your\n"
			. "account appears only as " . sl_get_handle( $user_id ) . " to anyone else using the log.\n"
	);

	return true;
}

/** Turning someone down removes the account and the name along with it. */
function sl_reject_user( $user_id ) {
	$user = get_user_by( 'id', $user_id );
	if ( ! $user || ! in_array( 'shift_log_pending', (array) $user->roles, true ) ) {
		return false;
	}

	require_once ABSPATH . 'wp-admin/includes/user.php';
	return wp_delete_user( $user_id );
}

function sl_reg_error_text( $code ) {
	$map = array(
		'nonce'     => 'That form expired. Please try again.',
		'closed'    => 'New accounts are not being accepted right now.',
		'spam'      => 'That submission looked automated. Please try again.',
		'throttled' => 'Too many attempts from this connection. Wait an hour and try again.',
		'name'      => 'Enter the name your manager knows you by.',
		'email'     => 'Enter a valid email address.',
		'exists'    => 'An account already uses that email. Sign in, or reset the password.',
		'weak'      => 'Use at least 12 characters, and avoid common words.',
		'match'     => "The two passwords don't match.",
		'code'      => "That access code isn't right. Ask whoever invited you.",
		'failed'    => "Couldn't create the account. Please try again.",
	);
	return isset( $map[ $code ] ) ? $map[ $code ] : 'Something went wrong. Please try again.';
}

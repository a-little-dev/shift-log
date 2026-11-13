<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Every account gets a stable, meaningless handle. The house view shows this
 * and nothing else, so nobody's display name, username or email is exposed to
 * their colleagues by the pooled reporting.
 */
function sl_get_handle( $user_id ) {
	$handle = get_user_meta( $user_id, 'sl_handle', true );
	if ( $handle ) {
		return $handle;
	}

	$letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
	$digits  = '23456789';
	$pick    = function ( $set, $count ) {
		$out = '';
		for ( $i = 0; $i < $count; $i++ ) {
			$out .= $set[ random_int( 0, strlen( $set ) - 1 ) ];
		}
		return $out;
	};

	// Loop rather than trust a single draw; collisions would merge two people
	// into one row in the house table.
	for ( $attempt = 0; $attempt < 12; $attempt++ ) {
		$candidate = $pick( $letters, 2 ) . $pick( $digits, 1 ) . '-' . $pick( $digits, 2 ) . $pick( $letters, 1 );
		$taken     = get_users( array(
			'meta_key'   => 'sl_handle',
			'meta_value' => $candidate,
			'fields'     => 'ID',
			'number'     => 1,
		) );
		if ( empty( $taken ) ) {
			update_user_meta( $user_id, 'sl_handle', $candidate );
			return $candidate;
		}
	}

	$fallback = 'U' . $user_id;
	update_user_meta( $user_id, 'sl_handle', $fallback );
	return $fallback;
}

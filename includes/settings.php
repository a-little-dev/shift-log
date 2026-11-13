<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function sl_settings_menu() {
	$waiting = count( get_users( array( 'role' => 'shift_log_pending', 'fields' => 'ID' ) ) );
	$label   = $waiting
		? sprintf( 'Shift Log <span class="update-plugins count-%1$d"><span class="plugin-count">%1$d</span></span>', $waiting )
		: 'Shift Log';

	add_options_page( 'Shift Log', $label, 'manage_options', 'shift-log', 'sl_settings_page' );
}

function sl_settings_register() {
	register_setting( 'sl_settings', 'sl_house_amounts', array(
		'type'              => 'string',
		'sanitize_callback' => function ( $v ) { return '1' === $v ? '1' : '0'; },
		'default'           => '1',
	) );
	register_setting( 'sl_settings', 'sl_fullwidth', array(
		'type'              => 'string',
		'sanitize_callback' => function ( $v ) { return '0' === $v ? '0' : '1'; },
		'default'           => '1',
	) );
	register_setting( 'sl_settings', 'sl_currency', array(
		'type'              => 'string',
		'sanitize_callback' => function ( $v ) { return preg_match( '/^[A-Z]{3}$/', $v ) ? $v : 'USD'; },
		'default'           => 'USD',
	) );
	/* A booking that arrived by limo carries a cut off the top before
	   anything is split. Kept as settings because the figures differ from
	   house to house, and a number written into the code is a number nobody
	   can correct.

	   Worked through on a $100,000 limo booking at the defaults: $30,000 is
	   the limo's cut, the courtesan keeps $35,000, and the $35,000 left is
	   the house's — which is the $65,000 the house side ends up with once
	   its own share and the limo's are counted together. */
	register_setting( 'sl_settings', 'sl_limo_cut', array(
		'type'              => 'number',
		'sanitize_callback' => 'sl_clean_rate',
		'default'           => 30,
	) );
	register_setting( 'sl_settings', 'sl_limo_share', array(
		'type'              => 'number',
		'sanitize_callback' => 'sl_clean_rate',
		'default'           => 35,
	) );
	register_setting( 'sl_settings', 'sl_registration', array(
		'type'              => 'string',
		'sanitize_callback' => function ( $v ) { return in_array( $v, array( 'off', 'code', 'open' ), true ) ? $v : 'code'; },
		'default'           => 'code',
	) );
	register_setting( 'sl_settings', 'sl_auto_approve', array(
		'type'              => 'string',
		'sanitize_callback' => function ( $v ) { return '0' === $v ? '0' : '1'; },
		'default'           => '1',
	) );
	register_setting( 'sl_settings', 'sl_bug_owner', array(
		'type'              => 'string',
		'sanitize_callback' => function ( $v ) {
			$v = sanitize_email( (string) $v );
			return is_email( $v ) ? $v : SL_BUG_OWNER_DEFAULT;
		},
		'default'           => SL_BUG_OWNER_DEFAULT,
	) );
	register_setting( 'sl_settings', 'sl_bug_widget', array(
		'type'              => 'string',
		'sanitize_callback' => function ( $v ) { return '0' === $v ? '0' : '1'; },
		'default'           => '1',
	) );
	register_setting( 'sl_settings', 'sl_reg_code', array(
		'type'              => 'string',
		'sanitize_callback' => function ( $v ) {
			$v = strtoupper( preg_replace( '/[^A-Za-z0-9\-]/', '', (string) $v ) );
			return $v ? substr( $v, 0, 32 ) : strtoupper( wp_generate_password( 10, false, false ) );
		},
		'default'           => '',
	) );
}

function sl_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}

	// Role capability toggles are applied here rather than stored as options,
	// so they show up correctly for any other plugin reading capabilities.
	if ( isset( $_POST['sl_roles_nonce'] ) && wp_verify_nonce( sanitize_key( $_POST['sl_roles_nonce'] ), 'sl_roles' ) ) {
		$submit = isset( $_POST['sl_submit_roles'] ) ? array_map( 'sanitize_key', (array) $_POST['sl_submit_roles'] ) : array();
		$house  = isset( $_POST['sl_house_roles'] ) ? array_map( 'sanitize_key', (array) $_POST['sl_house_roles'] ) : array();

		foreach ( wp_roles()->get_names() as $slug => $label ) {
			$role = get_role( $slug );
			if ( ! $role ) {
				continue;
			}
			in_array( $slug, $submit, true ) ? $role->add_cap( SL_CAP_SUBMIT ) : $role->remove_cap( SL_CAP_SUBMIT );
			in_array( $slug, $house, true ) ? $role->add_cap( SL_CAP_HOUSE ) : $role->remove_cap( SL_CAP_HOUSE );
		}
		echo '<div class="notice notice-success"><p>Access updated.</p></div>';
	}
	// Approving promotes the role and deletes the verification name in one
	// step, so an approved account keeps no record of who they said they were.
	if ( isset( $_POST['sl_approve_nonce'] ) && wp_verify_nonce( sanitize_key( $_POST['sl_approve_nonce'] ), 'sl_approve' ) ) {
		$ids    = isset( $_POST['sl_users'] ) ? array_map( 'absint', (array) $_POST['sl_users'] ) : array();
		$reject = isset( $_POST['sl_reject'] );
		$done   = 0;

		foreach ( $ids as $uid ) {
			if ( $uid === get_current_user_id() ) {
				continue;
			}
			$done += ( $reject ? sl_reject_user( $uid ) : sl_approve_user( $uid ) ) ? 1 : 0;
		}

		if ( $done ) {
			echo '<div class="notice notice-success"><p>' . (int) $done .
				( $reject
					? ' account(s) declined and deleted.'
					: ' account(s) approved. Their submitted names have been deleted.' ) .
				'</p></div>';
		} elseif ( $ids ) {
			echo '<div class="notice notice-warning"><p>Nothing changed — select at least one pending account.</p></div>';
		}
	}
	?>
	<div class="wrap">
		<h1>Shift Log</h1>

		<p>Put <code>[shift_log]</code> on any page. Signed-out visitors get a sign-in form; signed-in users with logging access get the app.</p>

		<?php
		$pending = get_users( array( 'role' => 'shift_log_pending', 'orderby' => 'registered', 'order' => 'ASC' ) );
		?>

		<h2>Waiting for approval <?php echo $pending ? '<span class="count">(' . (int) count( $pending ) . ')</span>' : ''; ?></h2>

		<?php if ( ! $pending ) : ?>
			<p class="description">Nobody is waiting. New sign-ups appear here and can see nothing at all until you approve them.</p>
		<?php else : ?>
			<p class="description">
				These accounts can't log anything or see any figures yet. The name column exists so you can confirm each request is from someone you're expecting —
				<strong>approving deletes that name permanently</strong>, and the account is known only by its handle from then on. Declining deletes the account and the name together.
			</p>
			<form method="post">
				<?php wp_nonce_field( 'sl_approve', 'sl_approve_nonce' ); ?>
				<table class="widefat striped" style="max-width:820px">
					<thead><tr><th style="width:36px"></th><th>Name given</th><th>Email</th><th>Handle</th><th>Requested</th></tr></thead>
					<tbody>
					<?php foreach ( $pending as $u ) : ?>
						<tr>
							<td><input type="checkbox" name="sl_users[]" value="<?php echo (int) $u->ID; ?>" /></td>
							<td><strong><?php echo esc_html( get_user_meta( $u->ID, 'sl_verify_name', true ) ); ?></strong></td>
							<td><?php echo esc_html( $u->user_email ); ?></td>
							<td><code><?php echo esc_html( sl_get_handle( $u->ID ) ); ?></code></td>
							<td><?php echo esc_html( mysql2date( get_option( 'date_format' ) . ' H:i', $u->user_registered ) ); ?></td>
						</tr>
					<?php endforeach; ?>
					</tbody>
				</table>
				<p class="submit">
					<button type="submit" class="button button-primary">Approve selected</button>
					<button type="submit" name="sl_reject" value="1" class="button"
						onclick="return confirm('Decline and permanently delete the selected accounts?');">Decline and delete</button>
				</p>
			</form>
		<?php endif; ?>
		<hr />

		<form method="post" action="options.php">
			<?php settings_fields( 'sl_settings' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row">New sign-ups</th>
					<td>
						<?php $reg = get_option( 'sl_registration', 'code' ); ?>
						<label style="display:block;margin-bottom:6px"><input type="radio" name="sl_registration" value="code" <?php checked( 'code', $reg ); ?> /> <strong>Access code required</strong> — anyone with the code can join</label>
						<label style="display:block;margin-bottom:6px"><input type="radio" name="sl_registration" value="open" <?php checked( 'open', $reg ); ?> /> <strong>Open</strong> — no code at all, anyone can create an account</label>
						<label style="display:block"><input type="radio" name="sl_registration" value="off" <?php checked( 'off', $reg ); ?> /> <strong>Closed</strong> — you add people under Users → Add New</label>
						<p class="description">Open sign-up on a log like this means a stranger could create an account. The access code option is the sensible middle ground.</p>
					</td>
				</tr>
				<tr>
					<th scope="row">Access code</th>
					<td>
						<input type="text" name="sl_reg_code" class="regular-text code" value="<?php echo esc_attr( get_option( 'sl_reg_code', '' ) ); ?>" />
						<p class="description">Case-insensitive. Share it privately and change it whenever you like — changing it doesn't affect anyone who already joined.</p>
					</td>
				</tr>
				<tr>
					<th scope="row">Approval</th>
					<td>
						<?php $auto = '1' === get_option( 'sl_auto_approve', '1' ); ?>
						<label style="display:block;margin-bottom:6px"><input type="radio" name="sl_auto_approve" value="1" <?php checked( true, $auto ); ?> /> <strong>Automatic</strong> — anyone with the access code is active immediately</label>
						<label style="display:block"><input type="radio" name="sl_auto_approve" value="0" <?php checked( false, $auto ); ?> /> <strong>Review each account</strong> — sign-ups give their name and wait for you</label>
						<p class="description">
							On automatic, a new account can log tickets and open the house-wide view as soon as it's created, so the access code is the only thing standing between a stranger and everyone's figures. Keep the code private and change it if it spreads.
							Reviewing instead adds a name field to the sign-up form; that name is deleted the moment you approve.
						</p>
					</td>
				</tr>
				<tr>
					<th scope="row">Prices in the house view</th>
					<td>
						<label>
							<input type="checkbox" name="sl_house_amounts" value="1" <?php checked( '1', get_option( 'sl_house_amounts', '1' ) ); ?> />
							Include submitted prices in pooled totals
						</label>
						<p class="description">Turn this off to make the house view report rates and counts only. Individual users always keep full access to their own figures either way. Prices that a person chose to leave off their ticket never appear here regardless of this setting.</p>
					</td>
				</tr>
				<tr>
					<th scope="row">Page width</th>
					<td>
						<label>
							<input type="checkbox" name="sl_fullwidth" value="1" <?php checked( '1', get_option( 'sl_fullwidth', '1' ) ); ?> />
							Break out of the theme's content container
						</label>
						<p class="description">
							Most themes cap page content at around 800px, which squeezes the app into a narrow column. This makes it span the window instead.
							For the cleanest result, edit the page and set <strong>Page Attributes → Template</strong> to <strong>Shift Log — full width</strong>; that removes the container properly and this checkbox then does nothing on that page.
							Untick it only if your theme reacts badly.
						</p>
					</td>
				</tr>
				<tr>
					<th scope="row">Currency</th>
					<td><input type="text" name="sl_currency" value="<?php echo esc_attr( get_option( 'sl_currency', 'USD' ) ); ?>" size="5" maxlength="3" /> <span class="description">Three-letter code, e.g. USD.</span></td>
				</tr>
				<tr>
					<th scope="row">Limo bookings</th>
					<td>
						<label>
							<input type="number" name="sl_limo_cut" min="0" max="100" step="0.5"
								value="<?php echo esc_attr( sl_limo_cut() ); ?>" size="4" />% off the top goes to the limo
						</label>
						<br />
						<label>
							<input type="number" name="sl_limo_share" min="0" max="100" step="0.5"
								value="<?php echo esc_attr( sl_limo_share() ); ?>" size="4" />% of the booking is the courtesan's share
						</label>
						<p class="description">
							On a <?php echo esc_html( sl_limo_cut() ); ?>% cut and a
							<?php echo esc_html( sl_limo_share() ); ?>% share, a $100,000 limo booking
							gives $<?php echo esc_html( number_format( 100000 * sl_limo_cut() / 100 ) ); ?>
							to the limo, $<?php echo esc_html( number_format( 100000 * sl_limo_share() / 100 ) ); ?>
							to the courtesan and the rest to the house. These only apply to a
							booked ticket marked as arriving by limo.
						</p>
					</td>
				</tr>
				<tr>
					<th scope="row">Bug reports</th>
					<td>
						<label>
							<input type="checkbox" name="sl_bug_widget" value="1" <?php checked( '1', get_option( 'sl_bug_widget', '1' ) ); ?> />
							Show the bug mark in the app
						</label>
						<p class="description">A small mark in the corner of the log. Tapping it opens a box to describe a fault.</p>
						<p style="margin-top:12px">
							<label for="sl_bug_owner"><strong>Reports go to</strong></label><br>
							<input type="email" id="sl_bug_owner" name="sl_bug_owner" class="regular-text"
								value="<?php echo esc_attr( get_option( 'sl_bug_owner', SL_BUG_OWNER_DEFAULT ) ); ?>" />
						</p>
						<p class="description">
							This address, with its WordPress password, is what opens the admin panel behind the S logo in the app —
							bug reports and who has logged how many tickets. No other administrator can open it as themselves.
							Change it only if that address changes: put in one nobody holds and the panel becomes unreachable
							until it is corrected here.
						</p>
					</td>
				</tr>
			</table>
			<?php submit_button( 'Save settings' ); ?>
		</form>

		<hr />

		<h2>Who can do what</h2>
		<form method="post">
			<?php wp_nonce_field( 'sl_roles', 'sl_roles_nonce' ); ?>
			<table class="widefat striped" style="max-width:640px">
				<thead><tr><th>Role</th><th>Can log tickets</th><th>Can see the house view</th></tr></thead>
				<tbody>
				<?php foreach ( wp_roles()->get_names() as $slug => $label ) :
					$role = get_role( $slug ); ?>
					<tr>
						<td><strong><?php echo esc_html( $label ); ?></strong></td>
						<td><input type="checkbox" name="sl_submit_roles[]" value="<?php echo esc_attr( $slug ); ?>" <?php checked( $role && $role->has_cap( SL_CAP_SUBMIT ) ); ?> /></td>
						<td><input type="checkbox" name="sl_house_roles[]" value="<?php echo esc_attr( $slug ); ?>" <?php checked( $role && $role->has_cap( SL_CAP_HOUSE ) ); ?> /></td>
					</tr>
				<?php endforeach; ?>
				</tbody>
			</table>
			<?php submit_button( 'Save access' ); ?>
		</form>

		<hr />
		<h2>Handling this data responsibly</h2>
		<ul style="list-style:disc;margin-left:20px;max-width:70ch">
			<li>Serve the site over HTTPS. Without it, passwords and amounts travel in the clear.</li>
			<li>Add a login-throttling or two-factor plugin. WordPress does not limit login attempts on its own.</li>
			<li>Administrators can read the database directly. Keep the admin list short, and know that the house view's anonymity protects users from each other, not from whoever holds the database.</li>
			<li>Back up the tickets table, and decide in advance how long you keep entries.</li>
		</ul>
	</div>
	<?php
}

/**
 * A percentage, kept inside the only range a percentage can be.
 *
 * A rate above 100 would hand out more than the booking was worth, and a
 * negative one would quietly add money to a tour. Either would be believed
 * by every figure built on it, so both are refused here rather than guarded
 * against in a dozen places afterwards.
 */
function sl_clean_rate( $v ) {
	$n = is_numeric( $v ) ? (float) $v : 0;
	return max( 0, min( 100, round( $n, 2 ) ) );
}

/** What comes off a limo booking before anything is split. */
function sl_limo_cut() {
	return sl_clean_rate( get_option( 'sl_limo_cut', 30 ) );
}

/** What a courtesan keeps of a limo booking. */
function sl_limo_share() {
	return sl_clean_rate( get_option( 'sl_limo_share', 35 ) );
}

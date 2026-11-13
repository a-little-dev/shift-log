<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

function sl_register_shortcode() {
	add_shortcode( 'shift_log', 'sl_shortcode' );
}

function sl_current_page_url() {
	$url = get_permalink();
	if ( $url ) {
		return $url;
	}
	global $wp;
	return home_url( add_query_arg( array(), isset( $wp->request ) ? $wp->request : '' ) );
}

function sl_shortcode( $atts = array() ) {
	// Remember where the app lives, so approval emails can link straight to it.
	$here = sl_current_page_url();
	if ( $here && get_option( 'sl_app_url' ) !== $here ) {
		update_option( 'sl_app_url', esc_url_raw( $here ), false );
	}

	if ( ! is_user_logged_in() ) {
		return sl_login_gate();
	}

	// Nothing below this line runs — and no scripts are enqueued — until the
	// account holds the logging capability. An unapproved account reaches no
	// data of any kind, its own or anyone else's.
	if ( ! current_user_can( SL_CAP_SUBMIT ) ) {
		return sl_pending_screen();
	}

	sl_enqueue();

	return '<div id="sl-root" class="sl-app"><div class="sl-wrap"><div class="sl-empty">Opening your log&hellip;</div></div></div>';
}

function sl_pending_screen() {
	sl_enqueue_styles();

	$user    = wp_get_current_user();
	$waiting = in_array( 'shift_log_pending', (array) $user->roles, true );

	ob_start();
	?>
	<div class="sl-app">
		<div class="sl-wrap sl-authwrap">
			<div class="sl-authhead">
				<?php echo sl_logo( 62, 'Private log' ); ?>
			</div>
			<div class="sl-card">
				<?php if ( $waiting ) : ?>
					<p class="sl-eyebrow">Waiting for approval</p>
					<p>Your account has been created and an administrator has been notified. Until they approve it, the log stays closed — you won't be able to add tickets or see any figures, yours or anyone else's.</p>
					<p class="sl-fn" style="margin-top:14px">You'll get an email as soon as it's active. The name you gave when signing up is deleted at that point, and from then on your account appears to everyone else only as <strong><?php echo esc_html( sl_get_handle( $user->ID ) ); ?></strong>.</p>
				<?php else : ?>
					<p class="sl-eyebrow">No logging access</p>
					<p>You're signed in, but this account hasn't been given logging access. Ask an administrator to add you to the Shift Log Member role.</p>
				<?php endif; ?>
				<div class="sl-foot" style="margin-top:20px">
					<a class="sl-link" href="<?php echo esc_url( wp_logout_url( sl_current_page_url() ) ); ?>">Sign out</a>
				</div>
			</div>
		</div>
	</div>
	<?php
	return ob_get_clean();
}

function sl_login_gate() {
	sl_enqueue_styles();

	$view  = ( isset( $_GET['sl_view'] ) && 'join' === $_GET['sl_view'] ) ? 'join' : 'in';
	$error = isset( $_GET['sl_error'] ) ? sanitize_key( wp_unslash( $_GET['sl_error'] ) ) : '';
	$here  = sl_current_page_url();
	$mode  = sl_reg_mode();

	// With sign-ups closed there is nothing to switch to, so do not offer the tab.
	if ( 'off' === $mode ) {
		$view = 'in';
	}

	ob_start();
	?>
	<div class="sl-app">
		<div class="sl-wrap sl-authwrap">
			<div class="sl-authhead">
				<?php echo sl_logo( 62, 'Private log' ); ?>
				<p class="sl-sub">Your own private log, plus a shared view of how the whole house is doing. Your tickets are visible only to you.</p>
			</div>

			<div class="sl-card">
				<?php if ( 'off' !== $mode ) : ?>
					<div class="sl-switch" role="tablist">
						<a class="sl-switchlink" role="tab" aria-selected="<?php echo 'in' === $view ? 'true' : 'false'; ?>"
							href="<?php echo esc_url( remove_query_arg( array( 'sl_view', 'sl_error' ), $here ) ); ?>">Sign in</a>
						<a class="sl-switchlink" role="tab" aria-selected="<?php echo 'join' === $view ? 'true' : 'false'; ?>"
							href="<?php echo esc_url( add_query_arg( 'sl_view', 'join', $here ) ); ?>">Create account</a>
					</div>
				<?php endif; ?>

				<?php if ( $error ) : ?>
					<p class="sl-err"><?php echo esc_html( sl_reg_error_text( $error ) ); ?></p>
				<?php endif; ?>

				<?php if ( 'join' === $view ) : ?>

					<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" autocomplete="on">
						<input type="hidden" name="action" value="sl_register" />
						<?php wp_nonce_field( 'sl_register', 'sl_reg_nonce' ); ?>

						<?php if ( ! sl_auto_approve() ) : ?>
							<div class="sl-field">
								<label class="sl-label" for="sl-reg-name">Your name</label>
								<input class="sl-input" id="sl-reg-name" type="text" name="sl_name" required maxlength="100" autocomplete="name" />
								<p class="sl-fn">Only so the administrator can confirm the request is from someone they're expecting. It's deleted the moment your account is approved, and it's never shown to anyone else using the log.</p>
							</div>
						<?php endif; ?>

						<div class="sl-field">
							<label class="sl-label" for="sl-reg-email">Email address</label>
							<input class="sl-input" id="sl-reg-email" type="email" name="sl_email" required autocomplete="email" />
							<p class="sl-fn">Used for signing in and for password resets. It is never shown to anyone else using the log.</p>
						</div>

						<?php if ( 'code' === $mode ) : ?>
							<div class="sl-field">
								<label class="sl-label" for="sl-reg-code">Access code</label>
								<input class="sl-input sl-mono" id="sl-reg-code" type="text" name="sl_code" required autocomplete="off" />
								<p class="sl-fn">Whoever invited you has this.</p>
							</div>
						<?php endif; ?>

						<div class="sl-field">
							<label class="sl-label" for="sl-reg-pw">Password</label>
							<input class="sl-input" id="sl-reg-pw" type="password" name="sl_password" required minlength="12" autocomplete="new-password" />
							<p class="sl-fn">At least 12 characters. Please do not reuse a password from anywhere else.</p>
						</div>

						<div class="sl-field">
							<label class="sl-label" for="sl-reg-pw2">Confirm password</label>
							<input class="sl-input" id="sl-reg-pw2" type="password" name="sl_password2" required minlength="12" autocomplete="new-password" />
						</div>

						<?php /* Hidden from people, irresistible to bots. */ ?>
						<div class="sl-hp" aria-hidden="true">
							<label>Website<input type="text" name="sl_website" tabindex="-1" autocomplete="off" /></label>
						</div>

						<button type="submit" class="sl-save sl-full">Create account</button>
					</form>

					<p class="sl-fn" style="margin-top:16px">
						<?php if ( sl_auto_approve() ) : ?>
							You'll be signed in straight away.
						<?php else : ?>
							Every account is reviewed before it goes live. You'll get an email once yours is approved; until then the log stays closed.
						<?php endif; ?>
					</p>

				<?php else : ?>

					<?php
					wp_login_form( array(
						'redirect'       => esc_url( $here ),
						'label_username' => __( 'Email or username', 'shift-log' ),
						'label_password' => __( 'Password', 'shift-log' ),
						'label_log_in'   => __( 'Sign in', 'shift-log' ),
						'remember'       => true,
					) );
					?>
					<div class="sl-foot" style="margin-top:18px">
						<a class="sl-link" href="<?php echo esc_url( wp_lostpassword_url( $here ) ); ?>">Forgot your password?</a>
						<?php if ( 'off' !== $mode ) : ?>
							<a class="sl-link" href="<?php echo esc_url( add_query_arg( 'sl_view', 'join', $here ) ); ?>">Need an account?</a>
						<?php endif; ?>
					</div>

				<?php endif; ?>
			</div>

			<?php if ( ! is_ssl() ) : ?>
				<div class="sl-warn"><strong>This page is not encrypted</strong>Your password would travel in the clear. Do not sign in or sign up until the site is served over HTTPS.</div>
			<?php endif; ?>
		</div>
	</div>
	<?php
	return ob_get_clean();
}

function sl_enqueue_styles() {
	// The three typefaces ship with the plugin and are loaded by the stylesheet
	// itself. They used to come from Google Fonts, which meant an outside
	// company was told every time somebody opened their log.
	wp_enqueue_style( 'sl-app', SL_URL . 'assets/shift-log.css', array(), SL_VERSION );
}

function sl_enqueue() {
	sl_enqueue_styles();

	wp_enqueue_script( 'sl-app', SL_URL . 'assets/shift-log.js', array(), SL_VERSION, true );

	$uid = get_current_user_id();

	wp_localize_script( 'sl-app', 'SL_DATA', array(
		'root'       => esc_url_raw( rest_url( SL_NS ) ),
		// Cookie-authenticated REST calls need this header; it is also the
		// CSRF defence for every write.
		'nonce'      => wp_create_nonce( 'wp_rest' ),
		'handle'     => sl_get_handle( $uid ),
		'canHouse'   => current_user_can( SL_CAP_HOUSE ),
		'logoutUrl'  => wp_logout_url( sl_current_page_url() ),
		'accountUrl' => admin_url( 'profile.php' ),
		'currency'   => get_option( 'sl_currency', 'USD' ),
		/* The limo rates ride along with the page so the figures can be
		   worked out in the browser from tickets it already holds — which
		   means every ticket ever logged is counted, with nothing to
		   backfill and no second pass over the table. */
		'limoCut'    => (float) sl_limo_cut(),
		'limoShare'  => (float) sl_limo_share(),
		'bugs'       => '1' === get_option( 'sl_bug_widget', '1' ),
		/* The shift you are on is sent with the page rather than fetched
		   after it. Whether you are in house is the first thing the log
		   says, and it should be right on the first paint rather than
		   flipping a second later — or, if the network is poor, not at all. */
		'tour'       => array(
			'open'     => sl_tour_open( $uid ),
			'history'  => sl_tour_history_complete( $uid ),
			'progress' => sl_tour_progress( $uid ),
		),
	) );
}

<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Themes wrap page content in a narrow container — usually 700–900px — which
 * is what squeezes the app into a long column. Two remedies here, either of
 * which is enough on its own:
 *
 *   1. A page template the plugin registers, selectable in the page editor.
 *      It keeps the theme's header and footer but drops the constraining
 *      content wrapper. This is the clean route.
 *
 *   2. A body class plus a viewport breakout in CSS, applied automatically to
 *      any page holding the shortcode. This works without changing the
 *      template, which matters on themes that hide the template picker.
 */

const SL_TEMPLATE = 'shift-log-full-width.php';

/** Does the page being rendered actually contain the app? */
function sl_page_has_app( $post = null ) {
	$post = $post ? $post : get_post();
	if ( ! $post || ! isset( $post->post_content ) ) {
		return false;
	}
	return has_shortcode( $post->post_content, 'shift_log' );
}

function sl_fullwidth_enabled() {
	return '1' === get_option( 'sl_fullwidth', '1' );
}

/* ---------------- page template ---------------- */

add_filter( 'theme_page_templates', 'sl_register_template' );
function sl_register_template( $templates ) {
	$templates[ SL_TEMPLATE ] = __( 'Shift Log — full width', 'shift-log' );
	return $templates;
}

add_filter( 'template_include', 'sl_use_template' );
function sl_use_template( $template ) {
	if ( is_singular() && SL_TEMPLATE === get_page_template_slug( get_queried_object_id() ) ) {
		$file = SL_DIR . 'templates/full-width.php';
		if ( file_exists( $file ) ) {
			return $file;
		}
	}
	return $template;
}

/* ---------------- body class ---------------- */

add_filter( 'body_class', 'sl_body_class' );
function sl_body_class( $classes ) {
	if ( is_singular() && sl_page_has_app() ) {
		$classes[] = 'sl-has-app';
		// The breakout is only wanted when the theme's own container is still
		// in play; the plugin's template already removes it.
		if ( sl_fullwidth_enabled() && SL_TEMPLATE !== get_page_template_slug( get_queried_object_id() ) ) {
			$classes[] = 'sl-breakout';
		}
	}
	return $classes;
}

/* ----------------------------------------------------------------
   Some themes render the content area at a fixed width via inline
   styles or a utility class that CSS alone can't reach. Stripping the
   theme's wrapper is not safe to do generically, so instead the
   stylesheet neutralises the most common container patterns only on
   pages carrying the sl-has-app class.
   ---------------------------------------------------------------- */

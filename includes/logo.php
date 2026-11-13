<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * The seal.
 *
 * A wax-stamp seal: a script S in brass on a deep ink disc, ringed by a
 * hairline. The letterform carries the softness; the solid disc carries the
 * weight. An earlier draft used a pointed oval with a centre dot — it read as
 * an eye, which is the last thing a privacy-first log should suggest.
 *
 * Colours come from the stylesheet via class names rather than fills, so the
 * mark inherits the palette anywhere it is placed.
 *
 * The identical markup is mirrored in assets/shift-log.js for the app header;
 * keep the two in step if the shape changes.
 */
/**
 * A single-hue metal gradient: highlight, midtone, shadow and a specular band.
 * A flat fill reads as yellow; this reads as gold.
 */
function sl_metal_defs() {
	return '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>'
		. '<linearGradient id="slMetal" x1="0" y1="0" x2="1" y2="1">'
		. '<stop offset="0%" stop-color="#fdf3d6"/><stop offset="14%" stop-color="#e3c374"/>'
		. '<stop offset="30%" stop-color="#a97c1c"/><stop offset="46%" stop-color="#f6e6ae"/>'
		. '<stop offset="58%" stop-color="#d9b64f"/><stop offset="74%" stop-color="#8a6318"/>'
		. '<stop offset="88%" stop-color="#c9a227"/><stop offset="100%" stop-color="#f0dc9a"/>'
		. '</linearGradient>'
		. '<linearGradient id="slRim" x1="1" y1="0" x2="0" y2="1">'
		. '<stop offset="0%" stop-color="#f7e7b8"/><stop offset="35%" stop-color="#8a6318"/>'
		. '<stop offset="62%" stop-color="#e3c374"/><stop offset="100%" stop-color="#6f4e11"/>'
		. '</linearGradient>'
		. '<radialGradient id="slWell" cx="34%" cy="28%" r="78%">'
		. '<stop offset="0%" stop-color="#2a2320"/><stop offset="55%" stop-color="#161312"/>'
		. '<stop offset="100%" stop-color="#0b0a0a"/>'
		. '</radialGradient>'
		. '<linearGradient id="slShine" x1="0" y1="0" x2="1" y2="0">'
		. '<stop offset="0%" stop-color="#fff" stop-opacity="0"/>'
		. '<stop offset="45%" stop-color="#fff" stop-opacity=".55"/>'
		. '<stop offset="55%" stop-color="#fff" stop-opacity=".55"/>'
		. '<stop offset="100%" stop-color="#fff" stop-opacity="0"/>'
		. '</linearGradient>'
		. '<filter id="slSoft" x="-30%" y="-30%" width="160%" height="160%">'
		. '<feGaussianBlur stdDeviation="0.7"/></filter>'
		. '</defs></svg>';
}

/**
 * The seal, struck rather than drawn.
 *
 * Identical to logoMark() in assets/shift-log.js — the app header and the
 * sign-in page have to show the same mark, so any change to the shape belongs
 * in both. The inner parts are named sl-lm-* because sl-ring is also the rate
 * ring on My insights.
 */
function sl_logo_mark( $size = 40, $animate = false ) {
	$s   = (int) $size;
	$path = 'M30.4 16.1C30.4 11.2 18.6 11.3 18.6 17.6C18.6 22.9 29.4 23.5 29.4 29.4C29.4 35.6 17.6 35.6 17.6 30.5';
	$cls = 'sl-logomark' . ( $animate ? ' is-striking' : '' );

	return '<svg class="' . esc_attr( $cls ) . '" width="' . $s . '" height="' . $s . '"'
		. ' viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">'
		. '<circle class="sl-lm-rim" cx="24" cy="24" r="22.4" stroke-width="1.6"/>'
		. '<circle class="sl-lm-rimlite" cx="24" cy="24" r="21.3" stroke-width="0.5"/>'
		. '<circle class="sl-lm-face" cx="24" cy="24" r="20.6"/>'
		. '<circle class="sl-lm-well" cx="24" cy="24" r="20.6" filter="url(#slSoft)" stroke-width="1.4"/>'
		. '<circle class="sl-lm-line" cx="24" cy="24" r="17.6" stroke-width="0.45"/>'
		. '<path class="sl-lm-cut" d="' . $path . '" stroke-width="3.1" stroke-linecap="round" transform="translate(0 .9)"/>'
		. '<path class="sl-lm-letter" d="' . $path . '" stroke-width="2.6" stroke-linecap="round"/>'
		. '<path class="sl-lm-spec" d="M8.6 16.2A18 18 0 0 1 24 5.6" stroke-width="1.5" stroke-linecap="round"/>'
		. '<path class="sl-lm-shine" d="' . $path . '" stroke-width="2.6" stroke-linecap="round"/>'
		. '</svg>';
}

/** Full lockup: seal, wordmark, and the line beneath it. */
function sl_logo( $size = 56, $tagline = 'Private log' ) {
	$out  = sl_metal_defs();
	$out .= '<div class="sl-logo">';
	$out .= sl_logo_mark( $size, true );
	$out .= '<div><p class="sl-wordmark">Shift <em>Log</em></p>';
	if ( $tagline ) {
		$out .= '<p class="sl-tagline">' . esc_html( $tagline ) . '</p>';
	}
	$out .= '</div></div>';
	return $out;
}

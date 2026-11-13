<?php
/**
 * Shift Log — full width page template.
 *
 * Keeps the theme's header and footer so the site still looks like itself,
 * but renders the page content edge to edge instead of inside the theme's
 * narrow container. Selected per page under Page Attributes → Template.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

get_header();
?>

<div id="sl-fullpage" class="sl-fullpage">
	<?php
	while ( have_posts() ) :
		the_post();
		the_content();
	endwhile;
	?>
</div>

<?php
get_footer();

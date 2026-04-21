/**
 * Navigation toggle for mobile
 */
( function() {
    const toggle = document.querySelector( '.menu-toggle' );
    const nav = document.querySelector( '.main-navigation' );

    if ( ! toggle || ! nav ) return;

    // Show toggle on mobile
    function checkMobile() {
        if ( window.innerWidth <= 768 ) {
            toggle.style.display = 'block';
        } else {
            toggle.style.display = 'none';
            nav.style.display = '';
        }
    }

    toggle.addEventListener( 'click', function() {
        const expanded = toggle.getAttribute( 'aria-expanded' ) === 'true';
        toggle.setAttribute( 'aria-expanded', ! expanded );
        nav.style.display = expanded ? 'none' : 'block';
    } );

    window.addEventListener( 'resize', checkMobile );
    checkMobile();
} )();

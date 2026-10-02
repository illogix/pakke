const paths = {
    left:'<path d="M9 4H4v5M4 4l6 6a5 5 0 0 1 0 7H7"/><path d="M15 4h5v5" opacity=".35"/>',
    right:'<path d="M15 4h5v5m0-5-6 6a5 5 0 0 0 0 7h3"/><path d="M9 4H4v5" opacity=".35"/>',
    flip:'<path d="M12 3v18M8 6 3 18h5V6Zm8 0 5 12h-5V6Z"/>',
    restart:'<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
    puzzles:'<rect x="4" y="4" width="6" height="6" rx="1.3"/><rect x="14" y="4" width="6" height="6" rx="1.3"/><rect x="4" y="14" width="6" height="6" rx="1.3"/><rect x="14" y="14" width="6" height="6" rx="1.3"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .2c0 1.8-2.5 2-2.5 4M12 17h.01"/>',
    reframe:'<path d="M9 3v6H3m12-6v6h6M9 21v-6H3m12 6v-6h6"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    next:'<path d="m9 5 7 7-7 7"/>',
    home:'<path d="m3 11 9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
    play:'<path d="m8 4 12 8-12 8Z"/>',
    settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    minus:'<path d="M5 12h14"/>'
};
export function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]??paths.help}</svg>`; }
export function iconButton(name,label,run) {
    const b=document.createElement('button');b.type='button';b.className='icon-button';b.innerHTML=icon(name);
    b.setAttribute('aria-label',label);b.title=label;b.addEventListener('click',run);return b;
}

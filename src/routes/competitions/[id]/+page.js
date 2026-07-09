// Competition detail page is dynamic — the id is only known at
// runtime after a user clicks Open on the list. Static export
// can't prerender it.
export const prerender = false;
export const ssr = false;

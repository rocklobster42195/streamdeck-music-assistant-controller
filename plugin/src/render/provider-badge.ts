/** A dark round badge centered at (cx, cy) with a service logo inside (logo = inline SVG, see ma/provider-icons). */
export function providerBadge(cx: number, cy: number, r: number, logo: string): string {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#101010" opacity="0.8"/>${logo}`;
}

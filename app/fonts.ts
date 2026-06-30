import { Anton, Montserrat } from 'next/font/google';

// Display: heavy condensed face for oversized brutalist headlines.
export const anton = Anton({
    weight: '400',
    subsets: ['latin'],
    variable: '--font-display',
    display: 'swap',
});

// Body / UI: geometric sans, readable at every size.
export const montserrat = Montserrat({
    weight: ['400', '500', '600', '700', '800'],
    subsets: ['latin'],
    variable: '--font-body',
    display: 'swap',
});
